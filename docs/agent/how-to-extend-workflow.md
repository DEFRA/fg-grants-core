# How to Extend the Grant + Casework Workflow — Agent Reference

**Type**: How-to Guide (DIVIO/Diataxis)  
**Scope**: Cross-cutting procedures spanning GAS, CW, and grants-ui. Terse reference format.  
**Date**: 2026-05-26

See `/Users/martins/workspace/ee/defra/fg-grants-core/docs/how-to-extend-workflow.md` for full human-oriented procedures with rationale.

---

## Companion Docs

- [Naming Conventions](../naming-conventions.md) — State and action code rules
- [Cross-System Architecture](../cross-system-architecture.md) — Asymmetric coupling §3, anti-mirror §4
- [State Flow: GAS ↔ CW ↔ AS](../state-flow-gas-cw.md) — Happy path and routing gates
- [Slim GAS Workflow Proposal](../adr/slim-gas-workflow-proposal.md) — Worked example

---

## 1. Add a New State

1. Decide: load-bearing (both GAS + CW) or caseworker-internal (CW only)?
2. Name the state per [Naming Conventions](../naming-conventions.md). Stages are stative (gerund/possessor/past-participle). Statuses are past-participle with subject prefix. All SCREAMING_SNAKE_CASE.
3. Edit CW fixture: `/Users/martins/workspace/ee/defra/fg-cw-backend/test/fixtures/<scheme>-workflow-definition.json`. Add stage to phase's `stages[]`, status to stage's `statuses[]`, set `interactive: true/false`, add `transitions[]` if needed.
4. If load-bearing: edit GAS fixture `/Users/martins/workspace/ee/defra/fg-gas-backend/test/fixtures/wmp/<scheme>.json`. Add stage and status with `validFrom[]` rules and any `processes[]` side-effects.
5. If load-bearing and event-driven: edit GAS `externalStatusMap` (same fixture). Under the current stage, add route:
   ```json
   {
     "code": "<inbound_code>",
     "source": "CW" or "AS",
     "mappedTo": "PHASE:STAGE:STATUS"
   }
   ```
6. If side-effect fires: register handler in `/Users/martins/workspace/ee/defra/fg-gas-backend/src/grants/services/apply-event-status-change.service.js` in `getHandlerForProcess()`.
7. If accessible via grants-ui: edit `/Users/martins/workspace/ee/defra/grants-ui/src/server/common/forms/definitions/<scheme>.yaml`. Add redirect rule with `gasStatus: <STATUS>`.
8. Verify asymmetric-coupling invariant: every stage code GAS publishes exists in CW.
9. Write migrations (delete+insert pattern) for both GAS and CW.
10. Test locally:
    ```bash
    cd /Users/martins/workspace/ee/defra/fg-gas-backend && \
      node -e "process.stdout.write(require('fs').readFileSync('test/fixtures/wmp/woodland.json','utf8'))" | \
      docker compose -f /Users/martins/workspace/ee/defra/fg-grants-core/compose.yml \
        exec -T mongodb mongosh --quiet "mongodb://mongodb:27017/fg-gas-backend?replicaSet=mongoRepl" \
        --eval 'db.grants.replaceOne({code:"woodland"}, JSON.parse(fs.readFileSync(0,"utf8")), {upsert: true})'
    ```
    Push CW fixture similarly. Create test case. Walk it through. Verify side-effects.

---

## 2. Rename a State

1. Edit GAS fixture: `/Users/martins/workspace/ee/defra/fg-gas-backend/test/fixtures/wmp/<scheme>.json`. Replace old code everywhere: `phases[].stages[].code`, `statuses[].code`, `validFrom[].code`, `externalStatusMap` (all three places).
2. Edit CW fixture: `/Users/martins/workspace/ee/defra/fg-cw-backend/test/fixtures/<scheme>-workflow-definition.json`. Replace everywhere: `phases[].stages[].code`, `statuses[].code`, `transitions[].targetPosition`.
3. If matched by grants-ui: edit `/Users/martins/workspace/ee/defra/grants-ui/src/server/common/forms/definitions/<scheme>.yaml`. Update `gasStatus` in redirect rules.
4. If existing in-flight cases: choose (a) rewrite with migration (bulk update), or (b) delete+recreate. See [Slim GAS Workflow Proposal §6](../adr/slim-gas-workflow-proposal.md).
5. Write migrations for both systems.
6. Test locally. Push fixtures. Walk test case through.

---

