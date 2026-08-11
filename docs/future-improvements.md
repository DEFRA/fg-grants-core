# Future Improvements and Open Questions: Defra Grant Workflow Ecosystem

**Status**: Explanation of deferred work and open architectural decisions  
**Audience**: Product owners, engineering leadership, future developers authoring workflows  
**Date**: 2026-05-26  
**Scope**: Things not addressed by the recent cleanup (naming conventions, slim-gas-workflow-proposal, cross-system-architecture); opportunities for tooling and consistency improvements.

---

## What This Document Is

The four-document set (cross-system-architecture, naming-conventions, slim-gas-workflow-proposal, this file) captures the **current settled state** of the Defra grant workflow ecosystem plus the **open questions and deferred improvements** we noticed along the way. 

This document serves product leadership and the next people who maintain or extend the system. It does not make decisions; it surfaces the underlying problems, stakes, and recommended sequencing so you can make informed choices about what to prioritize next.

The most recent cleanup (slim woodland + naming convention alignment) was a necessary foundation. This document answers: "What's left unfinished, and why does it matter?"

---

## 1. Authoring Tooling: Five Structural Options

**Underlying problem**: When you author or amend a grant workflow, you must hand-edit two large JSON documents (GAS grant definition ~400 lines, CW workflow definition ~850 lines) across three repositories, write migrations in each, update per-environment URLs, sometimes touch grants-ui yaml, and test by manual pushing to Mongo. The pain isn't typing JSON. **The pain is keeping three independently-edited artifacts in lock-step without breaking the asymmetric coupling invariant.** The `wmp-8a9-8fa` incident (GAS published a stage code that didn't exist in CW, causing a dead-letter) is a predictable failure mode of the current process.

**Why it matters**: Today, delivering a new workflow costs 3 PRs across two repositories, with manual testing on three Mongo collections and a high chance of incident-class drift. That cost amplifies with each new grant. The team's velocity on new workflows is gated by the coordination tax and the post-deployment debugging.

**Evidence**: The authoring-tooling divergence document (`docs/research/authoring-tooling-options.md`) examined five structurally distinct approaches. This section consolidates that research with explicit recommendations for sequencing.

### Option A: Single-Source TypeScript Projection ("Loom")

**Approach**: One TypeScript file per workflow (`workflows/woodland.ts`) imports a `defineWorkflow()` builder with branded types (`StageCode<"woodland">`, `StatusCode<"woodland"`), declares the phases/stages/statuses/transitions/tasks once, and a build step emits the GAS JSON, CW JSON, and grants-ui yaml. Asymmetric-coupling becomes a compile-time type check: any stage GAS publishes must be reachable in CW's declared set, enforced via TypeScript's `extends` constraint.

**Strengths**: The synchronisation problem becomes structurally impossible — there is one source, not three. Refactors are atomic (VS Code rename-symbol renames everywhere). Plugs into the existing TypeScript/Node stack.

**Weaknesses**: Demands real type-system discipline (1–2 engineer-weeks to get the builder API right, and getting it wrong locks in pain). Naming-convention checks (stative vs. imperative) degrade to lint rules, not true type-level checks. Live preview still requires running the pipeline and reloading the UI.

**Investment**: Small team for ~half a quarter. Probably 4–6 engineer-weeks for a first cut covering woodland + frps-private-beta, plus migration plumbing.

**See**: `docs/research/authoring-tooling-options.md` §4.

### Option B: Visual State-Machine Editor ("Atelier")

**Approach**: A React app (embedded in `fg-grants-core/tools/atelier`) where you drag stages and transitions on a canvas, edit tasks and statuses in side panels, see the workflow live, and export validated GAS + CW JSON. Loads existing JSON files or starts from scratch. Joi schemas from GAS and CW are imported and run live during editing. Save → emits both JSON files into your working tree as a diff.

**Strengths**: The graph problem becomes a graph editor — cognitive load drops for non-developers (BAs, future SMEs). Live Joi validation removes the "JSON-level edits don't validate until ingestion" pain. Discoverable: someone seeing the UI for the first time understands the workflow shape in 30 seconds.

**Weaknesses**: Round-trip safety is hard — maintaining byte-stability when the canonical source is JSON and the UI re-emits is a known failure mode (code-review noise). Doesn't solve the asymmetric-coupling problem; it still produces two separate JSON files. Tasks and pages carry rich UI component trees (text + GDS components), lossy to model in the editor.

