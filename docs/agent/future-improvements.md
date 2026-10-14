# Future Improvements — Agent Reference

Lookup table of open questions, their underlying problems, proposed approaches, and research evidence.

---

## Authoring Tooling: Five Options (Research → Recommendation)

| Option | Surface | Problem Solved | Est. Cost | Urgency | Research |
|---|---|---|---|---|---|
| **E. Linter + Contract Gate** | CI check | Detects asymmetric-coupling + naming drift at PR time (prevents `wmp-8a9-8fa` incidents) | 2–4 days | **HIGH** | `docs/research/authoring-tooling-options.md` §5–6 |
| **D. Reshape CLI** | `wf` command | Cross-repo atomic refactors (`rename-stage`, `gen-migration`) — reduces authoring tax | 1–2 weeks | **HIGH** | `docs/research/authoring-tooling-options.md` §5–6 |
| **C. Maven AI Agent** | Chat (Claude) | Generates first-draft workflow JSON from business spec — lowers entry friction | 1 week (v1); 1 quarter (hardened) | **MEDIUM** | `docs/research/authoring-tooling-options.md` §5–6 |
| A. Loom (TS Projection) | TypeScript file | Collapses source-of-truth to one file; compile-time invariant checks | Half a quarter | **DEFER** | `docs/research/authoring-tooling-options.md` §5–6 |
| B. Atelier (Visual Editor) | Web UI (graph) | Visual state-machine editing; live Joi validation | Full quarter | **DEFER** | `docs/research/authoring-tooling-options.md` §5–6 |

**Recommended sequence**: E → D → C. Defer A and B until workflow 4–5 and you have real evidence of friction.

---

## Event-Driven Transitions Modelling

| Issue | Current State | Recommended Fix | Urgency |
|---|---|---|---|
| `action: null` is load-bearing signal | Transitions collapse action-driven + event-driven into one record, distinguished by `action === null` | Add `kind` discriminator field (`kind: "event"` / `kind: "action"`); make `onEvent` explicit in event-driven transitions | **LOW** — clarity improvement; no correctness bug. Do when touching this area next. |
| Event type not named in workflow | Event types live in `inbox.subscriber.js:useCaseMap` (hand-maintained), not in workflow definition | Include `"onEvent": "case.update.status"` in every event-driven transition; derive `useCaseMap` from workflow or use generic dispatcher | **LOW** — consolidation + clarity. Do with the `kind` field refactor. |

**See**: `docs/research/event-listener-design-question.md` — DDD analysis with three option sketches; Position: Option B (discriminated union) + explicit `onEvent`.

---

## Secondary Model Smells (Track, Not Urgent)

| Smell | Where | What | Fix Horizon |
|---|---|---|---|
| `checkTasks` duplication | `Transition.checkTasks` + `Action.checkTasks` | Same field name, different scopes and callers; if disagree, behavior undefined | When event-listener refactor (above) lands; consolidate or rename to scope-explicit form |
| `processes[]` vocabulary mismatch | GAS `validFrom[]` vs. CW `transitions[]` with `action: null` | Both express "policies" (reactions on state arrival); use different vocab — processes vs. transitions | Align with event-listener vocabulary when that stabilizes; same concept, different names |
| Stage-outcome advancement | Possible third edge type in `transitions[]` | `Case.updateStageOutcome` has separate lookup; schema may not cleanly express outcome-recording transitions | Investigate during event-listener refactor; ensure vocabulary doesn't exclude this pattern |

---

## Concrete Quick Wins

| Item | Problem | Approach | Est. | Urgency |
|---|---|---|---|---|
| GAS Joi schema enforcement | GAS doesn't validate SCREAMING_SNAKE_CASE on codes; CW does | Add `^[A-Z0-9_]+$` regex to `fg-gas-backend/src/grants/schemas/grant/*.js` | 0.5 days | LOW |
| Doc inconsistency fix | `creating-workflow-definitions.md` recommends `updateOne`; slim-gas-workflow-proposal chose delete+insert | Update doc §3 to note the tradeoff and recommend delete+insert for structural changes | 0.5 days | **MEDIUM** |
| Contract-test invariant | No CI check that "stage codes GAS publishes exist in CW" (the load-bearing invariant) | Part of Linter (Option E); add assertion: for every GAS stage, verify it exists in CW workflow | Covered in Linter | **HIGH** |
| Dead-letter recovery | Manual revival of dead-lettered inbox events after root cause is fixed | CLI: `wf replay-dead-letters --since <date>` — re-attempt with current definitions; report successes + failures | 1 week | LOW |
| Grants-UI pre-deploy validator | No validation that `gasStatus` codes in yaml redirect rules actually exist in GAS fixture | CI check: load GAS fixture, validate all status codes mentioned in scheme yamls exist | 0.5 days | **MEDIUM** |
| Dead-letter observability | Manual Mongo queries to find dead-lettered events | CLI query + simple dashboard: count dead-letters by repo + root cause; list blocked applications | 1 week | LOW |

---

## Quarterly Plan Summary

**If team has one quarter:**

1. **Week 1**: Linter (E). Baseline safety net. `@defra/workflow-contract-checker` + wired CI. Stops `wmp-8a9-8fa`.
2. **Weeks 2–4**: Reshape (D). `wf` CLI with core operations. Integrated with Linter. Single commands for cross-repo changes.
3. **Week 4 (optional)**: Prototype Maven (C) if engineering interest exists. Low-cost validation.

**Post-quarter**: Ship grassland workflow. Gather evidence on real-world authoring friction. By workflow 5, you'll know if deeper tooling (A or B) is justified.

---

**References**:
- `docs/research/authoring-tooling-options.md` — Divergence analysis (five options, honest taste-filter, prior art).
- `docs/research/event-listener-design-question.md` — DDD analysis (three option sketches, recommendation).
- `docs/cross-system-architecture.md` — Asymmetric coupling invariant + three incident post-mortems.
- `docs/naming-conventions.md` — State naming rules + lessons learned.
- `docs/adr/slim-gas-workflow-proposal.md` — Woodland migration + decision log.
