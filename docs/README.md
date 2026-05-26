# Documentation — fg-grants-core

How the Defra grant + casework system works across `fg-gas-backend`, `fg-cw-backend`, `grants-ui`, and the agreements service.

This is a navigation index. The substantive docs are linked from here — start with the one matching why you're here.

## You're here because…

### …you're new to this system

Read in this order:

1. **[Cross-system architecture](./cross-system-architecture.md)** — what the four services do, how they couple, the load-bearing rules. *Start here even if you only have 15 minutes.*
2. **[State flow GAS↔CW](./state-flow-gas-cw.md)** — happy-path narrative with sequence + state diagrams.
3. **[Naming conventions](./naming-conventions.md)** — the rules behind every stage/status/action code. Skim now; refer back when you author one.
4. **[How-to: extend the workflow](./how-to-extend-workflow.md)** — keep open while you make your first change.

**Your first hour:** read 1 end-to-end (~20 min), read 2 (~15 min), skim 3 (~5 min), open 4 alongside whatever you do next.

### …you're debugging a stuck case

1. **[State flow GAS↔CW § Failure modes](./state-flow-gas-cw.md)** — the three real incidents we've hit and what they teach.
2. **[How-to § Recover a dead-lettered inbox event](./how-to-extend-workflow.md)** — the operational recipe (procedure 8).
3. **[Cross-system architecture § The two routing gates](./cross-system-architecture.md)** — for understanding *why* a state change might fail (`externalStatusMap` miss vs. `validFrom` rejection).

### …you're adding or renaming a workflow state

1. **[Naming conventions](./naming-conventions.md)** — what the new code should look like, with the "read aloud" check.
2. **[How-to: extend the workflow](./how-to-extend-workflow.md)** — nine procedures; #1 (add a state) and #2 (rename a state) are the common cases.
3. **[Cross-system architecture § Asymmetric coupling](./cross-system-architecture.md)** — the invariant you must not break: every stage GAS publishes must exist in CW.

### …you're evaluating an architectural or doc proposal

1. **[Slim GAS workflow proposal](./adr/slim-gas-workflow-proposal.md)** — the ADR for the cleanup that produced this doc set. Worked example of the conventions in action.
2. **[Future improvements](./future-improvements.md)** — open questions and proposed work, with a quarterly prioritisation.
3. **[`research/`](./research/)** — evidence trail backing the future-improvements doc (divergent options for authoring tooling, DDD analysis of the `action: null` modelling question).

## Document types

The set follows the [DIVIO documentation framework](https://documentation.divio.com/):

| Type | Doc | Answers |
|---|---|---|
| Reference | `naming-conventions.md` | What should this thing be called? |
| Explanation | `cross-system-architecture.md` | Why is the system designed this way? |
| Explanation | `state-flow-gas-cw.md` | How does a case progress end-to-end? |
| Explanation/ADR | `future-improvements.md` | What's deliberately left open, and what's next? |
| ADR | `adr/slim-gas-workflow-proposal.md` | Why did we just refactor? |
| How-to | `how-to-extend-workflow.md` | How do I make a specific change? |

Each primary doc has a terser **agent-oriented companion** in [`agent/`](./agent/) for AI assistants working on the codebase. Same content, lookup-optimised.

## Companion docs in sibling repos

- **[fg-cw-backend/docs/creating-workflow-definitions.md](../../fg-cw-backend/docs/creating-workflow-definitions.md)** — deeper how-to for single-system CW concerns (UI components, pages, tabs, status themes, the 22-question authoring walkthrough).
- **[fg-cw-backend/docs/agent/workflow-definitions.md](../../fg-cw-backend/docs/agent/workflow-definitions.md)** — agent-oriented reference on CW workflow semantics (the `interactive` flag, transition mechanisms, validity rules the runtime enforces).
