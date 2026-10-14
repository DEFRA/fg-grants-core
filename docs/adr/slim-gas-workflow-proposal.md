# Proposal: Slim GAS Workflow for Woodland

**Status:** Draft for review
**Scope:** `fg-gas-backend` woodland grant definition (the `grants` doc with `code: "woodland"`).
**Companion changes required:** `grants-ui` woodland yaml (remove `STATUS_AWAITING_FC` from the post-submission redirect rule) **must land first**.
**Companion changes optional:** small change in `apply-event-status-change.service.js` to gracefully drop events GAS doesn't care about (see *Open architectural question*).

---

## 1. Goals

1. **Remove cosmetic state mirroring** between GAS and CW. GAS only keeps states that either (a) fire a load-bearing side-effect or (b) are part of an external contract.
2. **Apply consistent naming conventions** to whatever survives. Stages = stative, statuses = stative, no imperatives leaking into state codes.
3. **Preserve the grants-ui contract** — the status codes `STATUS_AGREEMENT_OFFERED` and `STATUS_COMPLETED` keep their identity (subject to the in-flight grants-ui yaml change that removes `STATUS_AWAITING_FC`).
4. **Preserve every GAS side-effect** — `GENERATE_OFFER`, `STORE_AGREEMENT_CASE`, `ACCEPT_AGREEMENT` continue to fire on the same business transitions.

## 2. Changes at a glance

| Element | Today | Proposed | Reason |
|---|---|---|---|
| **Phases** | `PHASE_PRE_AWARD` | `PHASE_PRE_AWARD` | Unchanged. |
| **Stages count** | 6 | 5 | Drop `STAGE_FC_REVIEW`; rename two others. |
| **Statuses count** | 8 | 6 | Drop `STATUS_IN_REVIEW`, `STATUS_AWAITING_FC`. |
| **externalStatusMap entries** | 9 (across 5 stage blocks, one duplicate) | 5 (across 4 stage blocks, no duplicates) | Drop mirrored routes that have no side-effect or external consumer. |
| **CW events GAS still consumes** | 5 | 3 | `STATUS_AGREEMENT_GENERATING`, `STATUS_AGREEMENT_OFFERED`, `STATUS_COMPLETED`. |
| **AS events GAS still consumes** | 2 | 2 | `offered`, `accepted` — unchanged. |
| **Side-effect processes fired** | 3 (`GENERATE_OFFER`, `STORE_AGREEMENT_CASE`, `ACCEPT_AGREEMENT`) | 3 — unchanged | All preserved on the same business moments. |

### Renames applied

| Old code | New code | Why |
|---|---|---|
| `STAGE_SEND_AGREEMENT_TO_APPLICANT` | `STAGE_PREPARING_AGREEMENT` | Was imperative (a command). Stages are stative — gerund form. |
| `STAGE_FORWARD_TO_FC` | `STAGE_AGREEMENT_ACCEPTED` | Was imperative naming the next *action*. Renaming to describe what is *true now* — the agreement has been accepted. |
| `STAGE_APPLICATION_COMPLETE` | `STAGE_APPLICATION_COMPLETED` | Consistent past-participle with the others. |
| `STATUS_READY_TO_FORWARD` | `STATUS_AGREEMENT_ACCEPTED` | Was named after the next action. Renamed to describe the state of the agreement. |

### Removed

| Code | Reason removed |
|---|---|
| `STATUS_IN_REVIEW` | Mirror of a CW caseworker action. Fires no GAS side-effect; no external consumer. |
| `STATUS_AWAITING_FC` | Mirror of a CW caseworker action. Grants-ui will stop matching on it (in-flight). No side-effect. |
| `STAGE_FC_REVIEW` | Existed only to hold `STATUS_AWAITING_FC`. |
| Duplicate `STAGE_SEND_AGREEMENT_TO_APPLICANT` block in `externalStatusMap` | Was an artefact of incremental editing; consolidated into a single stage block. |

## 3. Open architectural question — what does GAS do with unmapped events?

After the slim-down, CW will still publish two events GAS doesn't care about:
- `case.status.updated` with `currentStatus = STATUS_IN_REVIEW`
- `case.status.updated` with `currentStatus = STATUS_AWAITING_FC`

