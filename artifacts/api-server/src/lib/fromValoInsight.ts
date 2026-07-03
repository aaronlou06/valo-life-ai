import { buildVapiContext, generatePreCallIntelligence } from "./buildVapiContext";
import { logger } from "./logger";

// The synthesized "From Valo" insight surfaced on the Home card. This is the
// cross-domain / cross-time observation only Valo can produce — never a raw
// debrief stressor echoed verbatim.
export interface FromValoInsight {
  kind: "unresolved_thread" | "pattern_observation" | "commitment" | "emotional_baseline";
  text: string;
  cta_label?: string;
  cta_action?: string;
}

function todayKey(): string {
  return new Date().toISOString().split("T")[0]!;
}

// Per-user, per-day in-memory cache. No schema changes: the synthesis is
// regenerated at most once per calendar day per user (resets on process
// restart, which is acceptable — it simply regenerates lazily), OR sooner if
// explicitly invalidated via invalidateFromValoCache() when the underlying
// debrief data actually changes (see callers in vapi-webhook.ts / vapi-context.ts).
const cache = new Map<string, { date: string; value: FromValoInsight }>();
// Dedupe concurrent generations for the same user so a burst of home loads
// triggers at most one Anthropic call.
const inFlight = new Map<string, Promise<FromValoInsight | null>>();

export function getCachedFromValo(userId: string): FromValoInsight | null {
  const entry = cache.get(userId);
  if (entry && entry.date === todayKey()) return entry.value;
  return null;
}

// Called by the post-debrief processing paths (outbound webhook and in-app
// debrief endpoint) once a new debrief has been extracted and recurring
// patterns recomputed, so a same-day second debrief is reflected instead of
// serving the first debrief's cached synthesis until midnight.
export function invalidateFromValoCache(userId: string): void {
  cache.delete(userId);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function synthesize(userId: string): Promise<FromValoInsight | null> {
  const context = await buildVapiContext(userId);
  const intel = await generatePreCallIntelligence(context);
  const text = intel?.pattern_observation?.trim();

  // Honest grounding guard: generatePreCallIntelligence returns null on failure,
  // and the placeholder string "Not available" signals no real signal. In either
  // case we surface nothing here and let the route fall back / degrade honestly.
  if (!text || text.toLowerCase() === "not available") return null;

  // Anti-echo guard: the whole point of this card is a synthesized cross-domain
  // observation, never a raw debrief stressor parroted back. If the model output
  // happens to mirror one of the user's recent raw struggles verbatim, drop it
  // and let the route degrade honestly.
  const struggles = Array.isArray(context.recent_struggles)
    ? (context.recent_struggles as unknown[]).filter(
        (s): s is string => typeof s === "string",
      )
    : [];
  const normalizedText = normalize(text);
  if (struggles.some((s) => normalize(s) === normalizedText)) return null;

  const value: FromValoInsight = {
    kind: "pattern_observation",
    text,
    cta_label: "Talk it through",
    cta_action: "open_checkin",
  };
  cache.set(userId, { date: todayKey(), value });
  return value;
}

// Returns the in-flight generation promise (deduped). The underlying work
// continues and populates the cache even if the caller stops awaiting it (e.g.
// after a timeout), so a subsequent home load is served from cache.
export function generateFromValoInsight(userId: string): Promise<FromValoInsight | null> {
  const existing = inFlight.get(userId);
  if (existing) return existing;

  const p = synthesize(userId)
    .catch((err) => {
      logger.error({ err, userId }, "generateFromValoInsight: synthesis failed");
      return null;
    })
    .finally(() => inFlight.delete(userId));

  inFlight.set(userId, p);
  return p;
}

// Race the (deduped) synthesis against a timeout. On timeout we resolve to null
// so the route can serve a grounded fallback immediately; the synthesis keeps
// running in the background and caches its result for the next load.
export function generateFromValoWithTimeout(
  userId: string,
  timeoutMs: number,
): Promise<FromValoInsight | null> {
  const gen = generateFromValoInsight(userId);
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  return Promise.race([gen, timeout]).finally(() => clearTimeout(timer));
}
