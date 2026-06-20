---
name: From Valo home card
description: How the Home "From Valo" headline is produced and the non-echo / grounding rules it must obey
---

# From Valo home card

The Home "From Valo" card headline (`from_valo.text` in `GET /api/home-briefing`)
must lead with a **synthesized cross-domain/cross-time observation**, never a raw
debrief stressor echoed verbatim.

## Rule
- Source the headline from `fromValoInsight.ts` (`getCachedFromValo` →
  `generateFromValoWithTimeout`), which reuses `buildVapiContext` +
  `generatePreCallIntelligence` (`pattern_observation`). Do NOT re-derive a single
  raw field (the old bug used `debrief.oneStruggle` as the first branch).
- Fallback order after synthesis: latest synthesized `insight.content` →
  `debrief.tomorrowIntention` → honest low-confidence degrade. Never quote a raw
  stressor as the headline.
- `synthesize()` has an anti-echo guard: drops any output that normalizes equal to
  a `recent_struggles` entry.

**Why:** `recurring_struggles`/`oneStruggle` are stored as RAW verbatim quotes
(see processDebrief.ts), so surfacing them directly made the card a parrot instead
of an insight. The statistical insightsEngine correlations also can't fire without
`mood_entries` (seeded account has 0), so the AI synthesis path carries the card.

**How to apply:** Any future change to the From Valo headline must keep synthesis
first and preserve the honest degrade — no fabrication when low signal. Caching is
per-user-per-day in-memory with in-flight dedupe and a ~3.5s timeout race; the
background generation populates the cache for the next load.
