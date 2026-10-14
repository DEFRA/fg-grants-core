# Naming Conventions Reference

Terse lookup guide for naming workflow elements (phases, stages, statuses, actions, processes, tasks) in Defra grant workflow code and definitions. All codes are **SCREAMING_SNAKE_CASE** (`^[A-Z0-9_]+$`). Workflow/grant codes are kebab-case lowercase (`^[a-z0-9-]+$`).

## Rule Summary

| Element | Form | Example | Read Aloud | Bad Pattern |
|---|---|---|---|---|
| Phase | descriptor | `PHASE_PRE_AWARD` | — | — |
| Stage | gerund/possessor/participle | `STAGE_REVIEWING_APPLICATION` | "case is currently …" | Imperative (`STAGE_SEND_AGREEMENT`) |
| Status | participle/adjective | `STATUS_APPLICATION_RECEIVED` | "case is currently …" | Action-named (`STATUS_READY_TO_FORWARD`), bare subject (`STATUS_IN_REVIEW`) |
| Action | verb-object | `ACTION_APPROVE_APPLICATION` | "[caseworker] …" | Too generic (`ACTION_CONTINUE`), inverted (`ACTION_FC_APPROVE`) |
| Process | verb-object | `GENERATE_OFFER` | internal GAS | — |
| Task | noun phrase | `TASK_CRM_RECORD_CREATION` | work item | Imperative (`TASK_CREATE_CRM_RECORD`) |
| Task outcome | participle/adjective | `STATUS_CRM_RECORD_CREATED` | task result | Imperative (`STATUS_CREATE_CRM_RECORD`) |

## Core Principle

**States describe *where*; actions describe *what*.**
- **States** (phase, stage, status): stative forms only. Never imperative. Complete: "the case is currently [state]".
- **Actions**: imperative verb-object. Describes the caseworker's command.

## Subject Prefixes Required

Always name the subject. Default subject is application/case.

| ✓ Correct | ✗ Wrong | Why |
|---|---|---|
| `STATUS_APPLICATION_COMPLETED` | `STATUS_COMPLETED` | What is completed? |
| `STATUS_APPLICATION_IN_REVIEW` | `STATUS_IN_REVIEW` | In review by whom? |
| `STATUS_AGREEMENT_ACCEPTED` | `STATUS_ACCEPTED` | Accepted by whom? |
| `STATUS_CRM_RECORD_CREATED` | `STATUS_CREATED` | What is created? |

Agreement-specific elements: prefix with `AGREEMENT_`. Task-specific outcomes: prefix with task or field name.

## Validation Regex

Code in workflow definitions:

```
Phase:  ^[A-Z0-9_]+$   Example: PHASE_PRE_AWARD
Stage:  ^[A-Z0-9_]+$   Example: STAGE_REVIEWING_APPLICATION
Status: ^[A-Z0-9_]+$   Example: STATUS_APPLICATION_RECEIVED
Action: ^[A-Z0-9_]+$   Example: ACTION_APPROVE_APPLICATION
Task:   ^[A-Z0-9_]+$   Example: TASK_CRM_RECORD_CREATION
```

Enforced by:
- `fg-cw-backend/src/cases/schemas/task.schema.js:12` (Code = Joi.string().pattern(/^[A-Z0-9_]+$/))
- Observable in `fg-gas-backend/src/grants/schemas/grant/code.js` (grant code: kebab-case)

## Anti-Patterns

### Imperative Stage Names
| ✗ Bad | ✓ Fix | Why |
|---|---|---|
| `STAGE_SEND_AGREEMENT_TO_APPLICANT` | `STAGE_AGREEMENT_WITH_APPLICANT` or `STAGE_AGREEMENT_DELIVERY_IN_PROGRESS` | Stage is a place, not a command |
| `STAGE_FORWARD_TO_FC` | `STAGE_SUBMITTED_FOR_FC_REVIEW` | Describe where case is, not what happens next |

### Action-Named Statuses
| ✗ Bad | ✓ Fix | Why |
|---|---|---|
| `STATUS_READY_TO_FORWARD` | `STATUS_SUBMITTED_FOR_FC_REVIEW` | Names next action, not current state |
| `STATUS_AWAITING_APPROVAL` | `STATUS_APPLICATION_SUBMITTED_FOR_APPROVAL` | Same issue; too action-oriented |

### Bare Subject Statuses
| ✗ Bad | ✓ Fix |
|---|---|---|
| `STATUS_IN_REVIEW` | `STATUS_APPLICATION_IN_REVIEW` |
| `STATUS_ACCEPTED` | `STATUS_AGREEMENT_ACCEPTED` |
| `STATUS_COMPLETED` | `STATUS_APPLICATION_COMPLETED` |

