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

## Exception schema: two fields still needed for per-commitment exceptions
`commitment_exceptions` needs two more fields before per-commitment exceptions work:
- `commitmentId` (nullable int FK → shared_commitments): scope='one' has no inline
  target column, so a single-commitment exception currently can't point anywhere.
  Add nullable; set for scope='one', null for 'all'/'several' (which use the
  junction table / all active commitments).
- `isRetroactive` (boolean): auto-set server-side at write = (startDate < today);
  feed badges these "noted retroactively".
Until `commitmentId` exists, the buddy view's `away` status (in
`buildBuddyCommitmentViews`) only honors scope='all' exceptions; scope='one'
away-state needs this column.
Naming diverged intentionally from plan and is fine: `kind`(pause/excused) not
`exceptionType`, `reason` not `note`, `startDate`/`endDate` not window*. No
`heads_up` type (not in done-looks-like). These are additive dev-push changes.

## Stage 0 scope
- HABIT-backed commitments only in UI (sourceType enum keeps goal/standalone
  schema-ready). Exception scope ships `one`+`all` only (`several` + junction
  table `commitment_exception_targets` is schema-ready, UI-deferred).
- Solo accountability tool deprecated → redirect to /commitment/new.
