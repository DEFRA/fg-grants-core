# Cross-System Architecture: Reference (Agent-Oriented)

**Type**: Explanation (understanding-oriented reference)  
**Audience**: Automated systems, code generators, debugging tools  
**Scope**: GAS ↔ CW ↔ AS ↔ grants-ui state synchronization  
**Lines**: ~150

---

## Bounded Contexts

| System | Collection | Role | File Location |
|---|---|---|---|
| **GAS** | `applications` | Owns application record. Workflow def in `grants` collection. | `fg-gas-backend/src/grants/models/grant.js:69-91` (routing), `:158-182` (validation) |
| **CW** | `cases` | Owns case record, tasks, timeline. Workflow def in `workflows` collection. | `fg-cw-backend/src/cases/models/case.js#progressTo` |
| **AS** | `agreements` | Owns agreement document. Lifecycle: offered, accepted, etc. | `farming-grants-agreements-api` |
| **grants-ui** | session cache | Applicant-facing form + redirect rules. | `grants-ui/src/server/status/status-helper.js:36-52` |

---

## Event Types and Routes

| Event | Producer → Consumer | When | Type |
|---|---|---|---|
| `application.status.updated` | GAS → CW | GAS state change (every transition) | Broadcast |
| `cloud.defra.{env}.fg-cw-backend.case.status.updated` | CW → GAS | Caseworker action or CW state change | Broadcast |
| `io.onsite.agreement.status.updated` | AS → GAS | Agreement lifecycle (offered, accepted, etc.) | Broadcast |
| `createAgreement` command | GAS → AS | Side-effect process `GENERATE_OFFER` fires | Direct call |

All events use inbox/outbox pattern (exactly-once semantics, 5 retries, dead-letter on failure).

---

## Asymmetric Coupling: The Two Load-Bearing Facts

### Fact 1: CW → GAS is Selective (externalStatusMap routing)

When CW publishes `case.status.updated`, GAS only processes it if `externalStatusMap` has a matching route:
- **Key**: `(currentStage, source, code)`
- **Current stage**: GAS's current position's stage (e.g., `STAGE_REVIEWING_APPLICATION`)
- **Source**: `"CW"` or `"AS"`
- **Code**: Inbound event code (e.g., `"STATUS_APPLICATION_IN_REVIEW"`)
- **Lookup**: GAS finds route in `externalStatusMap.phases[N].stages[M].statuses[K]` where `stages[M].code == currentStage`
- **Unmapped events**: Ignored (or dead-lettered in older code; current: log+continue per Option A in slim proposal)

**Implication**: CW can have states GAS doesn't route. CW can add statuses without breaking GAS.

### Fact 2: GAS → CW is Verbatim (no filtering)

