# Event-driven transitions in CW workflow definitions — DDD analysis

> **Status:** Evidence trail. The position and recommendation here have been consolidated into [`../future-improvements.md`](../future-improvements.md) §2. This artefact is kept as the original DDD-flavoured analysis with file/line citations into the CW codebase. **Safe to prune when the corresponding `future-improvements.md` section is resolved** — when the discriminated-`kind` refactor is either picked up or formally deferred.

**Question.** Should CW model event-driven transitions differently from action-driven ones — perhaps as first-class "event listeners" attached to a status, rather than transitions with `action: null`?

**Position.** Yes, but lightly. The current model overloads one slot (`transitions[]`) with two semantically distinct concerns, and that overloading is detectable both in the engine (separate code paths in `Case.progressTo` vs `Case.updateStageOutcome`) and in the configuration (the load-bearing `action: null`). The cheapest, most reversible fix is a discriminated `kind` field on the existing transition shape. A full split into `transitions[]` plus `eventListeners[]` reads more cleanly but costs more and crosses an aggregate-language line that doesn't quite need to be crossed yet.

---

## 1. Restating the question in DDD terms

A `Status` today exposes a single outgoing edge list, `transitions[]`. Two distinct kinds of edge live in it:

- **Action-driven transition** — a *command capability*. The caseworker (an aggregate-external actor) issues a command (`StartReview`, `ApproveApplication`); the workflow says "from this position, this command is permitted, and on success the case moves to that position". The `action` object describes the *command* — its code, display name, comment policy, gating (`checkTasks`), confirmation UX. This is the imperative half of the ubiquitous language: "what can a caseworker *do* here?"
- **Event-driven transition** — a *reaction to a domain event from outside the aggregate*. An inbound CloudEvent (currently `cloud.defra.ENV.fg-gas-backend.case.update.status`, carrying a `newStatus` target) arrives on the inbox. The workflow says "from this position, if this fact becomes true, move there". There is no caseworker, no UI, no comment, no confirmation. This is the declarative half: "what does the case *listen for* here?"

In standard CQRS/event-modelling vocabulary, these are **commands** and **policies / reactions** respectively. They are not the same kind of thing. A command originates inside the bounded context's boundary (a user-driven write). A policy translates an external event into an internal command (`OnEvent X -> Progress case to Y`). Today's `Transition` schema is `command | policy` collapsed into one record, distinguished by `action === null`.

That collapse is the smell. The two concerns differ in actor (human vs system), in trigger semantics (pull/click vs push/listen), in failure mode (UI validation vs message-bus retry/dead-letter), in fields that are meaningful (`confirm`, `comment`, `checkTasks` on action vs none of those make sense for an event), and in lifecycle (action visible in UI, event invisible). The ubiquitous language has two words. The schema has one.

## 2. Is the current model actually a smell, or is it fine?

It's a real, mild smell — not an emergency.

**Evidence it's a smell:**

- The runtime *already* takes different code paths. UI clicks land in `Case.updateStageOutcome` (`case.js:229-273`), which goes via `workflow.getNextPosition(position, actionCode)` and looks up the transition by action code. Inbound events land in `Case.progressTo` (`case.js:276-341`), which goes via `workflow.getTransitionForTargetPosition(position, targetPosition)` and looks up the transition by target. Two lookup keys, two methods, one schema. The engine knows these are different things; the JSON pretends they're the same.
- `action: Action.allow(null).required()` in `task.schema.js:43` is *the* anti-pattern signature: a required field whose null value flips runtime semantics. Reviewers have to know that "`action: null` means event-driven" — that's exactly the kind of tribal knowledge a schema is supposed to obviate. The fact that `workflow-definitions.md` has a whole table explaining how `interactive` and `action` interact (four valid combinations, three coupling rules) is itself the smell.
- The `useCaseMap` in `inbox.subscriber.js:25-29` is the *other half* of the event-driven binding, and it lives in code, not config. The workflow says "I listen for an event by target position"; the subscriber says "I route this event type to this use case". The link between the two is implicit: every event-driven transition relies on an event type registered in `useCaseMap`, but the workflow JSON never names the event type. That's the deepest part of the smell — the listener is split across two artefacts and neither names the event.