Today, `apply-event-status-change.service.js` throws when no `externalStatusMap` mapping is found. That makes the inbox subscriber treat the unmapped event as a transient failure and retry it five times before dead-lettering it. After the slim-down, those two events would dead-letter on every case, which is noise.

Three resolution options:

| Option | Where the change lives | Pros | Cons |
|---|---|---|---|
| **A.** Add explicit *ignore* entries in `externalStatusMap` (e.g. `mappedTo: null` or `ignore: true`), and teach `mapExternalStateToInternalState` + the apply service to short-circuit on those. | GAS code + config | Self-documenting; you can see which CW statuses GAS explicitly chooses to ignore. | Requires a small code change in GAS. |
| **B.** Change GAS so "no mapping found" is treated as a silent no-op instead of an error. | GAS code only | Smallest change. Future CW additions don't dead-letter. | Hides real configuration mistakes — you lose the "the event arrived but I don't know what to do" signal. |
| **C.** Filter on the CW side — CW only publishes the statuses GAS subscribes to. | CW + topic config | No GAS code change. Less wire traffic. | Couples CW publication to GAS subscription details, which is the leak we're trying to avoid. |

**Recommendation: Option A.** It keeps the contract explicit and self-documenting at the cost of a few lines in two files. The proposal below assumes Option A is chosen; the `externalStatusMap` carries explicit ignore entries for `STATUS_IN_REVIEW` and `STATUS_AWAITING_FC`.

If you prefer B or C, the workflow definition itself doesn't change — only the strategy for handling those two CW events does.

## 4. Proposed phase/stage/status structure

```json
{
  "code": "woodland",
  "metadata": {
    "description": "Woodland Management Plan",
    "startDate": "2100-01-01T00:00:00.000Z"
  },
  "actions": [],
  "amendablePositions": [],
  "phases": [
    {
      "code": "PHASE_PRE_AWARD",
      "name": "Pre-award",
      "description": "Pre-award phase",
      "questions": "...(unchanged from current woodland fixture)...",
      "stages": [
        {
          "code": "STAGE_REVIEWING_APPLICATION",
          "name": "Reviewing application",
          "description": "Application received and being reviewed; agreement generation triggered on approval",
          "statuses": [
            {
              "code": "STATUS_APPLICATION_RECEIVED",
              "validFrom": []
            },
            {
              "code": "STATUS_AGREEMENT_GENERATING",
              "validFrom": [
                {
                  "code": "STATUS_APPLICATION_RECEIVED",
                  "processes": ["GENERATE_OFFER"]
                }
              ]
            }
          ]
        },
        {
          "code": "STAGE_PREPARING_AGREEMENT",
          "name": "Preparing agreement",
          "description": "Agreement document being drafted and made ready for the applicant",
          "statuses": [
            {
              "code": "STATUS_AGREEMENT_READY_FOR_APPLICANT",
              "validFrom": [
                {
                  "code": "PHASE_PRE_AWARD:STAGE_REVIEWING_APPLICATION:STATUS_AGREEMENT_GENERATING",
                  "processes": ["STORE_AGREEMENT_CASE"]
                }
              ]
            }
          ]
        },
        {
          "code": "STAGE_AGREEMENT_WITH_APPLICANT",
          "name": "Agreement with applicant",
          "description": "Agreement is with the applicant, awaiting their response",
          "statuses": [
            {
              "code": "STATUS_AGREEMENT_OFFERED",
              "validFrom": [
                {
                  "code": "PHASE_PRE_AWARD:STAGE_PREPARING_AGREEMENT:STATUS_AGREEMENT_READY_FOR_APPLICANT",
                  "processes": []
                }
              ]
            }
          ]
        },
        {
          "code": "STAGE_AGREEMENT_ACCEPTED",
          "name": "Agreement accepted",
          "description": "Applicant has accepted the agreement; downstream processes triggered",
          "statuses": [
            {
              "code": "STATUS_AGREEMENT_ACCEPTED",
              "validFrom": [
                {
                  "code": "PHASE_PRE_AWARD:STAGE_AGREEMENT_WITH_APPLICANT:STATUS_AGREEMENT_OFFERED",
                  "processes": ["ACCEPT_AGREEMENT"]
                }
              ]
            }
          ]
        },
        {
          "code": "STAGE_APPLICATION_COMPLETED",
          "name": "Application completed",
          "description": "All approvals received; application is complete",
          "statuses": [
            {
              "code": "STATUS_COMPLETED",
              "validFrom": [
                {
                  "code": "PHASE_PRE_AWARD:STAGE_AGREEMENT_ACCEPTED:STATUS_AGREEMENT_ACCEPTED",
                  "processes": []
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### Why this shape

- **5 stages, each named in a single grammatical voice.** Two gerunds (`REVIEWING`, `PREPARING`), one possessor (`WITH_APPLICANT`), two past-participles (`ACCEPTED`, `COMPLETED`). No imperatives anywhere.
- **`STATUS_AGREEMENT_OFFERED` and `STATUS_COMPLETED` keep their codes.** Grants-ui doesn't break.
- **Every side-effect lives on the same business moment as today** — only the *names* of the source/target states differ.
- **`STAGE_APPLICATION_COMPLETED` is terminal** — no transitions out, matching CW's terminal stage.

## 5. Proposed externalStatusMap

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
              },
              {
                "code": "PHASE_PRE_AWARD:STAGE_REVIEWING_APPLICATION:STATUS_IN_REVIEW",
                "source": "CW",
                "mappedTo": null,
                "ignore": true
              },
              {
                "code": "offered",
                "source": "AS",
                "mappedTo": "PHASE_PRE_AWARD:STAGE_PREPARING_AGREEMENT:STATUS_AGREEMENT_READY_FOR_APPLICANT"
              }
            ]
          },
          {
            "code": "STAGE_PREPARING_AGREEMENT",
            "statuses": [
              {
                "code": "PHASE_PRE_AWARD:STAGE_AGREEMENT_WITH_APPLICANT:STATUS_AGREEMENT_OFFERED",
                "source": "CW",
                "mappedTo": "PHASE_PRE_AWARD:STAGE_AGREEMENT_WITH_APPLICANT:STATUS_AGREEMENT_OFFERED"
              }
            ]
          },
          {
            "code": "STAGE_AGREEMENT_WITH_APPLICANT",
            "statuses": [
              {
                "code": "accepted",
                "source": "AS",
                "mappedTo": "PHASE_PRE_AWARD:STAGE_AGREEMENT_ACCEPTED:STATUS_AGREEMENT_ACCEPTED"
              }
            ]
          },
          {
            "code": "STAGE_AGREEMENT_ACCEPTED",
            "statuses": [
              {
                "code": "PHASE_PRE_AWARD:STAGE_FC_REVIEW:STATUS_AWAITING_FC",
                "source": "CW",
                "mappedTo": null,
                "ignore": true
              },
              {
                "code": "PHASE_PRE_AWARD:STAGE_APPLICATION_COMPLETE:STATUS_COMPLETED",
                "source": "CW",
                "mappedTo": "PHASE_PRE_AWARD:STAGE_APPLICATION_COMPLETED:STATUS_COMPLETED"
              }
            ]
          }
        ]
      }
    ]
  }
}
```

