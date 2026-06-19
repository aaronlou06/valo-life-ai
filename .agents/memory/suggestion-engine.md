---
name: Agentic suggestion engine (Round 1)
description: How Valo generates reschedule_workout proposals nightly; the server-side guards that must stay deterministic.
---

# Suggestion engine — generateActionProposals(userId)

Lives in `artifacts/api-server/src/lib/generateActionProposals.ts`, called from
`nightlyInsights.ts` (NOT the home-briefing request path — Home only reads
persisted pending proposals, never calls Claude).

## Rule: business gates live in CODE, not the prompt
Claude is asked for at most one behind-on-fitness reschedule, but the guarantees
are enforced server-side and must NOT be downgraded to prompt-only:
- early-return 0 unless 14-day workout consistency < 0.6 (behind on fitness)
- early-return 0 if no existing `type="workout"` events or no open weekday slot
- cap at exactly one insert per run (`break` after first successful insert)
- skip declined `(actionType, targetDate)` pairs (status=declined, respondedAt
  within 7 days) and dedupe against pending non-expired pairs (idempotent)
**Why:** the model is non-deterministic; a stray multi-proposal or on-track-user
response would otherwise leak proposals. Code gates make the done-criteria hold
regardless of model output.

## Rule: time/identity fields are re-derived, never trusted from the model
The model only chooses `calendarEventId` (must be in the user's fetched workout
set) and `targetDate` (must be in the code-derived open-weekday set). All of
`currentDate`, `currentStartTime`, `targetStartTime`, `targetEndTime` are
recomputed from the real `calendar_events` row (clock time transposed onto the
target date), then validated with `rescheduleWorkoutParamsSchema.safeParse`.
**Why:** workout events from program attach usually have null start/end times,
and model-generated ISO timestamps are error-prone; deriving them keeps the
Round-3 freshness guard accurate.

## Testing note
Claude output is non-deterministic, so the test (`test:proposals`) covers the
pure guards only: `computeOpenWeekdayDates` (weekend/workout/declined exclusion,
fully-booked → empty), `computeDeclinedRescheduleDates` (two-sided 7-day cooldown,
inclusive boundary), and `parseProposalsJson` (malformed/fenced/preamble).

## Decline cooldown anchor
The 7-day decline cooldown must anchor on `respondedAt` (when the user dismissed),
NOT `createdAt`. The dismiss route and the engine read are coupled: the dismiss
endpoint sets `status='declined'` + `respondedAt=now`, and the engine both
SQL-filters `respondedAt >= now-7d` and re-applies the same window in the pure
`computeDeclinedRescheduleDates` helper (the testable cooldown contract).
**Why:** the cooldown should count from the moment of the user's decision; if a
future change stops setting `respondedAt` on dismiss, cooldown silently breaks.
