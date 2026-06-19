// Minimal in-memory sliding-window rate limiter.
//
// The API server runs as a single instance in this environment, so an
// in-memory map is sufficient to throttle abuse (spam / enumeration) of the
// password-reset endpoints. Each key (e.g. an email or an IP) tracks recent
// hit timestamps; hits older than the window are pruned on access.

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may retry (only meaningful when !allowed). */
  retryAfterSeconds: number;
}

/**
 * Record a hit for `key` and report whether it is within the allowed budget.
 *
 * @param key       Identifier to throttle (namespace it, e.g. `forgot:email:foo`).
 * @param limit     Max hits allowed within the window.
 * @param windowMs  Sliding window size in milliseconds.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => t > cutoff);

  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    const oldest = bucket.hits[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { allowed: true, retryAfterSeconds: 0 };
}

// Occasionally drop fully-expired buckets so the map cannot grow unbounded.
const PRUNE_INTERVAL_MS = 10 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.hits.length === 0 || bucket.hits.every((t) => t < now - 60 * 60 * 1000)) {
      buckets.delete(key);
    }
  }
}, PRUNE_INTERVAL_MS).unref?.();