**Investment**: Small team for a full quarter, plus ongoing maintenance. Realistically 8–12 engineer-weeks for an MVP that doesn't lose information on round-trip.

**See**: `docs/research/authoring-tooling-options.md` §4.

### Option C: Conversational AI Authoring Agent ("Maven")

**Approach**: A specialised Claude sub-agent that asks the 22 questions from `creating-workflow-definitions.md`, then writes a complete, naming-convention-compliant pair of JSON files plus the migration. The agent is given the architecture + naming docs as context, the woodland fixture as a worked example, and the Joi schemas as constraints.

**Strengths**: Lowest *time-to-first-draft*. A new workflow author goes from "I have a grant spec" to "I have a PR with three files" in a working session. The agent enforces convention by reading the docs. Re-uses infrastructure already in the repo (`.claude/agents/`, `docs/agent/` setup). Marginal cost to get to v1 is low.

**Weaknesses**: LLM drift — an agent that produces *almost* correct output is worse than no agent. Output must be re-validated by Joi + the asymmetric-coupling check on every run, or this option becomes a confidence trap. Doesn't solve the *next-time-someone-edits* problem. "Feedback" is still post-hoc — you see the output after the agent finishes, not as you author. Black-box-ish to junior devs (they get correct output without understanding why).

**Investment**: Weekend hack to v1; small team for a quarter to harden. The first useful version is genuinely a weekend's work. Making it reliably correct enough to trust without manual re-validation is the long tail.

**See**: `docs/research/authoring-tooling-options.md` §4.

### Option D: Schema-Aware Refactoring CLI ("Reshape")

**Approach**: A `wf` CLI at `fg-grants-core/tools/wf` that performs cross-repo atomic refactors. Commands include: `wf rename-stage woodland STAGE_FOO STAGE_BAR` (updates GAS JSON, CW JSON, grants-ui yaml, and generates a migration in lock-step); `wf rename-status`, `wf add-status-ignore`, `wf list-codes`, `wf check-invariants` (the asymmetric-coupling check), `wf gen-migration`. Each command knows where the same identifier lives across artifacts and updates them transactionally. Generated migrations include in-flight case fix-ups (the `bulkWrite` pattern).

**Strengths**: Operates on the existing artifacts — no new source of truth, no projection, no editor. High leverage per line of code; a working `rename-stage` is ~200 lines and removes 70% of incident classes. Composable; `wf check-invariants` can run in CI even if no one uses the rest of the CLI. Generates correct migrations by default.

**Weaknesses**: Only helps with operations the CLI explicitly supports. Creating a new workflow from scratch still means writing 400+ lines of JSON by hand. Without a typed source-of-truth (Option A), the CLI is an agreement across artifacts, not a proof of consistency — someone can hand-edit one file and break the contract (the CLI just helps when you use it). Requires the CLI to be aware of all file formats.

**Investment**: Weekend hack to v1; small team for a few weeks to cover the common operations. An MVP with `rename-stage`, `rename-status`, `check-invariants`, and `gen-migration` is 1–2 engineer-weeks.

**See**: `docs/research/authoring-tooling-options.md` §4.

### Option E: Contract-Test Gate + Linter (No New Authoring Tool)

**Approach**: A CI job (no new authoring surface, just a validation gate) that loads the GAS fixture, the CW fixture, and the grants-ui yaml side-by-side and refuses to merge if any asymmetric-coupling invariants or naming conventions are violated. A shared `@defra/workflow-contract-checker` package exports a single `checkContract(gasDoc, cwDoc, grantsUiYaml)` function that runs existing Joi schemas plus cross-artifact assertions: (1) every stage GAS can reach exists in CW; (2) every status code in grants-ui yaml exists in GAS; (3) every state code matches the naming-convention regex; (4) `externalStatusMap` entries point at codes that actually exist; (5) `validFrom` sources resolve to real states.

**Strengths**: Cheapest path to removing the most-expensive bug class (asymmetric-coupling drift). Doesn't change authoring at all. Composes with any of the other options — Loom, Atelier, Maven, or Reshape can land later, and Linter remains the failsafe. Naming convention enforcement becomes machine-checked rather than convention-checked.

**Weaknesses**: Doesn't help with *authoring effort* at all. Producing the first draft still means 400+ lines of JSON by hand. "Live preview" still doesn't exist. Requires coordination across three repos to install CI jobs.

