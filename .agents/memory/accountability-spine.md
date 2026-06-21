---
name: Accountability spine schema
description: Why the buddy/coach accountability model is one shared-commitment spine, and the no-migration coach-later rule
---

# Accountability spine (buddy now, coach later)

Governing principle: every actor that watches a commitment — buddy now, AI coach
/ human coach later — is a row in `commitment_participants` on ONE
`shared_commitments` model. Adding a coach in a later stage is an INSERT with a
different `participantType`, never a schema migration.

**Why:** the original ask was a buddy surface, but bolting coaches on later as a
parallel system would fork the commitment/streak/encouragement logic. The
participant generalization keeps a single read/share path.

**How to apply:**
- New actor type = new `participantType` value (`buddy` | `ai_coach` |
  `human_coach`) + a check-constraint update, not new tables.
- Buddy-only invite machinery lives in `buddy_relationships`, kept OUT of
  `commitment_participants` so coach rows (system-joined, never invited) stay clean.
  Coach rows have null `buddyRelationshipId`.
- KNOWN GAP for coach stage: `commitment_participants_unique` is on
  (commitmentId, participantType, buddyRelationshipId) and Postgres treats NULLs
  as distinct, so it will NOT block duplicate ai_coach rows. Switch to NULLS NOT
  DISTINCT or a partial unique index when coach rows are first written.

## Privacy / process-over-outcome (hard rules)
- Email is NEVER exposed cross-user. Only `userProfiles.displayName` is surfaced
  to buddies.
- Buddies see process, never outcome numbers (no weight/calories). `shareScope`
  tiers: `streak_only` < `summary` < `full` (full = occurrence dates only).
- Per-commitment unshare is SILENT; only block/end-relationship emits an event.

## Exception-aware streak (anti-footgun)
- ONE canonical exception-aware streak function fetches `commitment_exceptions`
  itself — no caller passes exceptions in. This kills the missed-caller bug class.
- Exceptions (`pause`/`excused`) keep a streak alive across an inclusive
  date window; catch-up gap detection MUST consult them.
- `encouragements` once-a-day support rate limit is enforced by a partial unique
  index on (commitmentId, senderId, sentDate) where senderType='user' and
  messageType='support'. `sentDate` is stored explicitly (computed in sender's
  local TZ) to avoid server-TZ ambiguity of a date(sentAt) expression.

## Exception semantics & naming
- A scope='one' exception targets its commitment via the `commitmentId` column;
  scope='all' leaves it null (applies to all the user's active commitments).
  Buddy `away` status honors both scopes through this column.
- `isRetroactive` is decided server-side at write = (startDate < today's date in
  the user's timezone). The feed badges these "noted retroactively" — history is
  never silently rewritten.
- Schema vocabulary intentionally diverges from the original plan: `kind`
  (pause/excused), `reason`, `startDate`/`endDate`. There is no `heads_up` kind.
- Exception windows are capped (MAX_EXCEPTION_WINDOW_DAYS) at the write route, so
  the date-expansion loop never silently truncates a valid window.

## Activity-feed pagination
The merged feed (encouragements + exceptions + buddy-joins) must paginate on a
stable composite cursor `timestamp|type|id`, NOT bare timestamp. Per-source
filters use an inclusive `lte` on the timestamp and an in-memory tuple filter
drops already-returned rows; a bare `<timestamp` cursor permanently skips any
other events that share the boundary second.
**Why:** three independent sources are merged in app code; same-second events are
common (a write can fan out), and a timestamp-only cursor silently loses them.

## Stage 0 scope
- HABIT-backed commitments only in UI (sourceType enum keeps goal/standalone
  schema-ready). Exception scope ships `one`+`all` only (`several` + junction
  table `commitment_exception_targets` is schema-ready, UI-deferred).
- Solo accountability tool deprecated → redirect to /commitment/new.

## Buddy surface UI (Stage 0 screens)
- SINGULAR file `app/accountability-buddy.tsx` is the live surface (sections:
  buddies, own commitments, activity feed, AI-coach placeholder). The PLURAL
  route `accountability-buddies.tsx` is kept as a thin `<Redirect>` alias to the
  singular route (the original stub contract was plural) — keep both registered
  in `_layout.tsx` so external/legacy `/accountability-buddies` links still work.
- `buddy-accept/[code].tsx` supports MANUAL code entry: the code is editable
  state prefilled from the `[code]` URL param (deep-link autofills, no link =
  user types it). Accept button is gated on a non-empty code.
- Per-commitment encouragement "history" on `commitment/[id].tsx` is derived by
  filtering the GLOBAL `/accountability/feed` (type==='encouragement' &&
  Number(data.commitmentId)===id). `AccountabilityFeedItemData` is a loose
  `Record<string,unknown>`, so coerce `commitmentId` with `Number()` before
  comparing. This only reads feed page 1 — full paginated per-commitment history
  is a deferred follow-up (acceptable for v1).
- Heatmap / 30-day occurrence calendar was planned but NOT built: there is no
  occurrence-history GET endpoint (`/verification-events` is POST-only,
  `/habit-completions/{date}` is per-date). Building it needs a net-new owner
  occurrence-history endpoint — deferred, documented as drift.
- New-commitment screen defers buddy/scope selection to the detail screen
  (plan allowed "share later"); metric-type picker ships binary|count|streak.