When GAS publishes `application.status.updated`, CW's inbox subscriber applies the position directly:
- **Position format**: `"PHASE:STAGE:STATUS"` (GAS's current position)
- **CW lookup**: Finds stage by code in `workflows` collection
- **If not found**: `Error: Stage with code "X" not found` → retry 5 times → dead-letter
- **Apply**: Transitions case to that stage/status, no pre-validation

**Implication**: Every stage code GAS can publish must exist in CW's workflow definition.

**Critical**: Stage codes must match exactly. If GAS publishes `STAGE_AGREEMENT_ACCEPTED` and CW's workflow has `STAGE_FORWARDING_TO_FC`, the apply fails (real incident: `wmp-8a9-8fa`).

---

## GAS Routing: Two-Gate Model

GAS has two validation gates for inbound events:

### Gate 1: externalStatusMap Routing

```javascript
// fg-gas-backend/src/grants/models/grant.js:69-91
mapExternalStateToInternalState(currentPhase, currentStage, externalRequestedState, sourceSystem) {
  const statusMapping = #findExternalStatusMapping(
    currentPhase,
    currentStage,
    externalRequestedState,
    sourceSystem
  );
  
  if (!statusMapping) {
    return { valid: false };  // No route found
  }
  
  return #parseMappedToField(statusMapping.mappedTo, currentPhase, currentStage);
}
```

**Input**: `(currentPhase, currentStage, externalRequestedState, sourceSystem)`  
**Output**: `{ valid: boolean, targetPhase, targetStage, targetStatus }`  
**Failure**: Returns `{ valid: false }` if no route in `externalStatusMap`.

---

### Gate 2: validFrom Validation + Processes

```javascript
// fg-gas-backend/src/grants/models/grant.js:158-182
isValidTransition(targetPhase, targetStage, targetStatus, currentStatus) {
  const statusDef = findStatusDefinition(targetPhase, targetStage, targetStatus);
  
  if (!statusDef) {
    return { valid: false, processes: [] };
  }
  
  if (!statusDef.validFrom || statusDef.validFrom.length === 0) {
    return {
      valid: true,
      processes: statusDef.processes || []
    };
  }
  
  const isValid = #isValidFromMatch(statusDef.validFrom, currentStatus);
  
  return {
    valid: !!isValid,
    processes: isValid?.processes
  };
}
```

**Input**: `(targetPhase, targetStage, targetStatus, currentStatus)`  
**Output**: `{ valid: boolean, processes: string[] }`  
**`validFrom` structure**:
```json
"validFrom": [
  {
    "code": "PHASE_PRE_AWARD:STAGE_REVIEWING_APPLICATION:STATUS_AGREEMENT_GENERATING",
    "processes": ["GENERATE_OFFER", "STORE_AGREEMENT_CASE"]
  }
]
```
**Matching**: Compares `code` (fully qualified or bare status) against `currentStatus`. If match found and `valid: true`, returns associated `processes[]`.

---

## Woodland Workflow: Current Slim Model

| Stage | Statuses | Notable Routes |
|---|---|---|
| `STAGE_REVIEWING_APPLICATION` | `STATUS_APPLICATION_RECEIVED`, `STATUS_AGREEMENT_GENERATING` | `CW:STATUS_AGREEMENT_GENERATING` → same; `AS:offered` → `STAGE_PREPARING_AGREEMENT:STATUS_AGREEMENT_READY_FOR_APPLICANT` + `GENERATE_OFFER` |
| `STAGE_PREPARING_AGREEMENT` | `STATUS_AGREEMENT_READY_FOR_APPLICANT` | `CW:STATUS_AGREEMENT_OFFERED` → `STAGE_AGREEMENT_WITH_APPLICANT:STATUS_AGREEMENT_OFFERED` + `STORE_AGREEMENT_CASE` |
| `STAGE_AGREEMENT_WITH_APPLICANT` | `STATUS_AGREEMENT_OFFERED` | `AS:accepted` → `STAGE_AGREEMENT_ACCEPTED:STATUS_AGREEMENT_ACCEPTED` + `ACCEPT_AGREEMENT` |
| `STAGE_AGREEMENT_ACCEPTED` | `STATUS_AGREEMENT_ACCEPTED` | `CW:STATUS_APPLICATION_COMPLETED` → `STAGE_APPLICATION_COMPLETED:STATUS_COMPLETED` |
| `STAGE_APPLICATION_COMPLETED` | `STATUS_COMPLETED` | Terminal stage. No outbound transitions. |

**Key processes**: `GENERATE_OFFER` (fires on `STATUS_AGREEMENT_GENERATING`), `STORE_AGREEMENT_CASE` (on `STATUS_AGREEMENT_READY_FOR_APPLICANT`), `ACCEPT_AGREEMENT` (on `STATUS_AGREEMENT_ACCEPTED`).

**Removed in slim**: `STATUS_IN_REVIEW`, `STATUS_AWAITING_FC` (with explicit ignore entries in `externalStatusMap`). `STAGE_FC_REVIEW` (no longer needed).

**Unrouted CW events** (explicit ignore in map):
- `CW:STATUS_APPLICATION_IN_REVIEW` while in `STAGE_REVIEWING_APPLICATION` → no-op
- `CW:STATUS_APPLICATION_AWAITING_FC` while in `STAGE_AGREEMENT_ACCEPTED` → no-op

---

## Grants-UI Status Contract

**Location**: `grants-ui/src/server/status/status-helper.js:36-52`

**Contract**: Redirect rules match on `(fromGrantsStatus, gasStatus)`.  
- `gasStatus` is comma-separated list of status codes (e.g., `"STATUS_AGREEMENT_OFFERED,STATUS_APPLICATION_COMPLETED"`)
- Matching is **status code only**, not phase/stage
- Example rule (woodland, post-slim):
```yaml
- fromGrantsStatus: 'SUBMITTED'
  gasStatus: 'STATUS_AGREEMENT_OFFERED,STATUS_APPLICATION_COMPLETED'
  toGrantsStatus: 'SUBMITTED'
  toPath: /agreement
```

**Critical**: When renaming a status in GAS, update the corresponding redirect rules in `grants-ui/src/server/common/forms/definitions/*.yaml`.

---

## Incident Catalogue (with citations)

| Incident | Symptom | Root Cause | Fix | Gate Failed |
|---|---|---|---|---|
| `wmp-nya-xnb` | GAS stuck at `STATUS_AGREEMENT_READY_FOR_APPLICANT`; CW at `STATUS_AGREEMENT_OFFERED` | `externalStatusMap` missing route for `(STAGE_SEND_AGREEMENT_TO_APPLICANT, CW:STATUS_AGREEMENT_OFFERED)` | Add route entry under `STAGE_SEND_AGREEMENT_TO_APPLICANT` | Gate 1 (routing) |
| `wmp-va7-s2b` | Inbox dead-letter on `AS:accepted` event; GAS at `STAGE_SEND_AGREEMENT_TO_APPLICANT` | Route missing *and* `validFrom` referenced nonexistent stage (`STAGE_SEND_AGREEMENT_TO_APPLICANT` instead of `STAGE_PREPARING_AGREEMENT`) | Add route; fix `validFrom` to reference correct source stage | Gate 1 + Gate 2 |
| `wmp-8a9-8fa` | CW inbox dead-letter on GAS event; CW workflow had `STAGE_FORWARDING_TO_FC` but GAS published `STAGE_AGREEMENT_ACCEPTED` | Asymmetric coupling violated: stage codes must match | Rename CW stage to `STAGE_AGREEMENT_ACCEPTED` | CW apply (verbatim coupling) |

**Source**: `/Users/martins/workspace/ee/defra/fg-grants-core/docs/adr/slim-gas-workflow-proposal.md§9` (decisions) and `§9a` (consequences).

---

## Character-Set Constraints

| Element | Format | Regex | Enforced In |
|---|---|---|---|
| Grant/workflow code | kebab-case, lowercase | `^[a-z0-9-]+$` | `fg-gas-backend/src/grants/schemas/grant/code.js` |
| Phase, stage, status, action, process, task codes | SCREAMING_SNAKE_CASE | `^[A-Z0-9_]+$` | `fg-cw-backend/src/cases/schemas/task.schema.js:12` (strict); GAS conventional |

---

## externalStatusMap Structure (Minimal Example)

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
                "code": "offered",
                "source": "AS",
                "mappedTo": "PHASE_PRE_AWARD:STAGE_PREPARING_AGREEMENT:STATUS_AGREEMENT_READY_FOR_APPLICANT"
              },
              {
                "code": "PHASE_PRE_AWARD:STAGE_REVIEWING_APPLICATION:STATUS_APPLICATION_IN_REVIEW",
                "source": "CW",
                "mappedTo": null,
                "ignore": true
              }
            ]
          }
        ]
      }
    ]
  }
}
```

**Notes**:
- Routes indexed by `stages[].code` (GAS's *current* stage when event arrives)
- CW event codes are fully qualified (`PHASE:STAGE:STATUS`); AS codes are simple (`"offered"`)
- `mappedTo: null` + `ignore: true` = explicitly ignore this event
- `mappedTo` may be fully qualified (`PHASE:STAGE:STATUS`), stage-relative (`::STATUS`), or status-only (`STATUS`)

---

## See Also

- `/Users/martins/workspace/ee/defra/fg-grants-core/docs/cross-system-architecture.md` — Human-oriented explanation (narrative, context, why)
- `/Users/martins/workspace/ee/defra/fg-grants-core/docs/adr/slim-gas-workflow-proposal.md` — Worked example (woodland slim migration, decisions, incidents)
- `/Users/martins/workspace/ee/defra/fg-grants-core/docs/naming-conventions.md` — State naming rules and lessons learned
- `/Users/martins/workspace/ee/defra/fg-cw-backend/docs/agent/workflow-definitions.md` — CW workflow structure (agent-oriented)

---

**Document history**:
- 2026-05-26: Initial draft. Tables, citations, asymmetric coupling, incident catalogue.
