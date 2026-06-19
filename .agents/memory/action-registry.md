---
name: Agentic action registry
description: How Valo's Suggest & Act actions are structured; conventions every new action type must follow.
---

# Agentic action registry (Valo Suggest & Act)

Lives in `artifacts/api-server/src/lib/actions/`. Tables: `proposed_actions`
(pending suggestions surfaced on Home) and `action_log` (audit + undo trail,
stores `beforeSnapshot`).

## Convention: adding a new action = one new entry
Implement an `ActionHandler<P,S>` (type, `parameterSchema` in `zod/v4`,
`propose`, `execute`, `undo`), then add a single `registerAction(...)` line in
`actions/index.ts`. The suggestion engine, action card, and execute/undo plumbing
all go through `getActionHandler(type)` — never special-case an action type.

## Convention: handlers self-authorize (do NOT rely on route plumbing)
`execute(params, ctx)` and `undo(snapshot, ctx)` receive `ActionContext { userId }`.
Every read and mutation MUST be scoped to `ctx.userId` (plus any domain guard,
e.g. `type="workout"` for reschedule_workout).
**Why:** a forged/stray id must not mutate another user's row (IDOR). Enforcing it
in the handler keeps actions safe-by-default even before the Round-3 execute route
exists. Add a negative test (wrong-user + wrong-type rejected, no mutation) for
each new action.

## reschedule_workout specifics
Scheduled workouts ARE `calendar_events` rows with `type="workout"` (created by
`POST /workout/programs/:id/attach`, which sets only date/title/notes; start/end
usually null). The handler mutates that single row; it does NOT touch any
`workout_sessions` row. `parameterSchema` carries `currentDate`/`currentStartTime`
captured at proposal time for the Round-3 server-side freshness guard.