### Generic Actions
| ✗ Bad | ✓ Fix | Why |
|---|---|---|
| `ACTION_CONTINUE` | `ACTION_FORWARD_TO_FC`, `ACTION_ACCEPT_AGREEMENT` | `CONTINUE` is too vague; context-specific action codes are greppable |
| `ACTION_NEXT` | Rename contextually | Same issue |

### Inverted Action Names
| ✗ Bad | ✓ Fix | Why |
|---|---|---|
| `ACTION_FC_APPROVE` | `ACTION_APPROVE_APPLICATION` | Standard form: verb-object, not subject-verb-object |
| `ACTION_APPLICANT_ACCEPT` | `ACTION_ACCEPT_AGREEMENT` | Same |

### Imperative Task Names
| ✗ Bad | ✓ Fix | Why |
|---|---|---|
| `TASK_CREATE_CRM_RECORD` | `TASK_CRM_RECORD_CREATION` | Task is the *work item*, not a command; describes what the work *is*, not what to *do* |
| `TASK_SEND_AGREEMENT` | `TASK_AGREEMENT_DELIVERY_TO_APPLICANT` | Noun phrase: the work of delivery, not the command to send |

## Worked Example: Woodland Workflow Structure

```
PHASE_PRE_AWARD
  STAGE_INITIAL_ASSESSMENT
    STATUS_APPLICATION_RECEIVED
    STATUS_APPLICATION_IN_REVIEW
  STAGE_REVIEWING_APPLICATION
    STATUS_APPLICATION_UNDER_ASSESSMENT
    TASK_CRM_RECORD_CREATION
      STATUS_CRM_RECORD_CREATED
      STATUS_CRM_RECORD_FAILED
  STAGE_AGREEMENT_WITH_APPLICANT
    STATUS_AGREEMENT_OFFERED
    STATUS_AGREEMENT_ACCEPTED
    STATUS_AGREEMENT_GENERATING
    STATUS_AGREEMENT_SIGNED
    ACTION_APPROVE_APPLICATION
    ACTION_FORWARD_TO_FC
    TASK_AGREEMENT_DELIVERY_TO_APPLICANT
      STATUS_AGREEMENT_SENT_TO_APPLICANT

PHASE_POST_AGREEMENT_MONITORING
  STAGE_ACTIVE_DELIVERY
    STATUS_AGREEMENT_ACTIVE
    TASK_DELIVERABLE_VERIFICATION
      STATUS_DELIVERABLE_VERIFIED
      STATUS_DELIVERABLE_FAILED_AUDIT
  STAGE_CLOSEOUT
    STATUS_AGREEMENT_COMPLETED
```

**Every element:**
- Is a place (stative) or action (imperative), not a command-state hybrid.
- Names its subject (APPLICATION_, AGREEMENT_, CRM_RECORD_, etc.).
- Is unambiguous when read aloud.

## Common Conventions

- First status of first stage of first phase: usually `STATUS_APPLICATION_RECEIVED`, `interactive: false`, with a `START_REVIEW` action.
- "Generating" / "awaiting" statuses: `interactive: false`, `action: null` (event-driven).
- Code prefixes (`PHASE_`, `STAGE_`, `STATUS_`, `ACTION_`) are stylistic (both prefixed and bare are valid in runtime); pick one per workflow and be consistent.

## Troubleshooting Checklist

When reviewing workflow code:

1. Read every status code aloud: "the case is currently [code]". Does it sound like a place? If it sounds like an action, rename it.
2. Read every action code aloud: "[caseworker] [code]". Does it sound like a command? If vague, rename contextually.
3. Grep for bare statuses (no subject prefix). Rename them.
4. Grep for imperative stage names (verbs). Rename to stative forms.
5. Grep for `ACTION_CONTINUE`, `ACTION_NEXT`, etc. (vague actions). Rename contextually.
6. Verify every action code has one transition path. Multiple uses of the same action code in different stages is a code smell; use context-specific names.

## Key Files

- `fg-cw-backend/src/cases/models/workflow.js` — Workflow structure and lookup
- `fg-cw-backend/src/cases/schemas/task.schema.js:12` — Code validation regex
- `fg-gas-backend/src/grants/schemas/grant/code.js` — Grant code format
- Example workflows: `test/fixtures/pmf-workflow-definition.json`, `test/fixtures/woodland-workflow.json`
