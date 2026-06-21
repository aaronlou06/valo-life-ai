---
name: Verify spine + catch-up
description: The unified verification mechanism for recurring habits + routines, and the catch-up gap surface.
---

# Verify spine

`verification_events` is the ONE write path for verifying recurring items (habits + routines). It superseded and replaced the old `habit_completions` table (dropped). Calendar events are "Anchors" and are intentionally excluded from verification.

- Typed FKs: `habitId` (int FK→habits) XOR `routineId` (text FK→routines), enforced by an exactly-one CHECK + partial unique indexes per target/occurrenceDate.
- `status` done|missed; `provenance` confirmed|recalled|assumed. Manual taps → confirmed; catch-up reconciliation → recalled.
- Shared helper `artifacts/api-server/src/lib/verificationEvents.ts`: `recordVerificationEvent`, `clearVerificationEvent`, `toggleHabitVerification`, `listHabitVerificationsForDate` (returns the legacy HabitCompletion view shape so the OpenAPI contract + client stay unchanged). Habit writes call `recomputeAndPersistHabit`.
- Unified route `POST /api/verification-events` (routes/catch-up.ts) validates exactly-one target + enums AND verifies ownership (the habit/routine must belong to the userId) before writing. All new verification writes should go through this route or the helper, never a new table.

**Why:** one mechanism keeps streaks, recaps, askValo, and nightly aggregation all reading the same source; avoids the dual-write drift the old habit_completions caused.

# Catch-up

`buildCatchup(userId)` (lib/catchup.ts) → `GET /api/catch-up`. Bounded lookback window of `LOOKBACK_DAYS` (5) days BEFORE today (today handled by normal UI, excluded from the window).
- Daily habits (targetFrequency null or >=7): one cell per window day; unverified past day = pending gap.
- Flexible habits (targetFrequency <7): weekly roll-up ("X of N runs this week"), Monday-based week (matches recap). NEVER per-day missed cells, NEVER contributes to pendingCount/hasGap.
- Routines: cells from `getRoutineOccurrences` (server port in lib/recurrence.ts). `skippedDates` is a JSON array of date STRINGS — parse with a string parser, not the numeric `days` parser.
- `hasGap = pendingCount >= SURFACE_THRESHOLD` (2). Home `CatchupCard` shows when hasGap; dismissal keyed on API `today` so it resurfaces next day. Client screen `app/catch-up.tsx` records with provenance `recalled` then invalidates the catch-up query key.

# Gotcha: new expo-router route → typed-route error
Adding a new screen file (e.g. app/catch-up.tsx) fails valo typecheck with TS2345 on `router.push("/catch-up")` until expo-router regenerates `.expo/types`. Restart the `artifacts/valo: expo` workflow (it runs typegen on start), then re-typecheck — do not cast to `never`.