**Investment**: Weekend hack. The asymmetric-coupling invariant is ~50 lines. Naming regex is ~30 lines. Wiring into three repos' CI is a half-day. Total: 2–4 working days.

**See**: `docs/research/authoring-tooling-options.md` §4.

### Recommended Sequencing: E → D → C (Defer A and B)

**Priority 1 (Weeks 1–2): Ship Option E (Linter)** — The `wmp-8a9-8fa` incident class is happening now. A CI gate that loads all three artifacts and asserts the invariants is buildable in 2–4 days. Until that gate exists, no other tooling decision matters as much. This removes the most-expensive failure mode (discovering at runtime).

**Priority 2 (Weeks 2–4): Ship Option D (Reshape)** — Once Linter exists, Reshape is a thin layer on top. Each `wf rename-stage` command ends with `wf check-invariants` as a built-in step. The CLI takes ~2 engineer-weeks for a useful first cut. By the third workflow change, the team has saved more time than building it cost.

**Priority 3 (Weeks 3–4, optional): Prototype Option C (Maven)** — A freebie worth doing on the side. A weekend's work to scaffold `.claude/agents/workflow-author.md` against the existing docs. Don't elevate it above E or D in priority, but if a curious engineer wants to prototype it, it's low-risk. **Only ship it after Linter (E) exists**, because the agent needs an authoritative validator behind it.

**Don't start A or B yet.** Loom and Atelier are both real products in their own right, each costing a quarter or more. Each has a real chance of producing a worse outcome than nothing (Loom: wrong abstraction locks in pain; Atelier: round-trip noise + maintenance burden). You don't have the data yet to justify that cost — the slim-down was the second workflow ever authored. Wait until workflow 4 or 5, then revisit.

See: `docs/research/authoring-tooling-options.md` §6.

---

## 2. Event Listeners vs `action: null` — CW Workflow Modelling Question

**Underlying problem**: CW's `Status` exposes a single outgoing edge list, `transitions[]`. Two distinct kinds of edge live in it: action-driven (a caseworker clicks a button; carries a command code, comment policy, task gates) and event-driven (an inbound CloudEvent arrives; no caseworker, no UI, no comment). The schema collapses both into one record, distinguished by `action === null`. This is a clarity smell, not a correctness smell — the runtime already takes different code paths in `Case.progressTo()` vs. `Case.updateStageOutcome()`, and the configuration has a load-bearing `action: null` signal that's tribal knowledge.

**Why it matters**: The collapse makes the CW workflow definition harder to read (reviewers have to know that "`action: null` means event-driven") and harder to discover (the event type the listener reacts to is not named in the workflow; it lives in `inbox.subscriber.js:25-29` as a hand-maintained `useCaseMap`). New event-driven transitions require two-place edits (`workflow.json` + subscriber code). The schema is honest about the shape, but the *binding* is split across two artefacts.

**Evidence**: The event-listener DDD analysis (`docs/research/event-listener-design-question.md`) examined three options and recommended a lightweight fix.

### Current State and the Recommended Fix

**Position**: Adopt a **discriminated union** inside the existing `transitions[]` array, plus **make the event type explicit**. Every event-driven transition gets `"kind": "event"` plus `"onEvent": "<event-type>"`. Action-driven transitions get `"kind": "action"`. This makes the two concerns visible in every transition record (a real UL win), keeps the migration small and reversible, removes the load-bearing `action: null` signal, and most importantly *moves the event-type binding from `inbox.subscriber.js` into the workflow definition where it belongs*.

**Example**:
```json
{
  "code": "STATUS_AGREEMENT_GENERATING",
  "interactive": false,
  "transitions": [
    {
      "kind": "event",
      "onEvent": "case.update.status",
      "targetPosition": "PHASE_PRE_AWARD:STAGE_PREPARING_AGREEMENT:STATUS_AGREEMENT_READY_FOR_APPLICANT",
      "checkTasks": false
    },
    {
      "kind": "action",
      "targetPosition": "...",
      "checkTasks": true,
      "action": { "code": "APPROVE", "name": "Approve", ... }
    }
  ]
}
```

**Migration cost**: Small. Joi gets a discriminator. `getTransitionForTargetPosition` and `getNextPosition` can keep their signatures; internally they filter by `kind`. Auto-migrate: any transition with `action: null` becomes `kind: "event"`, otherwise `kind: "action"`. ~0.5–1 day of careful work.

