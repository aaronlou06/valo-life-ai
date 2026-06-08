---
name: Multi-reminder event editing
description: How event editing and reminder lifecycle are wired in plan.tsx and the API server
---

## Rules

**Event editing:** `AddEventModal` accepts an optional `event?: CalendarEvent` prop. When set, it:
- Pre-populates title, date (YYYY-MM-DD), type, and notes (via `routineNotesText()` to strip `time:...|` prefix)
- Loads existing reminders from `useListReminders()` into `existingEventRemindersRef`
- Calls `useUpdateCalendarEvent` (PATCH) instead of `useCreateCalendarEvent` (POST) on save
- Title shows "Edit Event", button shows "Save changes"

**Reminder lifecycle (same semantics as RoutineModal):**
- Toggle OFF: `upsertReminder({ isActive: false })` — records preserved, reactivates later
- Toggle ON: upsert each active slot, delete records for removed slot sizes
- Uses `cancelEntityReminderNotification(id)` before deactivating or deleting

**DayDetailSheet:** has `onEditEvent?: (ev: CalendarEvent) => void` prop. Non-routine event cards show a pencil (edit-2) icon button. Tap calls `onEditEvent?.(ev)`.

**PlanScreen wiring:**
- `editingEvent: CalendarEvent | null` state
- `onEditEvent` handler: `setShowDayDetail(false); setEditingEvent(ev); setTimeout(() => setShowAddEvent(true), 220)`
- `AddEventModal` receives `event={editingEvent ?? undefined}` and `onClose` resets editingEvent

**API server:**
- `PATCH /reminders/:id` — updates `isActive`, `label`, `scheduledTime`, `metadata`
- VAPI instructions reference PATCH for activate/deactivate (not POST)

**Why:** Code review required toggle-off to preserve records (isActive:false) and event editing to use PATCH, not recreate. The 220ms setTimeout matches the sheet close animation.
