---
name: Multi-reminder event editing
description: Durable decisions for event editing and reminder lifecycle in plan.tsx
---

## Decision: Datetime reconstruction in edit mode

**Why:** Saved event dates are stored as `YYYY-MM-DD`; the time is stored in `notes` as `time:HH:MM AM/PM|...`. If the edit modal pre-populates `date` as plain YYYY-MM-DD, then `date.includes("T")` is false and `eventDateTime` is null in handleSave — notifications are never re-scheduled.

**How to apply:** On open with `event` prop, extract time from `event.notes` via `extractEventTime()`, convert from 12h → 24h using `parseTime12ToMinutes()`, then set `date` as `event.date + "T" + HH:MM` so `fireAt` is always computable.

## Decision: Reminder mutations must be awaited

**Why:** Toggle-off and slot-deletion paths use `void X.catch(() => {})` which silently swallows failures — users get success UX while DB and notification state diverge.

**How to apply:** All `upsertReminder` and `deleteReminder` calls in `handleSave` must be `await`-ed (inside the existing `try/catch`). Only `cancelEntityReminderNotification` (device-only, best-effort) may remain `void`.

## Decision: Toggle-off = isActive:false, not delete

**Why:** Preserves reminder records so they can be reactivated; prevents re-entering all slot sizes after a temporary disable.

**How to apply:** When `!reminderEnabled` on save, call `upsertReminder` with `isActive: false` for every existing reminder record. When re-enabled, call with `isActive: true`.