**Reversibility**: High. Drop the `kind` field, reinstate `action: null` semantics, done. The change is essentially a schema annotation.

**Urgency**: Not immediate. This is a clarity improvement worth doing when you next touch this area, not a blocking issue. There are only two registered event types today. The current model carries that load fine.

See: `docs/research/event-listener-design-question.md`.

---

## 3. Secondary Model Smells Worth Surfacing

The DDD analysis flagged three other concerns that don't require immediate fixing but are worth tracking:

### `checkTasks` Duplication

`checkTasks` appears on both `Transition` and `Action`, with different scopes that are not obviously defined. `Transition.checkTasks` gates non-UI progressions; `Action.checkTasks` gates UI-triggered progressions and filters `getPermittedActions`. If a transition is event-driven, only `Transition.checkTasks` is consulted. If UI-driven, both can be set, and what happens if they disagree is not documented.

**Future fix**: Either consolidate to one flag at the transition level, or rename them to make the scope explicit (`gateOnTaskCompletion` for the event path; `requireTaskCompletionToOfferAction` for the UI path).

See: `docs/research/event-listener-design-question.md` §4.

### `processes[]` Vocabulary Mismatch

GAS's `validFrom` rules include a `processes[]` field (side-effects that fire on state arrival). This is structurally the same as CW's event-driven transitions: both are *policies* (reactions) bound to state. They use different vocabulary in each system — `processes[]` in GAS, `transitions` (with `action: null`) in CW — which makes cross-system conversations harder.

**Future alignment**: If CW grows a first-class listener shape (the recommended event-listener refactor), consider aligning GAS's `processes[]` vocabulary with the same concept. Both express "what happens when the case reaches this state". No immediate action needed; flag for the documentarist.

See: `docs/research/event-listener-design-question.md` §4.

### Stage-Outcome Advancement as a Third Edge Type

A `transition` today silently covers (i) UI command edges, (ii) inbound-event reactions, and arguably (iii) stage-outcome advancement via `Case.updateStageOutcome`, which has its own lookup path. The fact that the same schema covers UI-clicks-that-advance-stage and UI-clicks-that-record-an-outcome-and-advance-stage suggests outcome recording is a third distinct concept.

**Future investigation**: Worth a closer look when sketching the listener shape — don't accidentally pick a vocabulary that excludes outcome-recording transitions.

See: `docs/research/event-listener-design-question.md` §4.

---

## 4. Concrete Improvements: Schema Enforcement and Cross-System Validation

### Schema Enforcement Gap: GAS Joi Schemas Don't Validate Naming Conventions

**Problem**: GAS Joi schemas at `fg-gas-backend/src/grants/schemas/grant/*.js` don't enforce the SCREAMING_SNAKE_CASE pattern for stage/status codes. Only CW enforces it (in `fg-cw-backend/src/cases/schemas/task.schema.js:12`). This is an asymmetric validation: CW rejects `Status_Code` (not SCREAMING_SNAKE_CASE) during fixture load, but GAS accepts it.

**Why it matters**: A typo in a GAS fixture (e.g., `Status_In_Review` instead of `STATUS_IN_REVIEW`) sails through GAS validation and gets caught only when CW tries to look it up, or when the asymmetric-coupling linter (Option E from §1) runs. Earlier detection is better.

**Fix**: Add a Joi schema constraint to `fg-gas-backend/src/grants/schemas/grant/phases.js` (for phases/stages/statuses) and `external-status-map.js` that enforces `^[A-Z0-9_]+$` the same way CW does. ~30 lines. Implement as part of the Linter (Option E) work, since the same regex is needed in the linter anyway.

**Urgency**: Low. Defects are rare but this catches them earlier.

---

### Dead-Letter Recovery Dance

**Problem**: When an inbox event dead-letters (e.g., `wmp-va7-s2b`, where an Agreement Service event hit a missing `externalStatusMap` route), the case is stuck. Recovery today requires manual intervention: find the dead-lettered record in the inbox collection, fix the root cause (add the missing route, fix the `validFrom` gate), revive the inbox entry, replay it.

**Why it matters**: Dead-letters are rare but incident-class when they happen. A small recovery CLI or scheduled job could automate the common cases: replay dead-letters whose root cause (a missing route, a renamed state) has since been fixed.

