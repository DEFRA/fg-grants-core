# Naming Conventions for Defra Grant Workflow States and Actions

Reference guide for consistent, unambiguous naming of workflow elements (phases, stages, statuses, actions, processes, tasks) across fg-grants-core, fg-gas-backend, fg-cw-backend, and grants-ui. These rules emerged from a multi-week debugging cycle where naming ambiguity caused repeated mislocation of state logic. Apply them rigorously.

## The Mental Model: States Are Places, Not Commands

The fundamental rule: **states describe where the case is now; actions describe what a caseworker does to move it.**

- **State** (phase / stage / status) = a *place* the case currently occupies → stative form (past-participle, gerund, possessor, adjective). Never imperative.
- **Action** = a *command* a caseworker executes to change place → imperative verb-object.
- **Process** = an internal side-effect in GAS → imperative verb-object.
- **Task** = a *work item* occupying a stage → noun phrase. Not imperative.
- **Task outcome** (statusOption) = the result a task carries → past-participle / adjective.
- **Event** = something that happened to the case → past tense + entity.

### The Read-Aloud Sanity Check

For any state code, complete this sentence: *"the case is currently …"*

If it reads naturally as a place or condition, the name is correct. If it reads as a command (*"send the agreement"*) or a next-action prediction (*"ready to forward"*), the name is wrong and must be renamed.

Examples:
- ✓ `STATUS_APPLICATION_RECEIVED`: "the case is currently application received" (natural)
- ✗ `STATUS_READY_TO_FORWARD`: "the case is currently ready to forward" (names the next action, not the current state; should be `STATUS_AWAITING_FC_REVIEW` or `STATUS_SUBMITTED_FOR_FC_REVIEW`)
- ✓ `STATUS_AGREEMENT_ACCEPTED`: "the case is currently agreement accepted" (natural)
- ✗ `STAGE_SEND_AGREEMENT_TO_APPLICANT`: "the case is currently send agreement to applicant" (imperative command, not a place; should be `STAGE_AGREEMENT_WITH_APPLICANT` or `STAGE_AGREEMENT_DELIVERY_IN_PROGRESS`)

---

## Element-by-Element Reference

| Element | Form | Example (Good) | Example (Bad) | Why |
|---|---|---|---|---|
| **Phase** | descriptor, kebab-case in code | `PHASE_PRE_AWARD`, `PHASE_POST_AGREEMENT_MONITORING` | — | Phases are organizational containers, rarely ambiguous |
| **Stage** | gerund / possessor / past-participle | `STAGE_REVIEWING_APPLICATION`, `STAGE_AGREEMENT_WITH_APPLICANT`, `STAGE_AGREEMENT_ACCEPTED`, `STAGE_APPLICATION_COMPLETED` | `STAGE_SEND_AGREEMENT_TO_APPLICANT`, `STAGE_FORWARD_TO_FC` | Both bad examples are imperative ("send", "forward"). They read as commands, not places. |
| **Status** | past-participle / gerund / adjective | `STATUS_APPLICATION_RECEIVED`, `STATUS_AGREEMENT_GENERATING`, `STATUS_AGREEMENT_OFFERED`, `STATUS_AGREEMENT_ACCEPTED` | `STATUS_READY_TO_FORWARD`, `STATUS_IN_REVIEW` (bare subject) | `READY_TO_FORWARD` names the next action, not the current state. `IN_REVIEW` omits the subject; should be `STATUS_APPLICATION_IN_REVIEW`. |
| **Action** | imperative verb-object | `ACTION_APPROVE_APPLICATION`, `ACTION_FORWARD_TO_FC`, `ACTION_CONFIRM_AGREEMENT_SENT` | `ACTION_CONTINUE`, `ACTION_FC_APPROVE` | `ACTION_CONTINUE` is too generic (continue what?). `ACTION_FC_APPROVE` is subject-verb-object (inverted); standard form is verb-object. |
| **Process** | imperative verb-object | `GENERATE_OFFER`, `STORE_AGREEMENT_CASE`, `ACCEPT_AGREEMENT` | — | Processes are internal GAS side-effects. Imperative form is correct. |
| **Task** | noun phrase (the work item itself) | `TASK_CRM_RECORD_CREATION`, `TASK_AGREEMENT_DELIVERY_TO_APPLICANT`, `TASK_FC_REVIEW_OUTCOME` | `TASK_CREATE_CRM_RECORD`, `TASK_AGREEMENT_SENT_TO_APPLICANT` | `CREATE_CRM_RECORD` is imperative (sounds like an instruction). `AGREEMENT_SENT_TO_APPLICANT` is past-participle and suggests the task IS the sent thing. The task is the *work of* sending. |
| **Task outcome** (statusOption) | past-participle / adjective | `STATUS_CRM_RECORD_CREATED`, `STATUS_FC_REVIEW_SUCCESSFUL`, `STATUS_AGREEMENT_SENT_TO_APPLICANT` | — | Task outcomes are states the task carries. Past-participle form is correct. |

