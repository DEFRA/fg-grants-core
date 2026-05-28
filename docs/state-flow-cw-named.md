# CW State Diagram (with descriptive names)

**Source**: Extracted from [State Flow: GAS ↔ CW ↔ Agreements Service](./state-flow-gas-cw.md).
**Names from**: `fg-cw-backend/test/fixtures/woodland-workflow-definition.json` (workflow source of truth — the `*-case.json` file is a per-case instance and only carries the codes the case has reached).

Each phase, stage, status, action and task code is followed by its human-readable `name` in brackets.

```mermaid
stateDiagram-v2
    direction LR
    classDef phase fill:#1f2937,stroke:#9ca3af,stroke-width:2px,color:#f9fafb
    classDef system fill:#0f172a,stroke:#64748b,stroke-width:2px,color:#f1f5f9

    state "CW (fg-cw-backend.cases)" as CW {
        direction TB
        state PHASE_PRE_AWARD_CW:::phase {
            [*] --> C_RECEIVED
            C_RECEIVED: STAGE_REVIEWING_APPLICATION (Application received)<br/>STATUS_APPLICATION_RECEIVED (Application Received)
            C_IN_REVIEW: STAGE_REVIEWING_APPLICATION (Application received)<br/>STATUS_APPLICATION_IN_REVIEW (In Review)
            C_GENERATING: STAGE_REVIEWING_APPLICATION (Application received)<br/>STATUS_AGREEMENT_GENERATING (Agreement Generating)
            C_READY: STAGE_PREPARING_AGREEMENT (Agreement ready for applicant)<br/>STATUS_AGREEMENT_READY_FOR_APPLICANT (Agreement ready for applicant)
            C_OFFERED: STAGE_AGREEMENT_WITH_APPLICANT (Agreement with applicant)<br/>STATUS_AGREEMENT_OFFERED (Agreement offered)
            C_ACCEPTED: STAGE_AGREEMENT_ACCEPTED (Agreement accepted)<br/>STATUS_AGREEMENT_ACCEPTED (Agreement accepted)
            C_FC_AWAITING: STAGE_FC_REVIEWING (Forestry Commission review)<br/>STATUS_APPLICATION_AWAITING_FC (Awaiting Forestry Commission review)
            C_COMPLETE: STAGE_APPLICATION_COMPLETED (Application completed)<br/>STATUS_APPLICATION_COMPLETED (Application completed)

            C_RECEIVED --> C_IN_REVIEW: ACTION_START_REVIEW (Start)
            C_IN_REVIEW --> C_GENERATING: ACTION_APPROVE_APPLICATION (Continue)
            C_GENERATING --> C_READY: GAS event (AS offered)
            C_READY --> C_OFFERED: ACTION_CONFIRM_AGREEMENT_SENT (Confirm agreement sent)<br/>(after TASK_AGREEMENT_DELIVERY_TO_APPLICANT — Notify customer that draft agreement is ready)
            C_OFFERED --> C_ACCEPTED: GAS event (AS accepted)
            C_ACCEPTED --> C_FC_AWAITING: ACTION_FORWARD_TO_FC (Forward to FC)<br/>(after TASK_CRM_RECORD_CREATION — Create CRM record)
            C_FC_AWAITING --> C_COMPLETE: ACTION_APPROVE_FC_REVIEW (Approve FC review)<br/>(after TASK_FC_REVIEW_OUTCOME — Forestry Commission review completed?)
        }
        PHASE_PRE_AWARD_CW: PHASE_PRE_AWARD (Pre-award)
    }

    class CW system
```