**Evidence it's tolerable:**

- There are only two registered event types today and a handful of `action: null` transitions in one fixture. The combinatorial space is tiny. The current model has carried that load fine.
- The schema is honest in one respect: target position is the key, action is optional context. That genuinely is the shape of "either a person clicked a thing, or the case arrived at a place". The collapse isn't arbitrary.
- A discriminator is missing, but no information is missing. Nothing has to be invented to refactor; everything is mechanically recoverable.

Net: it's a clarity smell, not a correctness smell. Worth fixing when you touch this area; not worth a dedicated migration sprint.

## 3. If we separated them, what would it look like?

### Option A — split into two arrays per status

```json
{
  "code": "STATUS_AGREEMENT_GENERATING",
  "interactive": false,
  "transitions": [],
  "eventListeners": [
    {
      "onEvent": "case.update.status",
      "targetPosition": "PHASE_PRE_AWARD:STAGE_PREPARING_AGREEMENT:STATUS_AGREEMENT_READY_FOR_APPLICANT",
      "checkTasks": false
    }
  ]
}
```

- **Ubiquitous-language win:** maximal. The two concepts have two homes. The word "transition" becomes synonymous with "command edge". The word "listener" appears in the schema for the first time, matching the way developers already talk about the inbox. The `useCaseMap` could be retired or auto-derived if `onEvent` names the event type. Reviewers no longer have to remember that `action: null` is load-bearing.
- **Migration cost:** moderate. New Joi schema (`EventListener` label), new `Status.eventListeners[]` field, two writes to `getTransitionForTargetPosition` (now searches `eventListeners` first, falling back to `transitions` during transition; or splits into `getEventListenerForTargetPosition`), update every existing fixture (woodland, pmf, any others), update tests that construct workflows or assert transition shape. Probably 1–2 days of careful work, mostly in tests and fixtures.
- **Compatibility risk:** medium. The workflow JSON is data the runtime loads; downstream consumers (frontend renderers, validation tools) need updating in lockstep or behind a feature-flag dual-read. If workflow definitions are stored in Mongo, existing documents need migrating.
- **Reversibility:** low-to-moderate. Once you've split the array you've taught everyone — code, fixtures, frontend, docs — to treat them as separate. Going back means re-merging two arrays, which nobody will want to do.