---

## Subject Prefix Policy

**Always include the subject.** Don't assume context.

- ✓ `STATUS_APPLICATION_COMPLETED` (subject: application)
- ✗ `STATUS_COMPLETED` (what is completed?)
- ✓ `STATUS_APPLICATION_IN_REVIEW` (subject: application)
- ✗ `STATUS_IN_REVIEW` (in review by whom? about what?)
- ✓ `STATUS_AGREEMENT_ACCEPTED` (subject: agreement)
- ✗ `STATUS_ACCEPTED` (what was accepted?)

**Default subject:** application / case. **Agreement-specific subject:** prefix with `AGREEMENT_`. If a status applies to a task outcome, prefix with the task or field name (e.g., `STATUS_CRM_RECORD_CREATED`).

---

## Character-Set Constraints

All internal codes are **SCREAMING_SNAKE_CASE** (`^[A-Z0-9_]+$`) enforced by Joi validation in `fg-cw-backend/src/cases/schemas/task.schema.js:12` and observed in `fg-gas-backend/src/grants/schemas/grant/code.js`.

Workflow and grant code (in JSON/config) are **kebab-case lowercase** (`^[a-z0-9-]+$`):
- Example: `woodland`, `frps-private-beta`, `grassland`

All workflow element codes (phase, stage, status, action, task, statusOption, taskGroup):
- **SCREAMING_SNAKE_CASE** (`PHASE_PRE_AWARD`, `STAGE_REVIEWING_APPLICATION`, `STATUS_APPLICATION_RECEIVED`, `ACTION_APPROVE_APPLICATION`, etc.)

---

## Lessons from Real Incidents

### Incident 1: `STATUS_READY_TO_FORWARD`

In the woodland workflow's early draft, an agreement status was named `STATUS_READY_TO_FORWARD`. The name describes the *next* action (forward to FC) rather than the *current* fact. This caused confusion during review logic debugging: developers reading the code thought the status meant "this case is eligible for forwarding *right now*", when in fact the status was meant to capture "the case was submitted for FC review; awaiting their response." The actual forward action may have already happened.

**Fix:** Renamed to `STATUS_SUBMITTED_FOR_FC_REVIEW` (past-participle, describes current place). Developers reading the code immediately understood that the case was waiting for external input.

### Incident 2: `ACTION_CONTINUE`

A transition action was named `ACTION_CONTINUE` with no further context. During debugging, nobody could locate the effect of clicking that button without reading the transition target. It appeared in multiple stages with different outcomes, making search unhelpful.

**Fix:** Renamed contextually: `ACTION_FORWARD_TO_FC`, `ACTION_ACCEPT_AGREEMENT`, etc. Each action now documents its *effect* (verb-object), not a vague state machine concept.

### Incident 3: Inconsistent Subject Prefixes

Early statuses mixed bare and prefixed forms: `STATUS_APPLICATION_RECEIVED` next to `STATUS_IN_REVIEW` (missing subject), then `STATUS_AGREEMENT_OFFERED` next to `STATUS_AGREED` (too bare; by whom? applicant or FC?). Grep searches for "agreement accepted" yielded false positives on unrelated documents.

**Fix:** Enforced subject-first naming. All statuses now explicitly name their subject: `STATUS_APPLICATION_IN_REVIEW`, `STATUS_AGREEMENT_AWAITING_APPLICANT_ACCEPTANCE`, `STATUS_AGREEMENT_FC_APPROVED`. This made cross-reference searches reliable.

