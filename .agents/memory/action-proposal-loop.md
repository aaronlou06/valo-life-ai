---
name: Action proposal Suggest-&-Act loop
description: How Home action-proposal cards execute/undo/modify across Home and Plan screens.
---

# Action proposal Suggest-&-Act loop

Home renders action-proposal cards from `home-briefing.action_proposals`. Each card has Accept / Modify / Dismiss.

- **Accept** → `useExecuteActionProposal`; on success remove card + show an undo toast wired to `useUndoAction(actionLogId)` (6s auto-dismiss). On `ApiError` status 409 the proposal is stale → remove card + "no longer current" toast.
- **Dismiss** → optimistic remove + `useDismissActionProposal({ data: {} })` (declined).
- **Modify** (reschedule_workout) → navigate to `/(tabs)/plan` with params `editWorkoutId`/`prefillDate`/`modifyProposalId`. Plan reads them via `useLocalSearchParams`, opens `AddEventModal` in edit mode pre-filled with the target slot, and on save (`onCreated`) calls `dismiss({ modified: true })`.

**Why / gotchas:**
- The home-briefing payload must include `parameters` (validated handler params) or the Modify prefill has no target slot. Without it the client can't get `calendarEventId`/`targetDate`.
- `modifyProposalIdRef` in plan.tsx MUST be cleared on `AddEventModal` `onClose` (cancel), not only consumed in `onCreated`. Otherwise a later unrelated event save wrongly marks the old proposal `modified`. `onCreated` fires before `onClose` on save, so reading-then-clearing is safe.
- Deep-link effect uses a signature guard ref + `router.setParams("")` to avoid re-triggering since route params persist.
- Card removal/toast state is lifted to HomeScreen (removedIds Set + toast); the briefing query is a custom `useQuery` keyed `["/api/home-briefing"]` — refetch via its own `refetch`, not a generated queryKey getter.
