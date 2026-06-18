---
name: Weekly recap feature
description: "Your Week with Valo" — weekly AI recap across DB, API, AI generation, and mobile.
---

"Your Week with Valo" weekly recap.

- **DB:** `weekly_recaps` table — aggregates (avgMood/Sleep/Hrv/Steps/Energy, workoutsCompleted,
  habitsCompletionPct, debriefCount, nutritionDaysLogged), pillar scores (sleep/movement/work/
  mindset/relationships, nullable), AI fields (headline, valoInsight, narrativeJson, topWin,
  topStruggle, intentionNextWeek, patternsSnapshot), isQuietWeek, status. Unique on userId+weekStart.
- **API:** `/api/weekly-recap` — `trigger` (POST, upsert via onConflictDoUpdate), `latest`, `history`
  (stubs), `:id` (ownership-checked, 404 for wrong user). Register `history` BEFORE `:id`.
- **AI generation:** claude-haiku-4-5, grounded system prompt — emits null pillars/wins/struggles
  where no data exists, never fabricates. Lives in `artifacts/api-server/src/lib/weeklyRecap.ts`.
- **Mobile:** full-screen `/recap/[id].tsx` (registered in `_layout.tsx`); Home tab dismissible
  at-a-glance card shown only Sun/Mon (`new Date().getDay()` 0|1), dismissal persisted in
  AsyncStorage key `valo:weeklyRecapDismissed`; Progress tab "Past Recaps" list as a second
  `ListFooterComponent` alongside `WorkoutsSection`.

**Deferred to follow-up:** cron scheduling of weekly generation + push notifications (a TODO
comment marks the push hook point in the routes file).

**Grounding rule (why it matters):** the recap must never invent wins/struggles/insights for weeks
with no logged data — the prompt enforces honest nulls, mirroring the Ask Valo honest-no-data policy.