---

## Workflow Element Naming in Practice

### Woodland Workflow Example

Here's how the rules apply to a real workflow:

```
Phases:
  PHASE_PRE_AWARD          (organizing container before case is funded)
  PHASE_POST_AGREEMENT     (container for post-award lifecycle)

Stages (within PHASE_PRE_AWARD):
  STAGE_INITIAL_ASSESSMENT  (case just arrived; caseworker reviews eligibility)
  STAGE_REVIEWING_APPLICATION  (fact-finding and scrutiny underway)
  STAGE_AGREEMENT_WITH_APPLICANT  (applicant is working with caseworker on terms)
  STAGE_AGREEMENT_SUBMITTED_FOR_FC_REVIEW  (moved to FC; awaiting their decision)

Statuses (example from STAGE_AGREEMENT_SUBMITTED_FOR_FC_REVIEW):
  STATUS_APPLICATION_RECEIVED  (entry state; read-only; START_REVIEW button available)
  STATUS_AGREEMENT_OFFERED  (caseworker issued an offer; awaiting applicant response)
  STATUS_AGREEMENT_ACCEPTED  (applicant confirmed acceptance)
  STATUS_AGREEMENT_GENERATING  (GAS is composing the legal document; auto-progresses on completion event)
  STATUS_AGREEMENT_SIGNED  (final state of the stage; applicant signed)

Actions:
  ACTION_APPROVE_APPLICATION
  ACTION_REQUEST_MORE_INFORMATION
  ACTION_FORWARD_TO_FC
  ACTION_CONFIRM_AGREEMENT_SENT

Processes (GAS internal):
  GENERATE_OFFER  (compose the offer document)
  STORE_AGREEMENT_CASE  (persist to casestore)
  ACCEPT_AGREEMENT  (record applicant acceptance)

Tasks:
  TASK_CRM_RECORD_CREATION  (the work of creating a linked Dynamics record)
  TASK_AGREEMENT_DELIVERY_TO_APPLICANT  (the work of sending the offer)
  TASK_FC_REVIEW_OUTCOME  (the work of recording FC's decision)

Task Outcomes (statusOptions):
  STATUS_CRM_RECORD_CREATED  (task completed; record created)
  STATUS_CRM_RECORD_FAILED  (task failed; error logged)
  STATUS_FC_REVIEW_APPROVED  (FC signed off)
  STATUS_FC_REVIEW_REJECTED  (FC sent back for revisions)
```

All elements follow the rules:
- Phases and stages are stative (places).
- Statuses are past-participle or adjective (current condition).
- Actions are imperative verb-object (what the caseworker does).
- Processes are imperative verb-object (internal GAS commands).
- Tasks are noun phrases (the work item).
- Task outcomes are past-participle (what the task carries).
- Every status includes its subject.

---

## Applying the Rules to New Workflows

When authoring a new workflow:

1. **List every distinct phase.** Name each as a descriptor: `PHASE_[ADJECTIVE]_[NOUN]`. Examples: `PHASE_INITIAL_ASSESSMENT`, `PHASE_ACTIVE_DELIVERY`, `PHASE_CLOSEOUT`.

2. **For each phase, list the stages (case positions).** Use gerund, possessor, or past-participle: `STAGE_[WORK/CONDITION]`. Ask: where is the case *right now*? Not where is it going.

3. **For each stage, list statuses.** Statuses are substates within a stage. Use past-participle or adjective: `STATUS_[SUBJECT]_[CONDITION]`. Read it aloud: "the case is currently [condition]". If you stumble, rename.

4. **For each status, list transitions.** Each transition carries an `action` object or `null` (event-driven). If an action, name it: `ACTION_[VERB]_[OBJECT]`. Examples: `ACTION_SUBMIT_FOR_REVIEW`, `ACTION_REJECT_APPLICATION`, `ACTION_SCHEDULE_SITE_VISIT`.

5. **Validate action names against the application.** For each action code, search the codebase for the transition that carries it. Ensure the name matches the *effect* (e.g., where `ACTION_FORWARD_TO_FC` is used, verify it moves the case to an FC review stage).