## 3. Remove a State

1. Verify no references: grep fixtures + codebase for old code in `phases`, `validFrom`, `externalStatusMap`, `transitions`, `targetPosition`, grants-ui yaml, `apply-event-status-change.service.js`.
2. If removing from GAS but keeping source-side routing: add explicit ignore entry to `externalStatusMap`:
   ```json
   {
     "code": "OLD_STATUS",
     "source": "CW",
     "ignore": true
   }
   ```
3. Remove from GAS fixture: delete status/stage. Remove `validFrom` sources referencing old code. Remove `externalStatusMap` routes.
4. Remove from CW fixture: delete status/stage. Remove transitions targeting old code.
5. Remove from grants-ui yaml redirect rules.
6. Write migrations.
7. Test locally.

---

## 4. Add or Remove a Side-Effect Process

1. Pick process code (verb-object imperative): `GENERATE_OFFER`, `STORE_AGREEMENT_CASE`, `ACCEPT_AGREEMENT`. SCREAMING_SNAKE_CASE.
2. Register handler in `/Users/martins/workspace/ee/defra/fg-gas-backend/src/grants/services/apply-event-status-change.service.js`, `getHandlerForProcess()`:
   ```javascript
   case 'GENERATE_OFFER':
     return async (grant, application, event) => {
       // Call external service, persist results in application
     };
   ```
3. Edit GAS fixture. Find target status. Add process code to `validFrom[].processes[]`:
   ```json
   {
     "code": "PHASE:STAGE:STATUS",
     "processes": ["GENERATE_OFFER"]
   }
   ```
4. Write migration. Test locally. Verify side-effect fires.
5. To remove: delete handler and process from fixture. Test case transitions without side-effect.

---

## 5. Add a New Caseworker Action in CW

1. Choose action code (verb-object imperative): `ACTION_APPROVE_APPLICATION`, `ACTION_REQUEST_MORE_INFORMATION`, `ACTION_FORWARD_TO_FC`. SCREAMING_SNAKE_CASE.
2. Edit CW fixture. Find source status. Add transition to `transitions[]`:
   ```json
   {
     "targetPosition": "PHASE:STAGE:STATUS",
     "checkTasks": true/false,
     "action": {
       "code": "ACTION_...",
       "name": "Button label",
       "checkTasks": true/false,
       "comment": null or {label, helpText, mandatory}
     }
   }
   ```
3. If target is a new state: also follow Procedure 1.
4. Test locally. Verify button appears. Verify transition. Verify GAS receives event if applicable.

---

## 6. Add a New Task (Caseworker Work Item)

1. Choose task code (noun phrase): `TASK_CRM_RECORD_CREATION`, `TASK_AGREEMENT_DELIVERY_TO_APPLICANT`, `TASK_FC_REVIEW_OUTCOME`. SCREAMING_SNAKE_CASE.
2. Edit CW fixture. Find target stage. Add task to `taskGroups[]`:
   ```json
   {
     "code": "TASK_...",
     "name": "Display name",
     "mandatory": true/false,
     "description": [{component, content}...],
     "statusOptions": [
       {code, name, theme, altName, completes: true/false},
       ...
     ],
     "conditional": null or JSONata expression
   }
   ```
3. At least one status option must have `completes: true`.
4. All task codes and status option codes are SCREAMING_SNAKE_CASE. Status options follow pattern `STATUS_<TASK>_<OUTCOME>`.
5. Test locally. Verify task appears. Mark complete. Verify completion is recorded.

---

## 7. Add a New Event Channel (Cross-Service)

1. Define event payload with producer. Event type, required fields, context.
2. Producer side: emit to message bus via outbox pattern.
3. Consumer (GAS): add route to `externalStatusMap` under current stage:
   ```json
   {
     "code": "<inbound_code>",
     "source": "AS" or "CW",
     "mappedTo": "PHASE:STAGE:STATUS"
   }
   ```
4. Consumer (CW): add event-driven transition to status in fixture:
   ```json
   {
     "targetPosition": "PHASE:STAGE:STATUS",
     "action": null
   }
   ```
   Register event type in `/Users/martins/workspace/ee/defra/fg-cw-backend/src/cases/subscribers/inbox.subscriber.js` in `useCaseMap`.
5. Wire message bus subscription.
6. Test end-to-end locally.

---

## 8. Recover a Dead-Lettered Inbox Event