### Notes on this map

- **Two explicit ignore entries** (Option A from §3): `CW:STATUS_IN_REVIEW` and `CW:STATUS_AWAITING_FC`. These tell GAS "I see this event and I deliberately do nothing." If you go with Option B or C instead, drop these two entries from the map.
- **The CW event codes still reflect CW's *own* phase:stage:status format** — that's what arrives over the wire (`cloud.defra.local.fg-cw-backend.case.status.updated` payloads embed CW's current position). Matching is against `(source, code)`, and the code happens to be CW-shaped — that's not a problem because the routing is purely string equality.
- **One entry per stage** (no more duplicates). The earlier `STAGE_SEND_AGREEMENT_TO_APPLICANT` block that appeared twice in the current map is gone.
- **`STATUS_COMPLETED` now jumps directly from `STAGE_AGREEMENT_ACCEPTED`** — no intermediate FC-review stage in GAS.

## 6. Migration approach

Same `deleteOne` + `insertOne` pattern as the existing woodland migrations. Place at:

```
fg-gas-backend/migrations/YYYYMMDDHHMMSS-slim-woodland-workflow.js
```

The migration body inlines the full document above (phases + externalStatusMap + the unchanged `questions` schema and metadata).

Because the slim-down renames states, in-flight cases may be on positions that no longer exist (e.g. a case currently at `STAGE_FORWARD_TO_FC:STATUS_READY_TO_FORWARD`). The migration should include a data fix-up that rewrites in-flight applications to the new positions. Suggested mapping table:

| Current position | New position |
|---|---|
| `PHASE_PRE_AWARD:STAGE_REVIEWING_APPLICATION:STATUS_IN_REVIEW` | `PHASE_PRE_AWARD:STAGE_REVIEWING_APPLICATION:STATUS_APPLICATION_RECEIVED` *(drop back; effectively this status disappears)* |
| `PHASE_PRE_AWARD:STAGE_SEND_AGREEMENT_TO_APPLICANT:STATUS_AGREEMENT_READY_FOR_APPLICANT` | `PHASE_PRE_AWARD:STAGE_PREPARING_AGREEMENT:STATUS_AGREEMENT_READY_FOR_APPLICANT` |
| `PHASE_PRE_AWARD:STAGE_FORWARD_TO_FC:STATUS_READY_TO_FORWARD` | `PHASE_PRE_AWARD:STAGE_AGREEMENT_ACCEPTED:STATUS_AGREEMENT_ACCEPTED` |
| `PHASE_PRE_AWARD:STAGE_FC_REVIEW:STATUS_AWAITING_FC` | `PHASE_PRE_AWARD:STAGE_AGREEMENT_ACCEPTED:STATUS_AGREEMENT_ACCEPTED` *(collapse forward — no FC stage any more)* |
| `PHASE_PRE_AWARD:STAGE_APPLICATION_COMPLETE:STATUS_COMPLETED` | `PHASE_PRE_AWARD:STAGE_APPLICATION_COMPLETED:STATUS_COMPLETED` |

That's a single `bulkWrite` of `updateOne` operations keyed on `(currentPhase, currentStage, currentStatus)`.

## 7. Rollout checklist

1. **Land the grants-ui yaml change** (remove `STATUS_AWAITING_FC` from the post-submission redirect rule). Deploy. Verify no regressions in applicant-side routing for woodland.
2. **Decide on the unmapped-event policy** (A / B / C from §3). If A, land the small code change in `apply-event-status-change.service.js` and `grant.js` that honours `ignore: true`.
3. **Write the migration** with the data-fix-up `bulkWrite` (§6).
4. **Run the migration in a lower env**, walk a fresh application end-to-end, confirm:
   - GAS reaches `STATUS_AGREEMENT_ACCEPTED` on `AS:accepted`.
   - GAS reaches `STATUS_COMPLETED` on `CW:STATUS_COMPLETED`.
   - `CW:STATUS_IN_REVIEW` and `CW:STATUS_AWAITING_FC` events arrive at GAS and are quietly ignored (no dead-letter, no state change).
   - Side-effects (`GENERATE_OFFER`, `STORE_AGREEMENT_CASE`, `ACCEPT_AGREEMENT`) fire on the same business moments as today.
   - Grants-ui's `/agreement` page is reached when GAS reports `STATUS_AGREEMENT_OFFERED` or `STATUS_COMPLETED`.
5. **Run the migration in prod**.

## 8. Things this does *not* do

- **No change to CW** — CW keeps its full state model including the FC-review stage and the in-review status. The slim-down is purely on the GAS side.
- **No change to the AS contract** — GAS still consumes `AS:offered` and `AS:accepted` and emits the same outbound events.
- **No change to the application's `questions` schema** — applicants see the same form.
- **No change to the inbox/outbox plumbing** — the persistence layer is untouched (apart from the small `ignore` short-circuit if Option A is taken).
- **No removal of GAS's `application.status.updated` outbound event** — downstream consumers (including CW's `System`-attributed timeline entries) keep receiving status changes, just fewer of them (since GAS itself has fewer state transitions).

