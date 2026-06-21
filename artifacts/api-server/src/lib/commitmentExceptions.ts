import { and, eq, isNotNull } from "drizzle-orm";
import {
  db,
  commitmentExceptionsTable,
  commitmentExceptionTargetsTable,
  sharedCommitmentsTable,
} from "@workspace/db";

// Hard ceiling on exception-window length, enforced at the write route
// (POST /commitment-exceptions). The loop guard below sits one above it purely
// as a corruption backstop so a valid max-length window is never truncated.
export const MAX_EXCEPTION_WINDOW_DAYS = 366;

/** Inclusive list of YYYY-MM-DD dates between two ISO dates. */
function expandDateRange(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  let cur = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  let guard = 0;
  while (cur <= end && guard <= MAX_EXCEPTION_WINDOW_DAYS) {
    out.push(cur.toISOString().split("T")[0]!);
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
    guard++;
  }
  return out;
}

/**
 * Canonical loader: for a user, return the set of dates each habit is "paused"
 * on. A habit is paused on date D when it backs an active commitment covered by
 * a `kind='pause'` exception whose [startDate, endDate] window includes D.
 *
 * Resolves all three scopes:
 *   - scope='all'      → every active habit-backed commitment for the user
 *   - scope='one'      → the single commitment named by commitmentId
 *   - scope='several'  → the commitments listed in commitment_exception_targets
 *
 * Only 'pause' exceptions freeze a streak / suppress catch-up (an 'excused'
 * absence waives cadence targets but does not freeze a daily streak). Callers
 * must NOT pass exception data in — this is the single fetch point, so a streak
 * caller can never forget to apply exceptions.
 */
export async function loadPausedDatesByHabit(
  userId: string,
): Promise<Map<number, Set<string>>> {
  const byHabit = new Map<number, Set<string>>();

  const pauses = await db
    .select()
    .from(commitmentExceptionsTable)
    .where(
      and(
        eq(commitmentExceptionsTable.userId, userId),
        eq(commitmentExceptionsTable.kind, "pause"),
      ),
    );
  if (pauses.length === 0) return byHabit;

  // Active habit-backed commitments owned by the user → commitmentId → habitId.
  const commitments = await db
    .select({
      id: sharedCommitmentsTable.id,
      sourceId: sharedCommitmentsTable.sourceId,
    })
    .from(sharedCommitmentsTable)
    .where(
      and(
        eq(sharedCommitmentsTable.userId, userId),
        eq(sharedCommitmentsTable.sourceType, "habit"),
        eq(sharedCommitmentsTable.isActive, true),
        isNotNull(sharedCommitmentsTable.sourceId),
      ),
    );
  const habitByCommitment = new Map<number, number>();
  for (const c of commitments) {
    if (c.sourceId != null) habitByCommitment.set(c.id, c.sourceId);
  }
  if (habitByCommitment.size === 0) return byHabit;

  // Targets for any scope='several' pauses (Stage 0 writes none, but resolve generically).
  const severalIds = pauses.filter((p) => p.scope === "several").map((p) => p.id);
  const targetsByException = new Map<number, number[]>();
  if (severalIds.length > 0) {
    const targets = await db
      .select()
      .from(commitmentExceptionTargetsTable)
      .where(isNotNull(commitmentExceptionTargetsTable.exceptionId));
    for (const t of targets) {
      if (!severalIds.includes(t.exceptionId)) continue;
      const list = targetsByException.get(t.exceptionId) ?? [];
      list.push(t.commitmentId);
      targetsByException.set(t.exceptionId, list);
    }
  }

  const allCommitmentIds = [...habitByCommitment.keys()];

  for (const p of pauses) {
    let commitmentIds: number[] = [];
    if (p.scope === "all") commitmentIds = allCommitmentIds;
    else if (p.scope === "one") commitmentIds = p.commitmentId != null ? [p.commitmentId] : [];
    else if (p.scope === "several") commitmentIds = targetsByException.get(p.id) ?? [];

    const dates = expandDateRange(p.startDate, p.endDate);
    for (const cid of commitmentIds) {
      const habitId = habitByCommitment.get(cid);
      if (habitId == null) continue;
      let set = byHabit.get(habitId);
      if (!set) {
        set = new Set<string>();
        byHabit.set(habitId, set);
      }
      for (const d of dates) set.add(d);
    }
  }

  return byHabit;
}