6. **For each stage with tasks, define the tasks.** Use noun phrases: `TASK_[WORK]`. Examples: `TASK_SITE_INSPECTION`, `TASK_FINANCIAL_AUDIT`, `TASK_DELIVERABLE_VERIFICATION`.

7. **For each task, define statusOptions (outcomes).** Use past-participle: `STATUS_[TASK_NAME]_[RESULT]`. Examples: `STATUS_SITE_INSPECTION_PASSED`, `STATUS_SITE_INSPECTION_FAILED_SAFETY_HAZARD`.

---

## Cross-Reference and Consistency

When workflows or systems interact, naming consistency prevents cognitive load:

- If `fg-gas-backend` issues an event `application.status.updated` with payload `{ newStatus: "PHASE_X:STAGE_Y:STATUS_Z" }`, the event's "current place" must match the receiving workflow's definition.
- If `grants-ui` displays status to the applicant, it should use human-friendly labels (defined in a separate i18n or label map), not the code itself. The code is for developers; labels are for users.
- When exporting data to Dynamics or a data warehouse, use the code names as identifiers. Do not translate them; they are machine-addressable.

---

## Troubleshooting

**Q: I have a status that describes a transitional moment, not a stable place. What do I do?**

A: Transitional moments are almost always better captured as *task outcomes* or *event payloads*, not statuses. For example:
- Don't create `STATUS_AGREEMENT_BEING_GENERATED`. Instead, use `STATUS_AGREEMENT_GENERATING` (adjective; the case *is* generating) or better yet, have the status last until the agreement is ready, then progress to `STATUS_AGREEMENT_READY` on a `GENERATE_AGREEMENT` process completion event.

**Q: I have two related statuses: one for "applicant must act" and one for "applicant acted". Should I name them both?**

A: Yes, both need distinct names:
- `STATUS_AGREEMENT_AWAITING_APPLICANT_ACCEPTANCE` (current place: waiting for applicant response)
- `STATUS_AGREEMENT_ACCEPTED` (current place: applicant confirmed)

They are different conditions; they need different names. Don't try to collapse them into a single status with conditional logic.

**Q: What if a workflow element is temporary or experimental?**

A: Don't flag it specially in the name. If you're unsure whether a stage will ship, document that assumption separately (in code comments or architectural notes), but don't invent a naming convention for it. If it's shipped, it follows the rules.

**Q: Can I abbreviate?**

A: Only when the abbreviation is universally understood in context. Examples:
- `FC` for "Funding Commissioner" (consistent across all Defra grants) ✓
- `CRM` for "CRM record creation task" (Dynamics CRM is organizational context) ✓
- `KPI` for anything KPI-related (universally recognized) ✓
- `ERR_` for error codes (never; spell it out: `ERROR_`, `FAILED_`, or `INCOMPLETE_`) ✗
- Single-letter abbreviations (e.g., `STATUS_A`, `ACTION_B`) ✗

When in doubt, spell it out.

---

## Validating Your Workflow Definition

Before merging a workflow definition:

1. Read every state code aloud and complete: "the case is currently …". Does it sound like a place?
2. Read every action code aloud: "[caseworker] [ACTION_CODE]". Does it read like a command?
3. Grep for bare statuses (e.g., `STATUS_IN_REVIEW`, `STATUS_ACCEPTED`) without subject prefixes. Rename them.
4. Check for imperative stage names (verbs in the infinitive: `send`, `forward`, `create`). Rename them to stative forms.
5. Verify every action code has a *unique* transition path. `ACTION_CONTINUE` that appears twice in different stages should be renamed contextually.
6. Search the codebase for the action code. Verify the transition target (e.g., that `ACTION_FORWARD_TO_FC` actually moves the case to an FC review stage).

---

## See Also

- `/Users/martins/workspace/ee/defra/fg-cw-backend/docs/agent/workflow-definitions.md` — Workflow definition structure, how cases progress, and runtime validity rules.
- `fg-gas-backend/src/grants/schemas/grant/code.js` — Grant code format validation (kebab-case lowercase).
- `fg-cw-backend/src/cases/schemas/task.schema.js` — Task code validation (SCREAMING_SNAKE_CASE).