## 9. Decisions taken (recorded after review)

| Decision | Choice |
|---|---|
| CW scope | Stages + statuses + tasks + actions (full convention alignment) |
| Unmapped event policy | Log `info` and continue (no error, no dead-letter) — small change in `apply-event-status-change.service.js`. **Implementation pending — handed off to a human along with the corresponding test updates** (see §12) |
| CW migration mechanism | Delete + reinsert (matching GAS, departing from CW's documented `updateOne` convention) |
| In-flight case migration | None required — prod cases sit at `PHASE_PRE_AWARD:STAGE_REVIEWING_APPLICATION:STATUS_APPLICATION_RECEIVED`, whose codes are unchanged. **Pre-deploy count-by-position query skipped — trusting the assertion** |
| Subject prefix policy | Always include the subject (`STATUS_APPLICATION_*`, `STATUS_AGREEMENT_*`) |
| CW display names | Obvious mismatches updated to track the renamed codes (e.g. `STAGE_PREPARING_AGREEMENT` shows as "Preparing agreement"). Subjective UX wording deferred. |
| Rollout sequence | Grants-ui first (already on disk), then GAS + CW together. **Important caveat in §12** about ordering vs. the pending service code change |

## 9a. ⚠️ Known consequence until the service code change lands

The slim workflow stops referencing `STATUS_IN_REVIEW` and `STATUS_AWAITING_FC` from CW in its `externalStatusMap`. While the GAS service code still throws on no-mapping (today's behavior, post-revert), those two CW events will **dead-letter on every case** after the slim workflow ships.

This is recoverable (the inbox events can be revived manually as we did for `wmp-va7-s2b`) but noisy. Two ways to handle the window:

1. **Sequence carefully** — ship the human's `apply-event-status-change.service.js` change (log+continue) **before** the slim workflow migration. Zero dead-letters during the cutover.
2. **Ship together** — accept a transient dead-letter window between the GAS migration running and the service change deploying. The two events would dead-letter for every case touched during the window. Filter or auto-revive afterwards.

Strongly prefer (1). The proposal §7 rollout order should be amended to: **grants-ui → GAS service code change (log+continue) → GAS migration + CW migration**.

## 10. Naming sheet — every rename in one place

### GAS — slim model

#### Phases

| Old | New |
|---|---|
| `PHASE_PRE_AWARD` | `PHASE_PRE_AWARD` (unchanged) |

#### Stages

| Old | New | Form |
|---|---|---|
| `STAGE_REVIEWING_APPLICATION` | `STAGE_REVIEWING_APPLICATION` (unchanged) | gerund |
| `STAGE_SEND_AGREEMENT_TO_APPLICANT` | `STAGE_PREPARING_AGREEMENT` | gerund (was imperative) |
| `STAGE_AGREEMENT_WITH_APPLICANT` | `STAGE_AGREEMENT_WITH_APPLICANT` (unchanged) | possessor |
| `STAGE_FORWARD_TO_FC` | `STAGE_AGREEMENT_ACCEPTED` | past-participle (was imperative) |
| `STAGE_FC_REVIEW` | *removed* | — |
| `STAGE_APPLICATION_COMPLETE` | `STAGE_APPLICATION_COMPLETED` | past-participle (consistent) |

#### Statuses

| Old | New | Notes |
|---|---|---|
| `STATUS_APPLICATION_RECEIVED` | `STATUS_APPLICATION_RECEIVED` (unchanged) | — |
| `STATUS_IN_REVIEW` | *removed in GAS* | (renamed in CW only) |
| `STATUS_AGREEMENT_GENERATING` | `STATUS_AGREEMENT_GENERATING` (unchanged) | fires `GENERATE_OFFER` |
| `STATUS_AGREEMENT_READY_FOR_APPLICANT` | `STATUS_AGREEMENT_READY_FOR_APPLICANT` (unchanged) | fires `STORE_AGREEMENT_CASE` |
| `STATUS_AGREEMENT_OFFERED` | `STATUS_AGREEMENT_OFFERED` (unchanged) | required by grants-ui |
| `STATUS_READY_TO_FORWARD` | `STATUS_AGREEMENT_ACCEPTED` | fires `ACCEPT_AGREEMENT` |
| `STATUS_AWAITING_FC` | *removed in GAS* | (renamed in CW only) |
| `STATUS_COMPLETED` | `STATUS_APPLICATION_COMPLETED` | required by grants-ui (after yaml change) |

### CW — naming pass only (no states removed)

#### Stages

| Old | New | Form |
|---|---|---|
| `STAGE_REVIEWING_APPLICATION` | `STAGE_REVIEWING_APPLICATION` (unchanged) | gerund |
| `STAGE_SEND_AGREEMENT_TO_APPLICANT` | `STAGE_PREPARING_AGREEMENT` | gerund |
| `STAGE_AGREEMENT_WITH_APPLICANT` | `STAGE_AGREEMENT_WITH_APPLICANT` (unchanged) | possessor |
| `STAGE_FORWARD_TO_FC` | `STAGE_AGREEMENT_ACCEPTED` | past-participle (matches GAS — see §10a) |
| `STAGE_FC_REVIEW` | `STAGE_FC_REVIEWING` | gerund |
| `STAGE_APPLICATION_COMPLETE` | `STAGE_APPLICATION_COMPLETED` | past-participle |

### §10a — GAS and CW must share stage codes that GAS publishes

An earlier draft of this naming sheet had CW renaming `STAGE_FORWARD_TO_FC` → `STAGE_FORWARDING_TO_FC` (gerund, describing the work), with a note that the divergence from GAS's `STAGE_AGREEMENT_ACCEPTED` was "deliberate — GAS records the state, CW describes the work". **That note was wrong** and the divergence broke the live flow when first tested.

**Root cause:** GAS publishes `application.status.updated` events containing its own current position (e.g. `PHASE_PRE_AWARD:STAGE_AGREEMENT_ACCEPTED:STATUS_AGREEMENT_ACCEPTED`). CW's inbox subscriber takes that position and applies it directly to the case — it looks the stage code up in CW's own workflow definition. If the stage code doesn't exist in CW's workflow, the apply fails: `Error: Stage with code "STAGE_AGREEMENT_ACCEPTED" not found`. The inbox event retries 5 times, then dead-letters, and the case is stuck on its previous state.

**Lesson:** the contract between GAS and CW is **asymmetric**:
- `CW → GAS` is selective. GAS's `externalStatusMap` opts in to specific `(source, code)` pairs; unmapped events are dropped (or, with today's pre-fix service code, dead-lettered). CW can publish any state codes it likes without GAS caring.
- `GAS → CW` is **not** selective. CW uses GAS's emitted position verbatim. **Every stage code GAS can be in must also exist in CW's workflow definition.**

That means GAS and CW must share stage *codes* (not necessarily display names) for every state GAS can publish. Display names can still describe the work — the code describes the state. For the woodland post-acceptance stage:
- Code: `STAGE_AGREEMENT_ACCEPTED` in both GAS and CW.
- CW display name: `"Agreement accepted"`.
- The "forwarding to FC" semantics live in CW's task group (`TASK_GROUP_CRM_RECORD`) and action (`ACTION_FORWARD_TO_FC`) inside that stage — those describe the work, which is the right place for that semantics.

This same principle applies to **every other GAS stage**: `STAGE_REVIEWING_APPLICATION`, `STAGE_PREPARING_AGREEMENT`, `STAGE_AGREEMENT_WITH_APPLICANT`, `STAGE_APPLICATION_COMPLETED`. They all exist in both systems, by the same code, and the proposal preserves that.

Stage codes that exist **only in CW** (not in GAS) are fine — GAS will never publish them. `STAGE_FC_REVIEWING` is one such code in this proposal; CW uses it to organise the FC-review work for caseworkers, but GAS in the slim model doesn't reach this state.

#### Statuses

| Old | New |
|---|---|
| `STATUS_APPLICATION_RECEIVED` | `STATUS_APPLICATION_RECEIVED` (unchanged) |
| `STATUS_IN_REVIEW` | `STATUS_APPLICATION_IN_REVIEW` |
| `STATUS_AGREEMENT_GENERATING` | `STATUS_AGREEMENT_GENERATING` (unchanged) |
| `STATUS_AGREEMENT_READY_FOR_APPLICANT` | `STATUS_AGREEMENT_READY_FOR_APPLICANT` (unchanged) |
| `STATUS_AGREEMENT_OFFERED` | `STATUS_AGREEMENT_OFFERED` (unchanged) |
| `STATUS_READY_TO_FORWARD` | `STATUS_AGREEMENT_ACCEPTED` |
| `STATUS_AWAITING_FC` | `STATUS_APPLICATION_AWAITING_FC` |
| `STATUS_COMPLETED` | `STATUS_APPLICATION_COMPLETED` |

#### Actions

| Old | New | Reason |
|---|---|---|
| `ACTION_START_REVIEW` | `ACTION_START_REVIEW` (unchanged) | verb-object |
| `ACTION_APPROVE_APPLICATION` | `ACTION_APPROVE_APPLICATION` (unchanged) | verb-object |
| `ACTION_CONTINUE` | `ACTION_CONFIRM_AGREEMENT_SENT` | generic → specific |
| `ACTION_FORWARD_TO_FC` | `ACTION_FORWARD_TO_FC` (unchanged) | verb-object |
| `ACTION_FC_APPROVE` | `ACTION_APPROVE_FC_REVIEW` | verb-object order; subject is the FC review |

#### Task groups

| Old | New |
|---|---|
| `TASK_GROUP_SEND_AGREEMENT_TO_APPLICANT` | `TASK_GROUP_AGREEMENT_PREPARATION` |
| `TASK_GROUP_CREATE_CRM_RECORD` | `TASK_GROUP_CRM_RECORD` |
| `TASK_GROUP_FC_REVIEW` | `TASK_GROUP_FC_REVIEW` (unchanged) |

#### Tasks (noun-phrase work items, no imperatives)

| Old | New |
|---|---|
| `TASK_AGREEMENT_SENT_TO_APPLICANT` | `TASK_AGREEMENT_DELIVERY_TO_APPLICANT` |
| `TASK_CREATE_CRM_RECORD` | `TASK_CRM_RECORD_CREATION` |
| `TASK_FC_REVIEW_COMPLETED` | `TASK_FC_REVIEW_OUTCOME` |

#### Task status options (outcomes — past-participle / adjective, already consistent)

Unchanged: `STATUS_AGREEMENT_SENT_TO_APPLICANT`, `STATUS_AGREEMENT_NOT_SENT_TO_APPLICANT`, `STATUS_CRM_RECORD_CREATED`, `STATUS_CRM_RECORD_NOT_CREATED`, `STATUS_FC_REVIEW_SUCCESSFUL`, `STATUS_FC_REVIEW_UNSUCCESSFUL`.

### Grants-UI yaml change

In `grants-ui/src/server/common/forms/definitions/woodland.yaml`:

```diff
-      - fromGrantsStatus: 'SUBMITTED'
-        gasStatus: 'STATUS_AGREEMENT_OFFERED,STATUS_AWAITING_FC,STATUS_COMPLETED'
-        toGrantsStatus: 'SUBMITTED'
-        toPath: /agreement
+      - fromGrantsStatus: 'SUBMITTED'
+        gasStatus: 'STATUS_AGREEMENT_OFFERED,STATUS_APPLICATION_COMPLETED'
+        toGrantsStatus: 'SUBMITTED'
+        toPath: /agreement
```

## 11. What the BA / team should look at

- §1 (goals) and §2 (changes at a glance) — does the scope match expectations?
- §9 (decisions taken) and §9a (dead-letter warning) — anything we've recorded that doesn't match what you remember?
- §10 (naming sheet) — every concrete rename. Push back here on individual names, not at the architectural level.
- §5 (`externalStatusMap`) — does the routing make sense per stage?
- §6 (data fix-up) — verified there's nothing to migrate; pre-deploy query skipped per decision.
- §7 (rollout) — confirm sequencing per the amendment in §9a (service code change must precede the migration to avoid dead-letters).
- §12 (human follow-ups) — confirm the open items.

## 12. Open follow-ups (handed off)

The artifacts already on disk cover the workflow definition changes (fixtures + migrations in GAS and CW) and the grants-ui yaml. These items are deliberately left for a human:

1. **`apply-event-status-change.service.js` — log+continue change** (reverted; not on disk).
   Update the no-mapping branch (around line 215) from `throw new Error(...)` to `logger.info(...)` + return. See §3 / Option A wording for the message format. **Blocks the migration deploy** per §9a.
2. **GAS test updates** — `apply-event-status-change.service.test.js` and any other woodland-specific tests that hardcode the old codes (`STATUS_IN_REVIEW`, `STATUS_AWAITING_FC`, `STATUS_READY_TO_FORWARD`, `STAGE_FORWARD_TO_FC`, `STAGE_FC_REVIEW`, `STAGE_APPLICATION_COMPLETE`, `STATUS_COMPLETED`). Generic grant-model tests should not need touching; if they fail, that's a signal worth investigating.
3. **CW test updates** — woodland-specific integration/unit tests that reference renamed codes (stages, statuses, actions, tasks, task groups). Same rule — only woodland-specific tests, not generic workflow-engine tests.
4. **Display-name UX pass** (optional) — I updated obvious mismatches (§5 of the naming sheet) but didn't touch description fields or wider caseworker-facing copy. A UX-led pass over `name` / `description` / button labels would tighten this up.