### Option B — discriminated union inside one array

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
      "action": { "code": "APPROVE", "name": "Approve", "comment": null, "checkTasks": true }
    }
  ]
}
```

- **Ubiquitous-language win:** real but partial. The shape is explicit ("this transition is of kind X"), but "transition" remains the umbrella noun for both. Developers still say "the event listener on STATUS_AGREEMENT_GENERATING", but the schema calls it a transition-of-kind-event.
- **Migration cost:** small. Joi gets a `Joi.alternatives().try(ActionTransition, EventTransition).match('one')` with `kind` as the discriminator. `getTransitionForTargetPosition` and `getNextPosition` can keep their signatures; internally they filter by `kind`. Fixtures need a one-line addition per transition (`"kind": "action"` / `"kind": "event"`). Auto-migrate: any transition with `action: null` becomes `kind: "event"`, otherwise `kind: "action"` and drop `action: null`. ~0.5–1 day.
- **Compatibility risk:** low. Same array, same lookup methods, additive change. A dual-read step (treat missing `kind` as "action" if `action` is an object, "event" if null) keeps old fixtures running during rollout.
- **Reversibility:** high. Drop the `kind` field, reinstate `action: null` semantics, done. The change is essentially a schema annotation.

### Option C (the one I'd actually advocate) — Option B plus `onEvent` is mandatory and the subscriber's `useCaseMap` is derived from the workflow

The deeper smell isn't the array split, it's that the **event type is not named in the workflow**. `useCaseMap` lives in `inbox.subscriber.js:25-29` and is hand-maintained. If event-driven transitions named the event type they react to (e.g. `"onEvent": "case.update.status"`), then:

- The workflow becomes a self-describing reactor; you can see at a glance which statuses listen for which events.
- The `useCaseMap` is either generated from the workflow corpus or replaced by a generic dispatcher: "for any inbox event, find statuses whose `eventListeners[]` name this event type, then resolve target position from the event payload".
- New event-driven transitions stop requiring two-place edits (`workflow.json` + `inbox.subscriber.js`).

That cleanup is the actual value here. Whether the carrier is a single array (B) or two arrays (A) is secondary.

## 4. Wider lens — other hidden concepts worth surfacing

**There may be three concerns, not two.** A `transition` today silently covers (i) UI command edges, (ii) inbound-event reactions, and arguably (iii) stage-outcome advancement via `Case.updateStageOutcome`, which has its own lookup path and writes an `outcome` record onto the stage. The fact that the same schema covers UI-clicks-that-advance-stage and UI-clicks-that-record-an-outcome-and-advance-stage suggests stage-completion is a third edge type. Worth a closer look when sketching the listener shape — don't accidentally pick a vocabulary that excludes outcome-recording transitions.

**`checkTasks` is duplicated on `Transition` and `Action`, with different scopes.** `Transition.checkTasks` (`case.js:295`) gates non-UI progressions; `Action.checkTasks` (`case.js:367, 380`) gates UI-triggered progressions and also filters `getPermittedActions`. They look the same but enforce in different places against different callers. If a transition is event-driven (`action: null`), only `Transition.checkTasks` is consulted; if UI-driven, both can be set, and what happens if they disagree is not obviously defined. Either consolidate to one flag at the transition level, or rename them to make the scope explicit (`transition.checkTasks` -> `gateOnTaskCompletion` for the event path; `action.checkTasks` -> `requireTaskCompletionToOfferAction` for the UI path). The current duplication is a primitive-obsession-flavoured smell on a boolean.

**`processes[]` on GAS `validFrom` rules is the same shape of smell, one layer up.** It expresses side-effects ("on this state arrival, run these processes") in a config blob that lives next to data. Same DDD pattern as event-driven transitions: a *reaction*, declaratively bound to a state. If CW grows a first-class listener shape, GAS's `processes[]` is a candidate to align with that vocabulary — both are policies that fire on state change. Out of scope for this brief, but flag for the documentarist: there is a cross-system "policy / reaction" concept hiding in two places, named differently in each.

**Should the model itself be event-sourced?** Tempting question, but no — not yet. The case aggregate already maintains a `timeline[]` (`case.js:411-420`) of TimelineEvents (`CASE_CREATED`, `CASE_ASSIGNED`, `CASE_STATUS_CHANGED`, etc.) that is, in practice, an event log appended on every state change. The aggregate stores both the events *and* the current state. That's a hybrid pattern (state-first with audit events), which is appropriate for this domain: most queries are "what is this case's current status and who is assigned" rather than "what was this case's state two weeks ago Tuesday". Going full ES would force every read through a projection rebuild, with no real win — caseworkers don't need temporal queries, and the audit trail is already there. If a future need arises (regulatory rewind, "what would have happened if we'd progressed yesterday?", multi-view dashboards built from raw events), revisit. For now, hybrid is right.

**The workflow definition is the model of a process; the case is an instance of that process. That distinction is already clean.** No smell there. The smell is purely in *how the edges of the process model are described*.

## 5. Recommendation

Adopt **Option B (discriminated union with `kind`)** combined with **naming the event type explicitly** (the Option C addition): every event-driven transition gets `"kind": "event"` plus `"onEvent": "<event-type>"`, action-driven transitions get `"kind": "action"`. This makes the two concerns visible in every transition record (a real UL win), keeps the migration small and reversible, removes the load-bearing `action: null` signal, and most importantly *moves the event-type binding from `inbox.subscriber.js` into the workflow definition where it belongs*. The single-array-with-discriminator shape is cheaper than splitting into two arrays and almost as clear; the bigger refactor (Option A) is worth doing only if a richer listener concept emerges (e.g. listeners that don't progress the case but trigger side-effects).