**Outline**: A CLI command `wf replay-dead-letters --since <date>` that:
1. Queries GAS inbox for dead-lettered events in the time window.
2. For each, re-attempts to apply it with the current workflow definition.
3. If it now succeeds, marks it as processed and logs the recovery.
4. If it still fails, reports the error for manual triage.

**Urgency**: Low-to-medium. Useful but only if dead-letters become a pattern.

---

### Doc Inconsistency: CW Creating-Workflow-Definitions Update Guidance

**Problem**: `fg-cw-backend/docs/creating-workflow-definitions.md` (§3, "Updating an existing workflow") recommends using `updateOne` with dot-notation paths when amending a workflow:
```javascript
await db.collection("workflows").updateOne(
  { code: "my-scheme" },
  { $set: { "phases.0.stages.0.statuses.1.theme": "INFO", ... } }
);
```

But the recent slim-gas-workflow-proposal (§9, "CW migration mechanism") explicitly **chose delete + insert instead** for the woodland rename migration, with the rationale that it's simpler and safer (no partial updates, full fixture visibility in the migration).

**Why it matters**: Documentation that contradicts recent decisions creates confusion for the next person authoring a migration. They read the doc, follow `updateOne`, and miss the lessons from the woodland experience.

**Fix**: Update `creating-workflow-definitions.md` §3 to note the decision: "While `updateOne` is possible, the team has found that delete + reinsert (§ of slim-gas-workflow-proposal) is safer for large structural changes because it keeps the full fixture visible in the migration and avoids partial-state bugs. Use `updateOne` for small targeted fixes (e.g., a single description string); use delete + insert for renames, stage additions, or major restructuring."

**Urgency**: Medium. This is a quick doc fix that saves future authors from confusion.

---

### Grants-UI Pre-Deploy Validator: gasStatus Matching

**Problem**: Grants-ui's `mapStatusToUrl()` function in `src/server/status/status-helper.js:36-52` matches redirect rules by string equality: it reads the `gasStatus` code returned from GAS and looks it up in the scheme's yaml redirect rules (e.g., "if gasStatus is one of `STATUS_AGREEMENT_OFFERED,STATUS_COMPLETED`, redirect to `/agreement`"). There is no schema validation that the status codes listed in the yaml actually exist in the GAS fixture. A typo in the yaml (e.g., `STATUS_AGREEMENT_OFFERRED` with an extra F) silently breaks the applicant's journey — they hit a 404 or get stuck.

**Why it matters**: The asymmetric-coupling is mostly about GAS ↔ CW. But grants-ui is a third consumer of GAS's status codes, and its failures are applicant-facing. A pre-deploy validator could catch these typos in the grants-ui repo's CI.

**Outline**: A CI check in `grants-ui` that loads the GAS fixture (or references it from a shared contract file) and validates every status code mentioned in the scheme yamls. ~50 lines in Node. Could be part of the Linter (Option E) extended to grants-ui, or a standalone tool in `fg-grants-core`.

**Urgency**: Medium. These typos are rare but high-impact when they happen.

---

### Contract-Test Invariant: GAS-Emitted Stages ⊆ CW-Known Stages

**Problem**: The cross-system-architecture document (§3, "The Asymmetric Coupling Fact") establishes the invariant: **every stage code that GAS can reach must also exist in CW's workflow definition**. This invariant is currently *unenforced* in CI. It's documented, but there's no automated check that prevents another `wmp-8a9-8fa` (where GAS published a stage code that didn't exist in CW).

**Why it matters**: This is *the* critical invariant that prevents applications from dead-lettering mid-workflow. It's been violated once (the incident that taught us about asymmetric coupling). An automated check in CI costs ~2 hours and prevents recurrence.

**Fix**: Part of the Linter (Option E) work. The contract checker should assert: for every stage in GAS's `phases[]`, verify that same stage code exists in CW's `phases[]`. If not, fail the build with a clear message: `"Stage code STAGE_X exists in GAS but not in CW. Add it to CW's workflow or remove it from GAS."` This is a subset of the broader Linter work.

**Urgency**: High. This is the single most important invariant. Should ship in Week 1 as part of Option E.

---

## 5. Smaller Improvements: Quick Wins

### Dead-Letter Observability

