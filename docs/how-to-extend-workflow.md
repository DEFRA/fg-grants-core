# How to Extend the Grant + Casework Workflow

**Type**: How-to Guide (DIVIO/Diataxis)  
**Audience**: Engineers extending or modifying grant workflows across multiple services  
**Scope**: Cross-cutting procedures that span `fg-gas-backend`, `fg-cw-backend`, and `grants-ui`. Single-system CW concerns are documented at `/Users/martins/workspace/ee/defra/fg-cw-backend/docs/creating-workflow-definitions.md`.  
**Date**: 2026-05-26

---

## Companion Docs — Read These First

This guide assumes you have read or can reference:

- **[Naming Conventions](./naming-conventions.md)** — Rules for state and action code naming (stative vs. imperative, subject-first policy).
- **[Cross-System Architecture](./cross-system-architecture.md)** — *Why* the architecture is this way, especially:
  - §3: Asymmetric Coupling (GAS → CW must have every stage code; CW → GAS is selective via `externalStatusMap`)
  - §4: Anti-Mirror Principle (GAS doesn't need to mirror every CW state)
- **[State Flow: GAS ↔ CW ↔ Agreements Service](./state-flow-gas-cw.md)** — Happy-path lifecycle walkthrough with state diagrams.
- **[Slim GAS Workflow Proposal](./adr/slim-gas-workflow-proposal.md)** — A worked example of a major rename+slim across both systems.
- **[Creating Casework Workflow Definitions](../../fg-cw-backend/docs/creating-workflow-definitions.md)** — Single-system CW concerns (pages, tabs, UI components, task theming).
- **[Future Improvements](./future-improvements.md)** — Tooling (Linter, Reshape CLI, Maven agent) that will automate some of these procedures. Until those ship, follow the procedures in this guide.

---

## Quick Reference: File Locations

```
fg-gas-backend/
  src/grants/services/apply-event-status-change.service.js
  test/fixtures/wmp/<scheme>.json                        # GAS workflow definition
  
fg-cw-backend/
  src/cases/subscribers/inbox.subscriber.js
  test/fixtures/<scheme>-workflow-definition.json        # CW workflow definition
  
grants-ui/
  src/server/common/forms/definitions/<scheme>.yaml      # Per-scheme redirect rules
  
fg-grants-core/
  compose.yml                                             # Docker Compose for local testing
```

---

## Procedure 1: Add a New State

**Goal:** Add a new workflow state (stage or status) to GAS, CW, or both, ensuring load-bearing states synchronise correctly.

**When to use:** You need a case to occupy a new position in the workflow. The decision whether to add it only to CW or to both systems is documented below.

**Steps:**

1. **Decide whether the state is load-bearing.** Apply both checks:
   - Does grants-ui need to redirect on this state? (yes if applicants must see it in the UI)
   - Will it fire a `validFrom.processes[]` side-effect? (e.g. `GENERATE_OFFER`, `ACCEPT_AGREEMENT`)

   If **yes** to either → load-bearing. **Add to both GAS and CW.**
   If **no** to both → caseworker-internal. **Add to CW only.** GAS will ignore the event.

   Examples — load-bearing: `STAGE_AGREEMENT_ACCEPTED`, `STAGE_AGREEMENT_GENERATING`. Caseworker-internal: `STATUS_APPLICATION_IN_REVIEW`, `STAGE_FC_REVIEWING`.

   See [Cross-System Architecture §5: Anti-Mirror Principle](./cross-system-architecture.md#anti-mirror) for the rationale.

2. **Follow the naming conventions.** Read [Naming Conventions](./naming-conventions.md) before authoring codes.
   - **Stages** are stative (gerund, possessor, or past-participle). Never imperative. Examples: `STAGE_REVIEWING_APPLICATION`, `STAGE_AGREEMENT_WITH_APPLICANT`, `STAGE_AGREEMENT_ACCEPTED`.
   - **Statuses** are past-participle or adjective, with subject prefix. Examples: `STATUS_APPLICATION_RECEIVED`, `STATUS_AGREEMENT_GENERATING`, `STATUS_AGREEMENT_ACCEPTED`.
   - All codes are SCREAMING_SNAKE_CASE.

3. **Add to CW workflow definition.** Edit `/Users/martins/workspace/ee/defra/fg-cw-backend/test/fixtures/<scheme>-workflow-definition.json`.
   - Add the stage to the relevant phase's `stages[]` array with `code`, `name`, `description`, and `statuses[]`.
   - Add the status(es) to the stage's `statuses[]` array with `code` and `validFrom[]` (which may be empty for entry states).
   - If the status is interactive (caseworkers see tasks and action buttons), set `interactive: true`; otherwise `interactive: false`.
   - If you need this state to respond to external events or caseworker actions, add `transitions[]` with `action` (caseworker button) or `action: null` (event-driven).

4. **If load-bearing: add to GAS workflow definition.** Edit `/Users/martins/workspace/ee/defra/fg-gas-backend/test/fixtures/wmp/<scheme>.json`.
   - Add the stage to the relevant phase's `stages[]` array with `code`, `name`, `description`, and `statuses[]`.
   - Add the status(es) to the stage's `statuses[]` array with `code` and `validFrom[]`.
   - Each `validFrom` entry declares the source state and any side-effect `processes[]` that fire on entry. Example:
     ```json
     {
       "code": "STATUS_AGREEMENT_GENERATING",
       "validFrom": [
         {
           "code": "STATUS_APPLICATION_RECEIVED",
           "processes": ["GENERATE_OFFER"]
         }
       ]
     }
     ```

5. **If load-bearing and driven by external events: add to GAS `externalStatusMap`.** Edit `/Users/martins/workspace/ee/defra/fg-gas-backend/test/fixtures/wmp/<scheme>.json`, under `externalStatusMap.phases[].stages[]`.
   - Locate the stage where GAS will be when the inbound event arrives (the *current* stage, not the target).
   - Add a route entry under that stage's `statuses[]`:
     ```json
     {
       "code": "<inbound_code>",
       "source": "CW" or "AS",
       "mappedTo": "PHASE_X:STAGE_Y:STATUS_Z"
     }
     ```
   - Example: When GAS is in `STAGE_REVIEWING_APPLICATION` and CW emits `STATUS_AGREEMENT_GENERATING`, route to GAS's `STATUS_AGREEMENT_GENERATING` in the same stage:
     ```json
     {
       "code": "PHASE_PRE_AWARD:STAGE_REVIEWING_APPLICATION:STATUS_AGREEMENT_GENERATING",
       "source": "CW",
       "mappedTo": "PHASE_PRE_AWARD:STAGE_REVIEWING_APPLICATION:STATUS_AGREEMENT_GENERATING"
     }
     ```

6. **If side-effect: register the process handler in GAS.** Edit `/Users/martins/workspace/ee/defra/fg-gas-backend/src/grants/services/apply-event-status-change.service.js`.
   - Locate the `getHandlerForProcess()` function (or equivalent).
   - Add a new case for your process code (e.g., `"GENERATE_OFFER"`), mapping it to the service method that implements the side-effect.
   - Ensure the method:
     - Accepts the grant and application context.
     - Performs the side-effect (e.g., calling Agreements Service API, writing to a datastore).
     - Does NOT modify the application state directly (state changes are declared in `validFrom` rules, not in the process handler).

7. **If the state is accessible via grants-ui: add redirect rules.** Edit `/Users/martins/workspace/ee/defra/grants-ui/src/server/common/forms/definitions/<scheme>.yaml`.
   - The `redirectRules[]` array maps status codes to applicant-facing pages. Add an entry:
     ```yaml
     - fromGrantsStatus: '<previous_status>'
       gasStatus: '<your_new_status>'
       toGrantsStatus: '<new_applicant_facing_status>'
       toPath: /your-page
     ```
   - The `gasStatus` field uses only the status code, not the full position (phase:stage:status).

8. **Verify the asymmetric-coupling invariant.** Every stage code GAS can publish must exist in CW. Run this check:
   - In GAS's `validFrom` rules and `externalStatusMap`, find every **stage code** that GAS can reach (extract all `mappedTo` target values).
   - In CW's workflow definition, verify every one of those stage codes exists in some phase's stages list. If not, add a placeholder stage with at least one status (even if CW never uses it operationally).

9. **Write migrations for both systems.** Create a migration file in each repo's migrations directory.
   - **GAS migration** (e.g., `/Users/martins/workspace/ee/defra/fg-gas-backend/migrations/20260526-add-new-state.js`):
     - Use the delete-and-insert pattern (not updateOne with dot-notation). Load the fixture, update it in memory, and replace the whole document:
       ```javascript
       module.exports = {
         async up(db) {
           const fixture = require('../test/fixtures/wmp/woodland.json');
           await db.collection('grants').replaceOne(
             { code: 'woodland' },
             fixture,
             { upsert: true }
           );
         }
       };
       ```
   - **CW migration** (same pattern):
     - Load the CW fixture, update it, replace the whole `workflows` document.

10. **Test locally.**
    - Push the GAS fixture to local MongoDB:
      ```bash
      cd /Users/martins/workspace/ee/defra/fg-gas-backend && \
        node -e "process.stdout.write(require('fs').readFileSync('test/fixtures/wmp/woodland.json','utf8'))" | \
        docker compose -f /Users/martins/workspace/ee/defra/fg-grants-core/compose.yml \
          exec -T mongodb mongosh --quiet "mongodb://mongodb:27017/fg-gas-backend?replicaSet=mongoRepl" \
          --eval 'db.grants.replaceOne({code:"woodland"}, JSON.parse(fs.readFileSync(0,"utf8")), {upsert: true})'
      ```
    - Push the CW fixture similarly, but target the `workflows` collection and the `fg-cw-backend` database.
    - Create a fresh application:
      - Submit via the grants-ui frontend, or create a document directly in the `applications` collection.
    - Walk it through the workflow: perform actions that should transition it to your new state.
    - Verify the position updates in both GAS and CW (use `docker compose exec -T mongodb mongosh` and query `applications` and `cases` collections).
    - Verify any side-effects fire (check logs, check Agreements Service state if applicable).

11. **If you bumped into a dead-lettered inbox event during testing**, see **Procedure 8: Recover a Dead-Lettered Inbox Event** below.

**Verify:** 
- [ ] GAS fixture compiles without schema errors (run the GAS test suite, or attempt fixture load).
- [ ] CW fixture compiles without schema errors (run the CW test suite, or attempt fixture load).
- [ ] Asymmetric-coupling check passes: every GAS stage code exists in CW.
- [ ] New state code follows naming conventions (read-aloud test: "the case is currently [code]" sounds natural).
- [ ] For load-bearing states: `externalStatusMap` entries exist and route to the correct target.
- [ ] For load-bearing states with side-effects: process handler is registered and fires.
- [ ] Migrations are written and tested locally.

**See also:** 
- [Naming Conventions](./naming-conventions.md) — Detailed rules and lessons from incidents
- [Cross-System Architecture §3](./cross-system-architecture.md#asymmetric-coupling) — The asymmetric-coupling invariant
- [Cross-System Architecture §4](./cross-system-architecture.md#anti-mirror) — The anti-mirror principle and when to add CW-only states
- [State Flow](./state-flow-gas-cw.md) — Two routing gates that protect state transitions

---

## Procedure 2: Rename a State

**Goal:** Rename a state code in one or both systems while preserving the workflow logic.

**When to use:** You're harmonising naming conventions, fixing a misnaming, or changing a state's semantic meaning.

**Steps:**

1. **Update the GAS fixture.** Edit `/Users/martins/workspace/ee/defra/fg-gas-backend/test/fixtures/wmp/<scheme>.json`.
   - Find every occurrence of the old code:
     - In `phases[].stages[].code` (if you're renaming a stage).
     - In `phases[].stages[].statuses[].code` (if you're renaming a status).
     - In `phases[].stages[].statuses[].validFrom[].code` (source state references).
     - In `externalStatusMap` (all three places: the `code` field, the `mappedTo` field, and the full position strings).
   - Replace with the new code everywhere.

2. **Update the CW fixture.** Edit `/Users/martins/workspace/ee/defra/fg-cw-backend/test/fixtures/<scheme>-workflow-definition.json`.
   - Find every occurrence of the old code:
     - In `phases[].stages[].code` (if renaming a stage).
     - In `phases[].stages[].statuses[].code` (if renaming a status).
     - In `phases[].stages[].statuses[].transitions[].targetPosition` (full position strings).
   - Replace with the new code everywhere.

3. **If the renamed state is matched by grants-ui:** Edit `/Users/martins/workspace/ee/defra/grants-ui/src/server/common/forms/definitions/<scheme>.yaml`.
   - Update the `gasStatus` field in any redirect rule that references the old code.

4. **If the renamed code is a `STATUS_*` and CW has a corresponding `externalStatusMap` route**, update that too. Find the route entry where `code` matches the old status code and update the `code` field and any full position strings in `mappedTo`.

5. **Decide in-flight case handling.** If there are existing applications in production/staging at the old state:
   - **Option A: Rewrite existing data.** Write a migration that updates all existing cases/applications to the new code:
     ```javascript
     async up(db) {
       await db.collection('applications').updateMany(
         { 'position': { $regex: /OLD_CODE/ } },
         { $set: { 'position': 'PHASE:STAGE:NEW_CODE' } }
       );
       await db.collection('cases').updateMany(
         { 'position': { $regex: /OLD_CODE/ } },
         { $set: { 'position': 'PHASE:STAGE:NEW_CODE' } }
       );
     }
     ```
   - **Option B: Delete and recreate.** Delete existing applications at that state, have users resubmit. This avoids rewriting history but loses audit trail. Choose Option B only if there are very few in-flight cases. See **[Slim GAS Workflow Proposal §6](./adr/slim-gas-workflow-proposal.md)** for the trade-offs.

6. **Regenerate migrations.** Create migration files for GAS and CW that install the new fixtures.

7. **Test locally.**
   - Push the updated fixtures as in **Procedure 1, Step 10**.
   - Walk an application through the workflow. Verify it transitions using the new state code.

**Verify:**
- [ ] All occurrences of old code have been replaced in both fixtures and grants-ui yaml.
- [ ] GAS and CW fixtures compile without schema errors.
- [ ] In-flight case strategy is documented and migration is written.
- [ ] Migrations are tested locally.

**See also:**
- [Slim GAS Workflow Proposal §6](./adr/slim-gas-workflow-proposal.md) — Trade-offs between rewriting and deleting in-flight cases
- [Naming Conventions](./naming-conventions.md) — Ensure the new name follows the rules

---

## Procedure 3: Remove a State (Slim Down)

**Goal:** Delete a state code from one or both systems when it's no longer needed.

**When to use:** A state is obsolete, never used, or cosmetic (caseworker-internal mirror of GAS that fires no side-effect).

**Steps:**

1. **Verify nothing references the state you're removing.** Search both fixtures and the codebase:
   - In GAS: grep for the code in `phases`, `externalStatusMap`, `validFrom` rules, and side-effect process mappings.
   - In CW: grep for the code in `phases`, `transitions`, `targetPosition`, and conditional expressions.
   - In grants-ui: grep for the code in `gasStatus` fields.
   - In application code: search for hardcoded references in `apply-event-status-change.service.js`, `progress-case.use-case.js`, etc.

2. **If the state fires a side-effect (GAS): decide what happens to inbound events for that state.**
   - If you're keeping the state's target-side in GAS but removing the source-side routing: add an explicit **ignore entry** in `externalStatusMap`:
     ```json
     {
       "code": "OLD_STATUS",
       "source": "CW",
       "ignore": true
     }
     ```
   - If you're removing the state entirely from GAS: no entry is needed; events referencing it will be ignored (or error, depending on your error-handling strategy — see **[Slim GAS Workflow Proposal §3](./adr/slim-gas-workflow-proposal.md)**).

3. **Remove the state from GAS fixture** (if it exists there).
   - Delete the status code from `statuses[]`.
   - Delete the entire stage block if it has no remaining statuses.
   - Remove any `validFrom` rules that reference the old code as a source.
   - Remove any `externalStatusMap` routes that target the old code.

4. **Remove the state from CW fixture** (if it exists there).
   - Delete the status code from `statuses[]`.
   - Delete the entire stage block if it has no remaining statuses.
   - Remove any `transitions` that target the old code.
   - Remove any task or action references to the old code.

5. **Remove grants-ui redirect rules** that match on the old code.

6. **Regenerate migrations.** Create migration files that remove the old code from both databases.

7. **Test locally.**
   - Verify applications can still progress through the workflow without hitting the removed state.

**Verify:**
- [ ] All references to the removed code have been purged from fixtures, codebase, and grants-ui.
- [ ] GAS and CW fixtures compile without schema errors.
- [ ] If the state had inbound events, an explicit ignore entry is added (if keeping GAS on the state side) or no route exists (if removing entirely).
- [ ] Migrations are tested locally.

**See also:**
- [Slim GAS Workflow Proposal §3](./adr/slim-gas-workflow-proposal.md) — Strategy for handling unmapped inbound events

---

## Procedure 4: Add or Remove a Side-Effect Process

**Goal:** Register or unregister a process (internal side-effect in GAS) that fires when entering a particular state.

**When to use:** You need GAS to call an external service (e.g., Agreements Service) or write to a datastore when a state transition occurs.

**Steps:**

1. **Pick a code for the process.** Use imperative verb-object form per [Naming Conventions](./naming-conventions.md). Examples: `GENERATE_OFFER`, `STORE_AGREEMENT_CASE`, `ACCEPT_AGREEMENT`. All codes are SCREAMING_SNAKE_CASE.

2. **Register the handler in GAS.** Edit `/Users/martins/workspace/ee/defra/fg-gas-backend/src/grants/services/apply-event-status-change.service.js`.
   - Locate the `getHandlerForProcess()` function (or equivalent handler mapping).
   - Add a case for your process code:
     ```javascript
     case 'GENERATE_OFFER':
       return async (grant, application, event) => {
         // Call Agreements Service API
         await agreementsService.createAgreement(application.id, ...);
       };
     ```
   - The handler receives:
     - `grant`: the workflow definition (GAS fixture).
     - `application`: the application document being updated.
     - `event`: the inbound event (if any) that triggered the state change.
   - The handler should NOT update the application state directly. It should call external services and persist side-effect results (e.g., agreement ID) in the application document, but state transitions are controlled by `validFrom` rules.

3. **Declare the process in GAS fixture.** Edit `/Users/martins/workspace/ee/defra/fg-gas-backend/test/fixtures/wmp/<scheme>.json`.
   - Find the status where this process should fire (usually when entering a state).
   - Add the process code to the `validFrom[].processes[]` array of the **target status**:
     ```json
     {
       "code": "PHASE_PRE_AWARD:STAGE_REVIEWING_APPLICATION:STATUS_AGREEMENT_GENERATING",
       "processes": ["GENERATE_OFFER"]
     }
     ```

4. **If you're adding the process to an existing state, do NOT change the state's `validFrom` source codes.** The process fires in addition to existing validation; it doesn't affect which source states are allowed.

5. **Write migrations.** Create a migration that updates the GAS fixture and ensures the handler code is deployed.

6. **Test locally.**
   - Push the updated GAS fixture.
   - Walk an application to the state where the process fires.
   - Verify the side-effect executes (check logs, check external service state, check the application document for side-effect results).
   - If using Agreements Service, verify the agreement is created.

7. **To remove a process:** Reverse the steps above. Delete the process code from `validFrom[].processes[]`, remove the handler from the service, and test that applications can still transition without error (the state transition itself is unaffected; only the side-effect is removed).

**Verify:**
- [ ] Process code follows naming conventions (verb-object imperative).
- [ ] Handler is registered in the GAS service and accepts the correct parameters.
- [ ] GAS fixture declares the process on the target status's `validFrom` entry.
- [ ] GAS and CW fixtures compile without schema errors.
- [ ] Process fires when transitioning to the target state (verified locally).

**See also:**
- [State Flow §2](./state-flow-gas-cw.md#sequence-diagram--walkthrough) — Real examples of processes firing (`GENERATE_OFFER`, `STORE_AGREEMENT_CASE`, `ACCEPT_AGREEMENT`)
- [Naming Conventions](./naming-conventions.md) — Rules for process code naming

---

## Procedure 5: Add a New Caseworker Action in CW

**Goal:** Add a new button (action) that caseworkers can click to transition a case to a different state.

**When to use:** You're adding a new caseworker-driven workflow transition (e.g., "Approve Application", "Reject", "Request More Information").

**Steps:**

1. **Choose an action code.** Use imperative verb-object form: `ACTION_APPROVE_APPLICATION`, `ACTION_REQUEST_MORE_INFORMATION`, `ACTION_FORWARD_TO_FC`. See [Naming Conventions](./naming-conventions.md).

2. **Identify the source status where the action appears** and the **target status/stage** it transitions to. Example: "From `STATUS_APPLICATION_IN_REVIEW`, clicking 'Approve' moves the case to `STATUS_AGREEMENT_GENERATING`".

3. **Add the transition to CW fixture.** Edit `/Users/martins/workspace/ee/defra/fg-cw-backend/test/fixtures/<scheme>-workflow-definition.json`.
   - Find the source status in the fixture.
   - Add a transition object to its `transitions[]` array:
     ```json
     {
       "targetPosition": "PHASE_PRE_AWARD:STAGE_REVIEWING_APPLICATION:STATUS_AGREEMENT_GENERATING",
       "checkTasks": true,
       "action": {
         "code": "ACTION_APPROVE_APPLICATION",
         "name": "Approve",
         "checkTasks": true,
         "comment": null
       }
     }
     ```
   - **`checkTasks`**: If `true`, all mandatory tasks in the current stage must be completed before the caseworker can click this action.
   - **`action.comment`**: Can be `null` (no comment required), or an object with `label`, `helpText`, `mandatory` (all required if object is present).
   - **`action.confirm`**: Optional confirmation dialog.

4. **If the action's target is a NEW state**, also follow **Procedure 1: Add a New State** before testing.

5. **If the action triggers a GAS transition**, ensure GAS has the corresponding state and routing.
   - CW's `targetPosition` is the full three-part position (phase:stage:status).
   - CW publishes this position as an event: `case.status.updated` with `currentStatus = <the three-part position>`.
   - GAS receives the event and looks for a matching route in `externalStatusMap` under GAS's current stage.
   - If the route exists, GAS transitions; if not, GAS ignores it (unless you add an explicit ignore entry).

6. **Test locally.**
   - Push the CW fixture.
   - Create a case at the source status.
   - Verify the action button appears in the UI.
   - Verify clicking it transitions the case to the target status.
   - If GAS should also transition, verify GAS receives and processes the event.

**Verify:**
- [ ] Action code follows naming conventions.
- [ ] Transition's `checkTasks` and `comment` fields are set correctly.
- [ ] CW fixture compiles without schema errors.
- [ ] Action button appears in the UI at the correct stage.
- [ ] Clicking the action transitions the case (and GAS if applicable).

**See also:**
- [Creating Casework Workflow Definitions](../../fg-cw-backend/docs/creating-workflow-definitions.md) — Detailed reference on actions, comments, and confirmations
- [Naming Conventions](./naming-conventions.md) — Action code naming rules

---

## Procedure 6: Add a New Task (Caseworker Work Item)

**Goal:** Add a new task (work item) that caseworkers must complete before progressing.

**When to use:** You need to require caseworkers to perform or verify some work before a case can move forward (e.g., "Create CRM record", "Confirm agreement sent").

**Steps:**

1. **Choose a task code.** Use noun-phrase form: `TASK_CRM_RECORD_CREATION`, `TASK_AGREEMENT_DELIVERY_TO_APPLICANT`, `TASK_FC_REVIEW_OUTCOME`. See [Naming Conventions](./naming-conventions.md).

2. **Identify which stage the task belongs to.** Tasks live at the stage level, not the status level. All statuses within a stage share the stage's tasks (unless you use conditional task expressions).

3. **Add the task to the CW fixture.** Edit `/Users/martins/workspace/ee/defra/fg-cw-backend/test/fixtures/<scheme>-workflow-definition.json`.
   - Find the target stage in the fixture.
   - Locate or create the `taskGroups[]` array (a stage may have multiple task groups for organisational purposes).
   - Add a task object:
     ```json
     {
       "code": "TASK_CRM_RECORD_CREATION",
       "name": "Create CRM record",
       "mandatory": true,
       "description": [
         {
           "component": "h2",
           "content": "Create CRM Record"
         },
         {
           "component": "p",
           "content": "You must create a corresponding record in Dynamics CRM."
         }
       ],
       "statusOptions": [
         {
           "code": "STATUS_CRM_RECORD_CREATED",
           "name": "Created",
           "theme": "SUCCESS",
           "altName": "CRM record created",
           "completes": true
         },
         {
           "code": "STATUS_CRM_RECORD_FAILED",
           "name": "Failed",
           "theme": "ERROR",
           "altName": "CRM record creation failed",
           "completes": false
         }
       ],
       "conditional": null
     }
     ```

4. **Define `statusOptions[]`.** Each task outcome is a status option. At least one must have `completes: true` (the outcome that marks the task as complete).
   - `code`: Unique within the task, e.g. `STATUS_CRM_RECORD_CREATED`.
   - `name`: Label shown on the radio button (e.g., "Created").
   - `altName`: Alternative label after selection (e.g., "CRM record created").
   - `theme`: Visual theme (`NONE`, `NEUTRAL`, `INFO`, `NOTICE`, `ERROR`, `WARN`, `SUCCESS`).
   - `completes`: `true` if this outcome completes the task, `false` if it's a partial or failed outcome.

5. **If the task is conditional**, add a JSONata expression to `conditional`:
   ```json
   "conditional": "case.caseDetails.grantType = 'woodland'"
   ```
   The task appears only if the expression evaluates to true.

6. **If an action requires this task to be complete**, set `action.checkTasks: true` on the action that has a gate on task completion. See **Procedure 5** for action details.

7. **For task codes and status options**: All codes are SCREAMING_SNAKE_CASE. Status option codes follow the pattern `STATUS_<TASK>_<OUTCOME>`. See [Naming Conventions](./naming-conventions.md).

8. **Test locally.**
   - Push the CW fixture.
   - Create a case at the stage where the task belongs.
   - Verify the task appears in the task panel.
   - Mark it complete and verify it transitions to the completion outcome.
   - If an action has `checkTasks: true`, verify the action button is disabled until the task is complete.

**Verify:**
- [ ] Task code follows naming conventions.
- [ ] At least one status option has `completes: true`.
- [ ] CW fixture compiles without schema errors.
- [ ] Task appears in the UI at the correct stage.
- [ ] Task can be marked complete, and the outcome is recorded.
- [ ] Any action with `checkTasks: true` respects task completion.

**See also:**
- [Creating Casework Workflow Definitions](../../fg-cw-backend/docs/creating-workflow-definitions.md) — Detailed task reference with UI components
- [Naming Conventions](./naming-conventions.md) — Task and status option code naming

---

## Procedure 7: Add a New Event Channel (Cross-Service)

**Goal:** Wire a new event type across two or more services so that one service can trigger state changes in another.

**When to use:** You need Agreements Service (or another external system) to trigger a case state transition, or you're adding a new cross-service communication path.

**Steps:**

1. **Define the event payload.** Agree with the producer on:
   - Event type (e.g., `io.onsite.agreement.status.updated`).
   - Required fields (e.g., `status: "offered"` or `status: "accepted"`).
   - Any contextual fields (e.g., `agreementId`, `caseRef`, `clientRef`).

2. **Producer side: emit the event.**
   - In the producer service, add code that publishes the event to the message bus (using the outbox pattern).
   - Example (Agreements Service emitting agreement status):
     ```javascript
     await outbox.publish({
       type: 'io.onsite.agreement.status.updated',
       data: {
         status: 'offered',
         agreementId: agreement.id,
         caseRef: application.clientRef
       }
     });
     ```

3. **Consumer side: subscribe and route.**
   - Subscribe to the event type on the message bus (RabbitMQ topic, Kafka topic, or equivalent).
   - If the consumer is **GAS**, add a route entry to `externalStatusMap`:
     - Locate the stage where GAS will be when the event arrives.
     - Add a route entry under that stage's `statuses[]`:
       ```json
       {
         "code": "offered",
         "source": "AS",
         "mappedTo": "PHASE_PRE_AWARD:STAGE_PREPARING_AGREEMENT:STATUS_AGREEMENT_READY_FOR_APPLICANT"
       }
       ```
     - The `code` field is the inbound payload field (e.g., `"offered"` from `status: "offered"`).
     - The `mappedTo` field is the target internal state.

   - If the consumer is **CW**, add an event-driven transition in the workflow definition:
     - Find the status where the case will be when the event arrives.
     - Add a transition with `action: null`:
       ```json
       {
         "targetPosition": "PHASE_PRE_AWARD:STAGE_PREPARING_AGREEMENT:STATUS_AGREEMENT_READY_FOR_APPLICANT",
         "action": null
       }
       ```
     - Register the event type in the inbox subscriber's `useCaseMap` (in `fg-cw-backend/src/cases/subscribers/inbox.subscriber.js`):
       ```javascript
       const useCaseMap = {
         'io.onsite.agreement.status.updated': progressCaseUseCase,
         // other event types
       };
       ```

4. **Link the producer and consumer.**
   - Ensure the message bus topic/subscription is wired so the producer's events reach the consumer's inbox.
   - Verify both services have the event type registered and subscribed.

5. **Test locally.**
   - Create a case/application in the producer's state.
   - Manually emit the event (or trigger it via the producer's UI).
   - Verify it arrives at the consumer's inbox.
   - Verify the consumer processes it and transitions the case/application.

**Verify:**
- [ ] Event type, payload, and contract are documented and agreed.
- [ ] Producer emits the event with all required fields.
- [ ] Consumer has a route or transition for the event.
- [ ] Inbox subscriber registers the event type.
- [ ] Event flows end-to-end in local testing.

**See also:**
- [Cross-System Architecture §3](./cross-system-architecture.md#event-channels) — Event channel types and inbox/outbox pattern
- [State Flow §2](./state-flow-gas-cw.md#sequence-diagram--walkthrough) — Real examples of events triggering state changes

---

## Procedure 8: Recover a Dead-Lettered Inbox Event

**Goal:** Rescue an inbox event that failed to process and was moved to dead-letter state.

**When to use:** An application is stuck mid-workflow because an inbound event (e.g., an Agreements Service status change or a GAS position broadcast) failed to apply. The event is visible in the inbox collection with `status: "FAILED"` or in a dead-letter queue.

**Steps:**

1. **Find the dead-lettered event.** Connect to the appropriate MongoDB and query:
   ```bash
   docker compose exec -T mongodb mongosh --quiet \
     "mongodb://mongodb:27017/fg-gas-backend?replicaSet=mongoRepl" \
     --eval 'db.inbox.find({status: "FAILED"}).limit(10).pretty()'
   ```
   Or query by message ID or case reference:
   ```bash
   docker compose exec -T mongodb mongosh --quiet \
     "mongodb://mongodb:27017/fg-gas-backend?replicaSet=mongoRepl" \
     --eval 'db.inbox.findOne({messageId: "YOUR_MESSAGE_ID"})'
   ```

2. **Identify the root cause.** Check the event document's `error` or `claimExpiresAt` fields, and the service logs. Common causes:
   - Missing `externalStatusMap` route (event code not registered for the current stage).
   - Missing `validFrom` rule (target state doesn't accept the source state).
   - Target stage/status doesn't exist in the receiving system's workflow definition.
   - Type mismatch (event payload structure doesn't match expectation).

3. **Fix the root cause in the code or fixture.** For example:
   - If a missing route: add the entry to `externalStatusMap`.
   - If a missing stage: add it to the CW workflow definition.
   - Redeploy or manually update the fixture (see **Procedure 1, Step 10** for pushing fixtures to local MongoDB).

4. **Revive the inbox event.** Flip the status back to `"PUBLISHED"` and reset retry counters:
   ```bash
   docker compose exec -T mongodb mongosh --quiet \
     "mongodb://mongodb:27017/fg-gas-backend?replicaSet=mongoRepl" \
     --eval 'db.inbox.updateOne(
       {messageId: "YOUR_MESSAGE_ID"},
       {$set: {status: "PUBLISHED", completionAttempts: 0, claimedAt: null, claimedBy: null, claimExpiresAt: null}}
     )'
   ```

5. **Wait a few seconds** for the inbox subscriber to pick up the revived event and process it.

6. **Verify the case/application progressed.**
   ```bash
   docker compose exec -T mongodb mongosh --quiet \
     "mongodb://mongodb:27017/fg-gas-backend?replicaSet=mongoRepl" \
     --eval 'db.applications.findOne({clientRef: "YOUR_CLIENT_REF"})'
   ```
   Check that the `position` field has updated to the expected state.

7. **If the event still fails after re-reviving**, the root cause wasn't fixed. Check logs and repeat steps 2–4.

**Verify:**
- [ ] Root cause identified and fixed.
- [ ] Inbox event status is `"PUBLISHED"` after revival.
- [ ] Case/application position updated to the expected state.
- [ ] No new dead-letter for the same message ID.

**See also:**
- [State Flow §3](./state-flow-gas-cw.md#two-routing-gates-in-gas) — The two gates (routing and validation) that can cause dead-letters
- [Cross-System Architecture §6](./cross-system-architecture.md#incidents) — Real incidents showing dead-letter causes

---

## Procedure 9: Delete a Test Case and Its Trailing Data

**Goal:** Completely remove a test case from local development so you can start fresh without residual inbox/outbox events interfering.

**When to use:** You've walked a case through the workflow multiple times and accumulated dead-lettered or processed events. You want to delete the case and all its associated data across all collections.

**Steps:**

1. **Identify the case reference.** Use `clientRef` (the application reference) to find it. Example: `"wmp-test-123"`.

2. **Delete from all nine collections** (GAS and CW, both databases, plus Agreements Service). Run this mongosh script:
   ```bash
   docker compose exec -T mongodb mongosh --quiet \
     "mongodb://mongodb:27017/fg-gas-backend?replicaSet=mongoRepl" \
     --eval '
       const clientRef = "YOUR_CLIENT_REF";
       const segregationRef = "YOUR_SEGREGATION_REF"; // if applicable
       
       // GAS database
       db.applications.deleteMany({clientRef});
       db.inbox.deleteMany({"event.data.clientRef": clientRef});
       db.inbox.deleteMany({"event.data.segregationRef": segregationRef});
       db.outbox.deleteMany({"data.clientRef": clientRef});
       db.outbox.deleteMany({"data.segregationRef": segregationRef});
       
       const appDeleted = db.applications.find({clientRef}).count();
       const inboxDeleted = db.inbox.find({"event.data.clientRef": clientRef}).count();
       const outboxDeleted = db.outbox.find({"data.clientRef": clientRef}).count();
       print("GAS - Applications: " + appDeleted + ", Inbox: " + inboxDeleted + ", Outbox: " + outboxDeleted);
     '
   ```

3. **Repeat for CW database:**
   ```bash
   docker compose exec -T mongodb mongosh --quiet \
     "mongodb://mongodb:27017/fg-cw-backend?replicaSet=mongoRepl" \
     --eval '
       const clientRef = "YOUR_CLIENT_REF";
       const segregationRef = "YOUR_SEGREGATION_REF";
       
       // CW database
       db.cases.deleteMany({clientRef});
       db.fifo_locks.deleteMany({clientRef});
       db.inbox.deleteMany({"event.data.clientRef": clientRef});
       db.inbox.deleteMany({"event.data.segregationRef": segregationRef});
       db.outbox.deleteMany({"data.clientRef": clientRef});
       db.outbox.deleteMany({"data.segregationRef": segregationRef});
       
       const casesDeleted = db.cases.find({clientRef}).count();
       const inboxDeleted = db.inbox.find({"event.data.clientRef": clientRef}).count();
       const outboxDeleted = db.outbox.find({"data.clientRef": clientRef}).count();
       print("CW - Cases: " + casesDeleted + ", Inbox: " + inboxDeleted + ", Outbox: " + outboxDeleted);
     '
   ```

4. **If using Agreements Service (fg-grants-agreements-api), clean it too:**
   ```bash
   docker compose exec -T mongodb mongosh --quiet \
     "mongodb://mongodb:27017/fg-agreements-api?replicaSet=mongoRepl" \
     --eval '
       const clientRef = "YOUR_CLIENT_REF";
       const segregationRef = "YOUR_SEGREGATION_REF";
       
       db.versions.deleteMany({clientRef});
       db.versions.deleteMany({segregationRef});
       
       const versionsDeleted = db.versions.find({clientRef}).count();
       print("Agreements - Versions: " + versionsDeleted);
     '
   ```

5. **Verify all data is gone:**
   ```bash
   docker compose exec -T mongodb mongosh --quiet \
     "mongodb://mongodb:27017/fg-gas-backend?replicaSet=mongoRepl" \
     --eval 'print("GAS applications: " + db.applications.find({clientRef: "YOUR_CLIENT_REF"}).count())'
   docker compose exec -T mongodb mongosh --quiet \
     "mongodb://mongodb:27017/fg-cw-backend?replicaSet=mongoRepl" \
     --eval 'print("CW cases: " + db.cases.find({clientRef: "YOUR_CLIENT_REF"}).count())'
   ```
   Both should print `0`.

**Verify:**
- [ ] Application and case documents deleted.
- [ ] All inbox and outbox events associated with the case deleted.
- [ ] FIFO locks cleaned up.
- [ ] No residual data in Agreements Service.

**See also:**
- [Procedure 8](#procedure-8-recover-a-dead-lettered-inbox-event) — If you need to revive an event instead of deleting

---

## End of Procedures

For questions about why the architecture is this way, see [Cross-System Architecture](./cross-system-architecture.md).

For questions about state code naming, see [Naming Conventions](./naming-conventions.md).

For a real worked example of procedures 1–3 in action, see [Slim GAS Workflow Proposal](./adr/slim-gas-workflow-proposal.md).
