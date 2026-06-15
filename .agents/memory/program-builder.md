---
name: Program builder patterns
description: Multi-week workout program builder — schema, attach/detach, calendar integration, progressive overload.
---

## DB Schema
- `workoutPrograms`: id, userId, name, totalWeeks, notes, startDate (text YYYY-MM-DD nullable), createdAt, updatedAt
- `workoutProgramDays`: id, programId (cascade), weekNumber (1-based), dayOfWeek (mon|tue|wed|thu|fri|sat|sun), templateId (nullable = rest day)
- After adding `startDate` column: always run `pnpm --filter @workspace/db run push` then `pnpm run typecheck:libs` before `pnpm --filter @workspace/api-server run typecheck`.

**Why:** Drizzle ORM infers update types from the schema declarations; stale lib declarations mean the new column does not appear in the update type even after schema edit.

## Calendar integration
- Attaching a program generates `calendar_events` records with `type="workout"` and `notes=JSON.stringify({programId, programName, templateId, templateName})`.
- Week 1 Monday = first Monday on or after startDate.
- Detach deletes events with: `type="workout" AND notes LIKE '%"programId":X%'` (using drizzle `like()`).
- The Plan page's DayDetailSheet handles `isWorkout` events: tapping navigates to `/copilot-start` with `autoTemplateId` param.

**Why:** Generating actual DB records keeps the Plan page stateless — it just fetches calendar_events as normal.

## Progressive overload
- `GET /workout/exercises/:exerciseId/suggestions` — queries last 60 work sets (isWarmup=false) across completed sessions.
- Groups by sessionId, takes last 5 sessions, computes avgWeight and avgReps.
- Trend: improving if last > prev by >0.5kg; declining if last < prev by >0.5kg.
- Suggestion: if declining → hold current weight (rounded to 0.5kg); else → +2.5kg.
- Returns `{ suggestion: { suggestedWeightKg, suggestedReps, lastSessionDate, lastAvgWeightKg, lastAvgReps, trend, sessionCount }, reason }`.
- `reason: "no_history"` when no completed sessions exist for this exercise.

## Client screens
- `copilot-programs.tsx` — list screen with attach/detach inline, card nav to edit.
- `copilot-program-edit.tsx` — metadata form + week×day grid (Mon-Sun columns, Week N rows). Cells are 52px tall. Tapping cell opens template picker modal. Trending-up icon on assigned cells opens suggestions modal per-exercise.
- `copilot-start.tsx` — "Training programs" card above "Quick start" → /copilot-programs.

## Route ordering note
`GET /workout/programs/:id/days` and `PUT /workout/programs/:id/days` are registered BEFORE `GET /workout/templates/:id/exercises` to avoid Express path-param conflicts. The `/programs/` prefix avoids any ambiguity with `/templates/`.
