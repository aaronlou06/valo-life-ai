---
name: Habit streak single source
description: habit_completions is the single source of truth for habit streaks; every surface derives on read.
---

# Habit streak single source of truth

`habit_completions` rows are authoritative for habit streak + completedToday.
The stored `habits.streak` / `habits.completedToday` / `habits.longestStreak` /
`habits.lastCompletedDate` columns are a denormalized **cache**, kept in sync on
write and never trusted as truth on read.

**Authoritative model** (shared helper `computeHabitStreak` in
`artifacts/api-server/src/lib/habitStreaks.ts`):
- rows considered in date order
- `completed=true` extends the streak
- `completed=false` breaks it
- a day with NO row is skipped (habit not scheduled that day)
- a missing row for *today* does NOT zero an otherwise-live streak (but an
  explicit `completed=false` row for today DOES break it)

**Why:** the old Plan main-list toggle PATCHed `/habits` with `streak ± 1`, which
drifted out of sync with the `habit_completions` rows that Progress reads from —
producing streak=0 while the real history showed long runs. Incremental math is
the root cause; always recompute from full history.

**How to apply:**
- Reads derive: `GET /api/habits` and `/api/home-briefing` overlay derived values
  via `deriveHabitStreaks(userId)` + `applyDerivedToHabit`. Never return raw
  cached streak to a client.
- Writes recompute: any write to `habit_completions` must call
  `recomputeAndPersistHabit(userId, habitId)` (never ± a counter).
- Local-day is resolved from `user_profiles.call_timezone` (fallback
  `America/New_York`) via `getDateInTimezone` in `artifacts/api-server/src/lib/dates.ts`.
- Client toggles (Plan + routine modal) write `habit_completions` through
  `useToggleHabitCompletion`, then invalidate both habits and habit-completions
  query keys.
- Progress best-streak must iterate completion **rows** (skipping no-row days),
  and its completed-day sets must exclude `completed=false` rows.

**Known gaps (follow-ups, not done here — schema changes were out of scope):**
- `PATCH /habits/:id` still accepts client `streak`/`completedToday` writes; read
  paths override them, but the endpoint should ignore those server-managed fields.
- No DB uniqueness on `(user_id, habit_id, completion_date)`, so concurrent
  toggles could create duplicate same-day rows that distort streaks.
