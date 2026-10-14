# Cross-System Architecture: Defra Grant Workflow Ecosystem

**Status**: Explanatory document (DIVIO/Diataxis type: Explanation)  
**Audience**: Technical and non-technical staff involved in grant administration workflows  
**Date**: 2026-05-26  
**Scope**: How GAS (`fg-gas-backend`), CW (`fg-cw-backend`), Agreements Service, and grants-ui collaborate to take a grant application from submission to decision.

---

## Table of Contents

1. [Overview: What This Document Explains](#overview)
2. [System Boundaries: Who Owns What](#system-boundaries)
3. [Event Channels: How They Talk](#event-channels)
4. [The Asymmetric Coupling Fact](#asymmetric-coupling)
5. [The Anti-Mirror Principle](#anti-mirror)
6. [Real-World Incidents: Lessons Learned](#incidents)
7. [Reference Appendix: Schema Constraints](#reference-appendix)

---

## Overview: What This Document Explains {#overview}

This document exists to answer the question: **"Why is the architecture the way it is?"**

At its core, the Defra grant workflow is a conversation between four independent systems. Each system owns a distinct document type and lifecycle, yet they must synchronise state as the applicant's journey progresses. That conversation happens via event channels — asynchronous messages over a message bus. This design enables systems to evolve independently while remaining loosely coupled.

However, the coupling is **not symmetric**. One direction (GAS → CW) is verbatim position propagation; the other direction (CW → GAS) is selective routing. This asymmetry is load-bearing: it governs which state codes GAS must maintain, and which states CW can have without GAS knowing. Understanding this asymmetry prevents the most common class of bug we've seen: applications stuck mid-workflow because a state code exists in one system but not the other.

By the end of this document, you will understand:

1. **Who owns what** — each system's bounded context and the document it manages
2. **How they talk** — the event channel types and subscription model
3. **The asymmetric coupling** — the two load-bearing architectural facts
4. **Why GAS doesn't mirror every CW state** — the anti-mirror principle and recent real-world examples
5. **How state codes must align** — which codes must exist in both systems

---

## System Boundaries: Who Owns What {#system-boundaries}

Four systems collaborate; each has a clear ownership boundary.

### Grants UI (`grants-ui`)

**Role**: Applicant-facing frontend. Hosted at `/Users/martins/workspace/ee/defra/grants-ui`.

**Owns**: Web form interface, session state, navigation rules per scheme.

**Key files**:
- `/src/server/common/forms/definitions/*.yaml` — per-scheme form definitions (e.g., `woodland.yaml`). Each scheme has a list of **redirect rules** that determine where the applicant goes after each status change.
- `/src/server/status/status-helper.js:36-52` — the `mapStatusToUrl()` function, which matches a redirect rule based on:
  - `fromGrantsStatus`: the applicant's previous UI state (e.g., `"SUBMITTED"`)
  - `gasStatus`: the *status code only* returned from GAS (e.g., `"STATUS_AGREEMENT_OFFERED"`)
  - **Important**: grants-ui reads **only the status code**, not the phase or stage. It does not perform position-by-position matching.

**Example redirect rule** (from `woodland.yaml`, pre-slim-model):
```yaml
- fromGrantsStatus: 'SUBMITTED'
  gasStatus: 'STATUS_AGREEMENT_OFFERED,STATUS_AWAITING_FC,STATUS_COMPLETED'
  toGrantsStatus: 'SUBMITTED'
  toPath: /agreement
```

The comma-separated `gasStatus` list means: "If GAS reports any of these three status codes, redirect to `/agreement`." Grants-ui does not care about the stage or phase.

---

### GAS — Grants Application Service (`fg-gas-backend`)

**Role**: The authoritative source for application state. Hosted at `/Users/martins/workspace/ee/defra/fg-core/fg-gas-backend` and `/Users/martins/workspace/ee/defra/fg-gas-backend`.

**Owns**: 
- The `applications` MongoDB collection — each document represents one submitted application.
- The `grants` MongoDB collection — one document per workflow/scheme (e.g., one doc for "woodland"), containing the state machine definition (phases → stages → statuses), side-effect processes, and **external status map**.

**Key concepts**:

1. **Phase/Stage/Status structure** — The workflow is a three-level hierarchy:
   - **Phase** (e.g., `PHASE_PRE_AWARD`): high-level organizational container
   - **Stage** (e.g., `STAGE_REVIEWING_APPLICATION`): where the case currently is
   - **Status** (e.g., `STATUS_APPLICATION_RECEIVED`): a substate within the stage

   An application's position is always a three-tuple: `PHASE:STAGE:STATUS`.

2. **`externalStatusMap`** — A routing table that tells GAS which external events (from CW or AS) to subscribe to, and what internal state to transition to when they arrive. Structured as:
   ```json
   {
     "externalStatusMap": {
       "phases": [
         {
           "code": "PHASE_PRE_AWARD",
           "stages": [
             {
               "code": "STAGE_REVIEWING_APPLICATION",
               "statuses": [
                 {
                   "code": "PHASE_PRE_AWARD:STAGE_REVIEWING_APPLICATION:STATUS_AGREEMENT_GENERATING",
                   "source": "CW",
                   "mappedTo": "PHASE_PRE_AWARD:STAGE_REVIEWING_APPLICATION:STATUS_AGREEMENT_GENERATING"
                 }
               ]
             }
           ]
         }
       ]
     }
   }
   ```

3. **`validFrom` rules** — For each status, a list of allowed source statuses. Acts as a second gate: even if `externalStatusMap` says to transition to a target status, the target status's `validFrom` must accept the current status. This is where side-effect processes (`GENERATE_OFFER`, `STORE_AGREEMENT_CASE`, `ACCEPT_AGREEMENT`) are declared.

**Key files**:
- `/src/grants/models/grant.js:69-91` — `mapExternalStateToInternalState()`: takes an inbound external event code and returns the target internal state.
- `/src/grants/models/grant.js:158-182` — `isValidTransition()`: checks that the target status's `validFrom` accepts the current status, and extracts side-effect processes.
- `/src/grants/services/apply-event-status-change.service.js` — consumes inbox events and orchestrates the routing + validation logic.
- `/src/grants/repositories/inbox.repository.js`, `/src/grants/subscribers/inbox.subscriber.js` — the inbox/outbox pattern implementation.
- `/src/grants/events/application-status-updated.event.js` — the outbound event GAS emits after every state change.
- `/src/grants/schemas/grant/code.js` — grant code validation: `^[a-z0-9-]+$` (kebab-case, lowercase).
- `/src/grants/schemas/grant/phases.js`, `external-status-map.js` — schema validation for workflow definitions.

---

### CW — Caseworking System (`fg-cw-backend`)

**Role**: Case management system for internal staff (caseworkers). Hosted at `/Users/martins/workspace/ee/defra/fg-core/fg-cw-backend` and `/Users/martins/workspace/ee/defra/fg-cw-backend`.

**Owns**:
- The `cases` MongoDB collection — each document represents a case (a case-managed view of an application). Contains workflow position, timeline, comments, and task state.
- The `workflows` MongoDB collection — one document per caseworker workflow definition (e.g., "woodland"), containing the full state machine plus task definitions and UI pages.

**Key concepts**:

1. **Workflow structure** — Similar to GAS's phases/stages/statuses, but *richer*:
   - Each status can have **transitions** (rules for moving to the next status, either manually via actions or automatically on external events).
   - Each stage can have **tasks** (work items the caseworker must complete before progressing).
   - Each stage can have **actions** (buttons the caseworker can click to trigger state transitions).
   - The workflow also defines **pages** — UI layouts for caseworker screens.

2. **Status codes in CW** — CW has more states than GAS. For example, in the woodland slim model:
   - CW keeps `STATUS_APPLICATION_IN_REVIEW` (was `STATUS_IN_REVIEW` before the naming pass)
   - CW keeps `STATUS_APPLICATION_AWAITING_FC` (was `STATUS_AWAITING_FC` before the naming pass)
   - GAS does *not* keep these (see the "anti-mirror" section below for why).

**Key files**:
- `/src/cases/models/case.js#progressTo()` — applies a state transition to a case.
- `/src/cases/subscribers/inbox.subscriber.js` — consumes `application.status.updated` events from GAS. Routes them via `useCaseMap` to the appropriate case-progression logic.
- `/src/cases/use-cases/progress-case.use-case.js` — business logic for transitioning a case.
- `/src/cases/schemas/workflow.schema.js` — workflow definition validation.
- `/src/cases/schemas/task.schema.js:12` — task code validation: `^[A-Z0-9_]+$` (SCREAMING_SNAKE_CASE, strict in CW).
- `/docs/agent/workflow-definitions.md` — agent-oriented reference on how CW workflows are structured.

---

### Agreements Service (`farming-grants-agreements-api`)

**Role**: Manages the legal agreement document. Hosted at `/Users/martins/workspace/ee/defra/farming-grants-agreements-api`.

**Owns**: The agreement document and its lifecycle (drafted, offered, accepted, signed).

**Key concepts**:

1. **Lifecycle events** — AS emits `io.onsite.agreement.status.updated` events with payloads:
   - `status: "offered"` — agreement is ready for applicant signature
   - `status: "accepted"` — applicant has signed
   - Others (rejected, superseded, etc.)

2. **Inbound commands** — GAS sends commands to AS (not via events, but via direct service-to-service calls) when a side-effect process fires. Example: when GAS transitions to `STATUS_AGREEMENT_GENERATING`, the `GENERATE_OFFER` process sends a `createAgreement` command to AS.

---

## Event Channels: How They Talk {#event-channels}

Three named event types form the cross-system conversation:

| Event Type | Producer | Consumer | Trigger |
|---|---|---|---|
| `application.status.updated` | GAS | CW (and others) | GAS state change. Emitted after every transition. |
| `cloud.defra.{env}.fg-cw-backend.case.status.updated` or `cloud.defra.{env}.fg-cw-backend.case.update.status` | CW | GAS | Caseworker action (e.g., `ACTION_APPROVE_APPLICATION`). CW broadcasts every state change. |
| `io.onsite.agreement.status.updated` | AS | GAS | Agreement lifecycle change (offered, accepted, etc.). |

**Implementation**: Inbox/outbox pattern. Each service has:
- An `inbox` collection — received events waiting to be processed.
- An `outbox` collection — events to be published. A poller reads from outbox and posts to the message bus.
- A subscriber — consumes messages from the message bus and writes them to inbox.
- A consumer — polls inbox and processes each event.

All three services follow this pattern. Failures retry up to 5 times before being dead-lettered (moved to a dead-letter state).

### Why This Pattern?

Inbox/outbox ensures **exactly-once delivery** semantics even if a service crashes during processing. The event is only marked as processed after the business logic completes and the state change is persisted. If the service crashes, the next startup picks up the unprocessed event from inbox and tries again.

---

## The Asymmetric Coupling Fact {#asymmetric-coupling}

This is the most important conceptual insight in the architecture. **The coupling between GAS and CW is asymmetric**: the two directions have different rules and implications.

### CW → GAS: Selective Routing

When CW publishes an event (e.g., `case.status.updated` with `currentStatus = "STATUS_APPLICATION_IN_REVIEW"`), GAS does *not* automatically subscribe. Instead, GAS's `externalStatusMap` acts as a filter.

GAS will only process a CW event if there is an entry in `externalStatusMap` matching both:
1. **Current stage** — GAS's current position (e.g., `STAGE_REVIEWING_APPLICATION`)
2. **Event code** — the CW status code (e.g., `STATUS_APPLICATION_IN_REVIEW`)

If there is no matching entry, GAS **ignores the event** (or, in earlier code, threw an error and dead-lettered it).

**Implication**: CW can have states that GAS doesn't care about. CW can add new statuses without breaking GAS as long as GAS's `externalStatusMap` doesn't route them.

**Example**: CW has `STATUS_APPLICATION_IN_REVIEW`. GAS does not route this event in woodland's current `externalStatusMap`. Therefore:
- CW transitions to `STATUS_APPLICATION_IN_REVIEW` when a caseworker clicks "Start Review".
- GAS ignores the event and remains in `STATUS_APPLICATION_RECEIVED`.
- Applicant sees no change in status (grants-ui only reads GAS's status).
- Caseworkers see the change in their CW interface.

### GAS → CW: Verbatim Position Propagation

When GAS publishes an event (e.g., `application.status.updated` with `position = "PHASE_PRE_AWARD:STAGE_REVIEWING_APPLICATION:STATUS_AGREEMENT_GENERATING"`), CW *does* automatically apply it.

CW's inbox subscriber receives the event, extracts the position, and directly applies it to the case. CW looks up the stage code in its own workflow definition and transitions the case to that stage/status. **It does not check whether the stage exists first; it assumes it does.**

If the stage code does *not* exist in CW's workflow, the apply fails with `Error: Stage with code "X" not found`. The inbox event retries 5 times, then dead-letters.

**Implication**: **Every stage code that GAS can publish must also exist in CW's workflow definition.** Even if CW doesn't use it (no tasks, no actions, no transitions), the code must be defined.

**Example**: If GAS publishes `STAGE_AGREEMENT_ACCEPTED`, CW's workflow must have a stage with code `STAGE_AGREEMENT_ACCEPTED`. If CW's workflow says `STAGE_FORWARDING_TO_FC` instead, the apply fails.

### The Load-Bearing Lesson

This asymmetry creates a critical invariant:

```
Every stage code that GAS can reach must also exist in CW's workflow.
Conversely, CW can have stages that GAS never reaches.
```

This is why the slim-gas-workflow-proposal document was so careful about naming. When GAS renamed `STAGE_FORWARD_TO_FC` to `STAGE_AGREEMENT_ACCEPTED`, CW *had to* rename its corresponding stage as well. Forgetting to do so would break every application mid-workflow.

---

## The Anti-Mirror Principle {#anti-mirror}

GAS does not need to mirror every state in CW. The slim-gas-workflow-proposal document removed several cosmetic states from GAS while keeping them in CW. This section explains why and provides real-world examples.

### Why Not Mirror?

GAS's job is to:
1. Mirror selected external state changes (from CW and AS) into its own model.
2. Fire side-effect processes at key business moments.
3. Provide status codes that external consumers (grants-ui, data exports) care about.

States that do none of these three things are candidates for removal. Examples:

- **`STATUS_IN_REVIEW`** — CW's caseworker clicks "Start Review", transitioning the case to `STATUS_IN_REVIEW`. GAS has no side-effect on this transition. Grants-ui doesn't need this status code. Therefore, GAS doesn't need to track it. Removal: CW keeps it (caseworkers see it), GAS drops it (externalStatusMap has an explicit ignore entry).

- **`STATUS_AWAITING_FC`** — CW's caseworker clicks "Forward to FC", transitioning to `STATUS_AWAITING_FC`. This is a cosmetic mirror of CW's forwarding action. GAS has no side-effect. Grants-ui doesn't need this status code (after the in-flight yaml change). Therefore, GAS doesn't need to track it. Removal: CW keeps it (caseworkers see it), GAS drops it.

- **`STAGE_FC_REVIEW`** — Existed only to hold `STATUS_AWAITING_FC`. Once the status is removed from GAS, the stage is no longer needed. Removal: CW keeps it (FC caseworkers use it), GAS drops it. CW's `STAGE_FC_REVIEWING` (gerund, describes the work) is separate from GAS's eliminated stage.

### Real-World Evidence: Three Incidents

These three bugs demonstrate the anti-mirror principle in action.

#### Incident 1: `wmp-nya-xnb` — GAS Stuck Behind CW

**Symptom**: Application stuck in GAS at `STATUS_AGREEMENT_READY_FOR_APPLICANT` while CW showed `STATUS_AGREEMENT_OFFERED`.

**Root cause**: When CW transitioned to `STATUS_AGREEMENT_OFFERED`, it published an event `case.status.updated`. GAS was at `STAGE_SEND_AGREEMENT_TO_APPLICANT` and tried to route the inbound CW event using `externalStatusMap`. But the map had no entry for `(STAGE_SEND_AGREEMENT_TO_APPLICANT, CW:STATUS_AGREEMENT_OFFERED)`. Result: no route, no transition in GAS.

**Fix**: Add the missing route to `externalStatusMap`:
```json
{
  "code": "STAGE_SEND_AGREEMENT_TO_APPLICANT",
  "statuses": [
    {
      "code": "PHASE_PRE_AWARD:STAGE_SEND_AGREEMENT_TO_APPLICANT:STATUS_AGREEMENT_OFFERED",
      "source": "CW",
      "mappedTo": "STAGE_AGREEMENT_WITH_APPLICANT:STATUS_AGREEMENT_OFFERED"
    }
  ]
}
```

**Lesson**: `externalStatusMap` is stage-indexed. When GAS is in a particular stage, only the routes under that stage are checked. If you add a new CW event that fires while GAS is in a particular stage, you must add a route entry under that stage in the map.

#### Incident 2: `wmp-va7-s2b` — Dead-Lettered Agreement Event

**Symptom**: GAS received `AS:accepted` event while at `STAGE_SEND_AGREEMENT_TO_APPLICANT`. Inbox event dead-lettered after 5 retries.

**Root cause**: Two layers of gates both failed:
1. **`externalStatusMap` route missing**: The `STAGE_SEND_AGREEMENT_TO_APPLICANT` block in the map had no route for `AS:accepted`. No match found; GAS threw an error.
2. **`validFrom` gate missing**: Even if the route existed, it would have been a configuration bug. The route was supposed to target `STAGE_AGREEMENT_WITH_APPLICANT:STATUS_AGREEMENT_OFFERED`. But the `validFrom` rule for that status referenced a source state that didn't exist: `STAGE_SEND_AGREEMENT_TO_APPLICANT:STATUS_AGREEMENT_OFFERED` (wrong stage). The correct source is `STAGE_PREPARING_AGREEMENT:STATUS_AGREEMENT_READY_FOR_APPLICANT` (the newer, renamed stage).

**Fix**: 
1. Add the missing route to `externalStatusMap` under `STAGE_SEND_AGREEMENT_TO_APPLICANT`.
2. Fix the `validFrom` rule to reference the correct source stage.

**Lesson**: There are two gates: routing and validation. Both must pass. If an event is stuck, check both.

#### Incident 3: `wmp-8a9-8fa` — CW Failed to Apply GAS Position

**Symptom**: GAS published `application.status.updated` with position `PHASE_PRE_AWARD:STAGE_AGREEMENT_ACCEPTED:STATUS_AGREEMENT_ACCEPTED`. CW inbox event dead-lettered.

**Root cause**: CW's workflow definition had `STAGE_FORWARDING_TO_FC` at that lifecycle point, not `STAGE_AGREEMENT_ACCEPTED`. When CW tried to look up the stage code `STAGE_AGREEMENT_ACCEPTED`, it wasn't found. Apply failed.

**Fix**: Rename CW's stage to match GAS's: `STAGE_AGREEMENT_ACCEPTED`.

**Lesson**: The asymmetric coupling: GAS → CW is verbatim. If GAS publishes a stage code, CW's workflow must have that exact code.

---

## Reference Appendix: Schema Constraints {#reference-appendix}

This section documents the formal constraints on workflow element codes. Enforce these in schema validation and in code review.

### Character Set Rules

**Workflow and grant codes** (the top-level identifier, e.g., `"woodland"`):
- Format: kebab-case, lowercase, alphanumeric
- Regex: `^[a-z0-9-]+$`
- Examples: `woodland`, `frps-private-beta`, `grassland`
- Enforced in: `fg-gas-backend/src/grants/schemas/grant/code.js`

**All state and action codes** (phase, stage, status, action, process, task, statusOption):
- Format: SCREAMING_SNAKE_CASE, alphanumeric
- Regex: `^[A-Z0-9_]+$`
- Examples: `PHASE_PRE_AWARD`, `STAGE_REVIEWING_APPLICATION`, `STATUS_APPLICATION_RECEIVED`, `ACTION_APPROVE_APPLICATION`
- Enforced in: `fg-cw-backend/src/cases/schemas/task.schema.js:12` (strict in CW); conventional (not validated) in GAS

### Required Fields per Element

| Element | Required Fields | Notes |
|---|---|---|
| Phase | `code`, `name`, `description`, `stages[]` | Must have at least one stage |
| Stage | `code`, `name`, `description`, `statuses[]` | Must have at least one status |
| Status | `code`, `validFrom[]` | `validFrom` may be empty (entry point) |
| Status validFrom entry | `code`, `processes[]` | `processes` may be empty (no side-effects) |
| Transition | `target`, `action` (optional) | Action is optional (event-driven transitions exist) |
| Task | `code`, `name`, `statusOptions[]` | At least one status option |
| Task status option | `code`, `label` | The outcome of completing a task |

### External Status Map Structure

The `externalStatusMap` routes inbound external events (source, code) to internal target states.

```json
{
  "externalStatusMap": {
    "phases": [
      {
        "code": "PHASE_PRE_AWARD",
        "stages": [
          {
            "code": "STAGE_REVIEWING_APPLICATION",
            "statuses": [
              {
                "code": "PHASE_PRE_AWARD:STAGE_REVIEWING_APPLICATION:STATUS_AGREEMENT_GENERATING",
                "source": "CW",
                "mappedTo": "PHASE_PRE_AWARD:STAGE_REVIEWING_APPLICATION:STATUS_AGREEMENT_GENERATING"
              }
            ]
          }
        ]
      }
    ]
  }
}
```

**Fields**:
- `code` (in statuses array) — The inbound event code. Format depends on source:
  - From CW: fully qualified `PHASE:STAGE:STATUS` (the position CW emits).
  - From AS: simple code (e.g., `"offered"`, `"accepted"`).
- `source` — `"CW"` or `"AS"` (or other system name).
- `mappedTo` — The target internal position. May be:
  - Fully qualified: `"PHASE:STAGE:STATUS"`
  - Stage-relative: `"::STATUS"` (keep current phase and stage, change status only)
  - Status-only: `"STATUS"` (keep current phase and stage)
  - `null` with `"ignore": true` — Explicitly ignore this event (log and continue).

**Stage indexing**: Routes are organized under the stage where they apply. If GAS is in `STAGE_REVIEWING_APPLICATION`, only routes under that stage block are checked. To handle an external event while in a different stage, you must add a route entry under the current stage, not the target stage.

---

## See Also

- `/Users/martins/workspace/ee/defra/fg-grants-core/docs/adr/slim-gas-workflow-proposal.md` — The worked example: woodland's transition from 8 statuses to 6, with migration strategy.
- `/Users/martins/workspace/ee/defra/fg-grants-core/docs/naming-conventions.md` — Deep dive into state naming rules (stative vs. imperative, subject-first policy, lessons from incidents).
- `/Users/martins/workspace/ee/defra/fg-grants-core/docs/agent/naming-conventions.md` — Agent-oriented summary of naming rules.
- `/Users/martins/workspace/ee/defra/fg-cw-backend/docs/agent/workflow-definitions.md` — CW workflow structure and runtime semantics.
- `/Users/martins/workspace/ee/defra/fg-cw-backend/docs/creating-workflow-definitions.md` — How-to guide for authoring CW workflows (note: the "update via updateOne with dot-notation" guidance is now disputable; we use delete+insert).
- `/Users/martins/workspace/ee/defra/fg-grants-core/docs/state-flow-gas-cw.md` — **Known issue**: Contains stale state codes (`STATUS_IN_REVIEW`, `STAGE_FORWARD_TO_FC`, etc.). A forthcoming doc will rewrite this.

---

**Document history**:
- 2026-05-26: Initial draft. Cross-system architecture, asymmetric coupling, anti-mirror principle, real incident catalogue.