Today, if an inbox event dead-letters, you find it by querying the inbox collection manually and looking for records with `attempts >= 5`. A small dashboard or CLI query could surface:
- How many dead-lettered events are in each repo's inbox right now?
- What's the most common dead-letter root cause (missing route, missing stage code, etc.)?
- Which applications are blocked by dead-letters?

**Implementation**: A read-only Mongo aggregation + a simple Node CLI. ~1 week.

**Urgency**: Low-to-medium. Nice-to-have observability.

---

### Naming Convention Lint Rule for JSON

A linter rule (in the GAS and CW repos' linting setup) that checks workflow fixtures against the naming-conventions rules: every state code matches SCREAMING_SNAKE_CASE, stages are stative (not imperative), etc. ~100 lines, runs on any `.json` workflow fixture.

**Urgency**: Low. The naming doc already captures the rules. A lint rule makes them enforceable, but the team is already naming correctly post-slim-down.

---

## 6. What's Deliberately NOT in Scope

The recent cleanup (slim woodland + naming conventions + cross-system-architecture) shipped solid foundations. These items are **intentionally deferred**:

- **Deeper refactoring of naming after recent conventions** — We just established the rules and renamed the woodland workflow. No need to bikeshed further until the next workflow is authored. Let the conventions prove themselves on a real second workflow (grassland or similar).

- **Audit trail / event sourcing** — The case aggregate already maintains a `timeline[]` of TimelineEvents as a hybrid pattern (state-first + audit trail). Full event sourcing is tempting but doesn't solve real problems yet. Caseworkers don't need temporal queries. If a future need arises (regulatory rewind, multi-view dashboards), revisit.

- **Visual workflow editor with round-trip safety** — Atelier (Option B from §1) is a real product requiring a quarter+ of work. Wait until you have three workflows shipped and clear evidence that visual editing is the friction point.

- **Restructuring process definition storage** — GAS keeps processes in `validFrom[]` (part of the status object). Separating them into a first-class `processes[]` array is architecturally tidy but not urgent. Keep processes where they are until the event-listener refactor (§2) is in flight, then revisit as part of the broader model clarification.

---

## 7. Recommended Quarterly Plan

If the team has **one quarter** to invest in ecosystem improvements, prioritize in this order:

**Week 1: Linter (Option E) — The Baseline**
- `@defra/workflow-contract-checker` package with asymmetric-coupling + naming convention checks.
- Wired into all three repos' CI.
- Catches `wmp-8a9-8fa`-class incidents at PR time, not runtime.
- *Outcome*: No more asymmetric-coupling surprises at deploy time.

**Weeks 2–4: Reshape (Option D) — The Productivity Multiplier**
- `wf` CLI with `rename-stage`, `rename-status`, `add-status-ignore`, `gen-migration`, `check-invariants`.
- Integration with the Linter from Week 1 (each command ends with `wf check-invariants`).
- *Outcome*: Cross-repo changes become single commands; migrations are generated correctly by default.

**Week 4 (optional): Maven (Option C) — Low-Risk Prototyping**
- If a curious engineer wants to prototype the Claude agent, do it. Validate that the agent + Linter (from Week 1) can produce correct first drafts.
- *Outcome*: Evidence for whether conversational authoring is worth pursuing further.

**Post-quarter**: Monitor real-world workflows (woodland, grassland) for authoring friction. By the time workflow 5 is authored, you'll have clear data on whether Loom (Option A) or Atelier (Option B) is worth a quarter-long investment.

---

## 8. See Also

- `/Users/martins/workspace/ee/defra/fg-grants-core/docs/research/authoring-tooling-options.md` — The full divergence analysis of five options, with honest taste-filter and prior art.
- `/Users/martins/workspace/ee/defra/fg-grants-core/docs/research/event-listener-design-question.md` — The DDD analysis of event-driven transitions and the recommended discriminated-union refactor.
- `/Users/martins/workspace/ee/defra/fg-grants-core/docs/cross-system-architecture.md` — The asymmetric coupling invariant and real incident post-mortems.
- `/Users/martins/workspace/ee/defra/fg-grants-core/docs/naming-conventions.md` — The naming rules and lessons learned.
- `/Users/martins/workspace/ee/defra/fg-grants-core/docs/adr/slim-gas-workflow-proposal.md` — The woodland rename migration and decision log (e.g., delete+insert vs. updateOne).

---

**Document history**:
- 2026-05-26: Initial synthesis of authoring-tooling-options and event-listener-design-question research artifacts; concrete improvements catalogue.