1. Find the event:
   ```bash
   docker compose exec -T mongodb mongosh --quiet \
     "mongodb://mongodb:27017/fg-gas-backend?replicaSet=mongoRepl" \
     --eval 'db.inbox.findOne({messageId: "YOUR_MESSAGE_ID"})'
   ```

2. Identify root cause: missing `externalStatusMap` route, missing stage in target system, or `validFrom` gate failure. Fix in code/fixture.

3. Revive the inbox event:
   ```bash
   docker compose exec -T mongodb mongosh --quiet \
     "mongodb://mongodb:27017/fg-gas-backend?replicaSet=mongoRepl" \
     --eval 'db.inbox.updateOne(
       {messageId: "YOUR_MESSAGE_ID"},
       {$set: {status: "PUBLISHED", completionAttempts: 0, claimedAt: null, claimedBy: null, claimExpiresAt: null}}
     )'
   ```

4. Wait a few seconds. Verify case/application progressed.

5. If still fails: repeat diagnosis and retry.

---

## 9. Delete a Test Case and Its Trailing Data

Delete from all nine collections (GAS inbox, outbox, applications; CW inbox, outbox, cases, fifo_locks; Agreements Service versions):

```bash
docker compose exec -T mongodb mongosh --quiet \
  "mongodb://mongodb:27017/fg-gas-backend?replicaSet=mongoRepl" \
  --eval '
    const clientRef = "YOUR_CLIENT_REF";
    const segregationRef = "YOUR_SEGREGATION_REF";
    
    db.applications.deleteMany({clientRef});
    db.inbox.deleteMany({"event.data.clientRef": clientRef});
    db.inbox.deleteMany({"event.data.segregationRef": segregationRef});
    db.outbox.deleteMany({"data.clientRef": clientRef});
    db.outbox.deleteMany({"data.segregationRef": segregationRef});
  '

docker compose exec -T mongodb mongosh --quiet \
  "mongodb://mongodb:27017/fg-cw-backend?replicaSet=mongoRepl" \
  --eval '
    const clientRef = "YOUR_CLIENT_REF";
    const segregationRef = "YOUR_SEGREGATION_REF";
    
    db.cases.deleteMany({clientRef});
    db.fifo_locks.deleteMany({clientRef});
    db.inbox.deleteMany({"event.data.clientRef": clientRef});
    db.inbox.deleteMany({"event.data.segregationRef": segregationRef});
    db.outbox.deleteMany({"data.clientRef": clientRef});
    db.outbox.deleteMany({"data.segregationRef": segregationRef});
  '

docker compose exec -T mongodb mongosh --quiet \
  "mongodb://mongodb:27017/fg-agreements-api?replicaSet=mongoRepl" \
  --eval '
    const clientRef = "YOUR_CLIENT_REF";
    const segregationRef = "YOUR_SEGREGATION_REF";
    
    db.versions.deleteMany({clientRef});
    db.versions.deleteMany({segregationRef});
  '
```

Verify:
```bash
docker compose exec -T mongodb mongosh --quiet \
  "mongodb://mongodb:27017/fg-gas-backend?replicaSet=mongoRepl" \
  --eval 'print("GAS applications: " + db.applications.find({clientRef: "YOUR_CLIENT_REF"}).count())'

docker compose exec -T mongodb mongosh --quiet \
  "mongodb://mongodb:27017/fg-cw-backend?replicaSet=mongoRepl" \
  --eval 'print("CW cases: " + db.cases.find({clientRef: "YOUR_CLIENT_REF"}).count())'
```

Both should return 0.

---

## File Locations Quick Ref

| File | Location |
|---|---|
| GAS workflow definition | `/Users/martins/workspace/ee/defra/fg-gas-backend/test/fixtures/wmp/<scheme>.json` |
| CW workflow definition | `/Users/martins/workspace/ee/defra/fg-cw-backend/test/fixtures/<scheme>-workflow-definition.json` |
| GAS event handler | `/Users/martins/workspace/ee/defra/fg-gas-backend/src/grants/services/apply-event-status-change.service.js` |
| CW event subscriber | `/Users/martins/workspace/ee/defra/fg-cw-backend/src/cases/subscribers/inbox.subscriber.js` |
| grants-ui redirect rules | `/Users/martins/workspace/ee/defra/grants-ui/src/server/common/forms/definitions/<scheme>.yaml` |

---

**For full context, rationale, and troubleshooting**: see `/Users/martins/workspace/ee/defra/fg-grants-core/docs/how-to-extend-workflow.md`
