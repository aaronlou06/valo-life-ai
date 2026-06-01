import { db, featureFlagsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

interface CachedFlag {
  flag: typeof featureFlagsTable.$inferSelect | null;
  expiresAt: number;
}

const cache = new Map<string, CachedFlag>();
const TTL_MS = 5 * 60 * 1000;

export async function isFeatureEnabled(key: string, userId?: string): Promise<boolean> {
  const now = Date.now();
  const cached = cache.get(key);
  let flag: typeof featureFlagsTable.$inferSelect | null;

  if (cached && cached.expiresAt > now) {
    flag = cached.flag;
  } else {
    const rows = await db
      .select()
      .from(featureFlagsTable)
      .where(eq(featureFlagsTable.key, key))
      .limit(1);
    flag = rows[0] ?? null;
    cache.set(key, { flag, expiresAt: now + TTL_MS });
  }

  if (!flag || !flag.enabled) return false;

  if (userId && flag.allowedUserIds?.includes(userId)) return true;

  const pct = parseFloat(String(flag.rolloutPercent ?? "100"));
  if (pct >= 100) return true;
  if (pct <= 0) return false;

  if (userId) {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = (hash * 31 + userId.charCodeAt(i)) & 0xffffffff;
    }
    return Math.abs(hash) % 100 < pct;
  }

  return Math.random() * 100 < pct;
}

export async function getFlag(key: string) {
  const rows = await db
    .select()
    .from(featureFlagsTable)
    .where(eq(featureFlagsTable.key, key))
    .limit(1);
  return rows[0] ?? null;
}

export async function setFlag(key: string, enabled: boolean, description?: string): Promise<void> {
  cache.delete(key);
  await db
    .insert(featureFlagsTable)
    .values({ key, enabled, description })
    .onConflictDoUpdate({
      target: featureFlagsTable.key,
      set: { enabled, updatedAt: new Date() },
    });
}
