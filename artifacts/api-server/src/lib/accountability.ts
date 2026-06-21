import crypto from "node:crypto";
import { and, eq, gte, lte, isNull, inArray } from "drizzle-orm";
import {
  db,
  verificationEventsTable,
  commitmentExceptionsTable,
  encouragementsTable,
  userProfilesTable,
  type SharedCommitment,
} from "@workspace/db";
import { getDateInTimezone, DEFAULT_TIMEZONE } from "./dates";
import { deriveHabitStreaks } from "./habitStreaks";

// Invite codes: 8 chars, uppercase, ambiguity-free alphabet (no I/L/O/0/1).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateInviteCode(): string {
  const bytes = crypto.randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return out;
}

/** Resolve the buddy-facing display name for a user (never their email). */
export async function getDisplayName(userId: string): Promise<string | null> {
  const [p] = await db
    .select({ displayName: userProfilesTable.displayName, name: userProfilesTable.name })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);
  return p?.displayName ?? p?.name ?? null;
}

export type OnTrackStatus = "on_track" | "slipping" | "away";
export type ShareScope = "streak_only" | "summary" | "full";

export interface BuddyCommitmentView {
  commitmentId: number;
  title: string;
  metricType: string;
  cadence: string;
  shareScope: string;
  onTrackStatus: OnTrackStatus;
  streak: number | null;
  completionRate: number | null;
  weeklyTarget: number | null;
  /** True if the viewing buddy already sent a support tap today (uses sentDate, same boundary as the DB unique index). */
  cheeredToday: boolean;
}

function weeklyTargetFor(commitment: Pick<SharedCommitment, "cadence" | "cadenceDaysPerWeek">): number | null {
  if (commitment.cadence === "daily") return 7;
  if (commitment.cadence === "weekly") return commitment.cadenceDaysPerWeek ?? null;
  return null;
}

/** YYYY-MM-DD that is `days` before the given ISO date. */
function isoDaysBefore(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split("T")[0]!;
}

/**
 * Build the scope-enforced buddy view for a set of commitments owned by one
 * user. Computes onTrackStatus server-side and gates metric detail by scope so
 * raw occurrence dates are NEVER returned to a buddy at any scope.
 *
 * "away" is derived from any exception (pause or excused) whose window covers
 * today: a scope='all' exception marks every commitment away, and a scope='one'
 * exception marks just its commitmentId away.
 */
export async function buildBuddyCommitmentViews(
  ownerId: string,
  commitments: Array<SharedCommitment & { shareScope: string }>,
  viewerUserId: string,
): Promise<BuddyCommitmentView[]> {
  if (commitments.length === 0) return [];

  const [profile, viewerProfile] = await Promise.all([
    db
      .select({ tz: userProfilesTable.callTimezone })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, ownerId))
      .limit(1)
      .then((r) => r[0]),
    db
      .select({ tz: userProfilesTable.callTimezone })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, viewerUserId))
      .limit(1)
      .then((r) => r[0]),
  ]);
  const today = getDateInTimezone(profile?.tz ?? DEFAULT_TIMEZONE);
  // viewerToday uses the viewer's timezone — same boundary sentDate was stored under.
  const viewerToday = getDateInTimezone(viewerProfile?.tz ?? DEFAULT_TIMEZONE);
  const windowStart = isoDaysBefore(today, 6); // inclusive 7-day window

  const { byHabitId } = await deriveHabitStreaks(ownerId);

  // Habit-backed completion counts over the current 7-day window.
  const habitIds = commitments
    .filter((c) => c.sourceType === "habit" && c.sourceId != null)
    .map((c) => c.sourceId as number);
  const doneByHabit = new Map<number, number>();
  if (habitIds.length > 0) {
    const rows = await db
      .select({
        habitId: verificationEventsTable.habitId,
        occurrenceDate: verificationEventsTable.occurrenceDate,
        status: verificationEventsTable.status,
      })
      .from(verificationEventsTable)
      .where(
        and(
          eq(verificationEventsTable.userId, ownerId),
          inArray(verificationEventsTable.habitId, habitIds),
          gte(verificationEventsTable.occurrenceDate, windowStart),
          lte(verificationEventsTable.occurrenceDate, today),
        ),
      );
    for (const r of rows) {
      if (r.habitId == null || r.status !== "done") continue;
      doneByHabit.set(r.habitId, (doneByHabit.get(r.habitId) ?? 0) + 1);
    }
  }

  // Which commitments the viewer has already cheered today.
  // Uses sentDate (stored in sender's local TZ at write time) — exactly the
  // same boundary as the partial unique index, so read and write can never disagree.
  const commitmentIds = commitments.map((c) => c.id);
  const cheeredSet = new Set<number>();
  const cheeredRows = await db
    .select({ commitmentId: encouragementsTable.commitmentId })
    .from(encouragementsTable)
    .where(
      and(
        eq(encouragementsTable.senderId, viewerUserId),
        eq(encouragementsTable.senderType, "user"),
        eq(encouragementsTable.messageType, "support"),
        eq(encouragementsTable.sentDate, viewerToday),
        inArray(encouragementsTable.commitmentId, commitmentIds),
      ),
    );
  for (const r of cheeredRows) {
    if (r.commitmentId != null) cheeredSet.add(r.commitmentId);
  }

  // Exceptions (pause or excused) whose window covers today. scope='all' marks
  // every commitment away; scope='one' marks just its commitmentId away.
  const todayExceptions = await db
    .select({
      scope: commitmentExceptionsTable.scope,
      commitmentId: commitmentExceptionsTable.commitmentId,
    })
    .from(commitmentExceptionsTable)
    .where(
      and(
        eq(commitmentExceptionsTable.userId, ownerId),
        lte(commitmentExceptionsTable.startDate, today),
        gte(commitmentExceptionsTable.endDate, today),
      ),
    );
  let awayFromAllScope = false;
  const awayCommitmentIds = new Set<number>();
  for (const e of todayExceptions) {
    if (e.scope === "all") awayFromAllScope = true;
    else if (e.scope === "one" && e.commitmentId != null) awayCommitmentIds.add(e.commitmentId);
  }

  return commitments.map((c) => {
    const scope = c.shareScope;
    const weeklyTarget = weeklyTargetFor(c);
    const streakVal =
      c.sourceType === "habit" && c.sourceId != null
        ? byHabitId.get(c.sourceId)?.current ?? 0
        : null;

    let completionRate: number | null = null;
    if (c.sourceType === "habit" && c.sourceId != null) {
      const done = doneByHabit.get(c.sourceId) ?? 0;
      const denom = weeklyTarget ?? 7;
      completionRate = denom > 0 ? Math.min(1, done / denom) : 0;
    }

    let onTrackStatus: OnTrackStatus;
    if (awayFromAllScope || awayCommitmentIds.has(c.id)) onTrackStatus = "away";
    else if (completionRate != null && completionRate < 0.6) onTrackStatus = "slipping";
    else onTrackStatus = "on_track";

    // Scope gating: streak_only exposes only streak + status; summary/full add
    // completionRate + weeklyTarget. No scope returns occurrence dates.
    const summaryOrFull = scope === "summary" || scope === "full";
    return {
      commitmentId: c.id,
      title: c.title,
      metricType: c.metricType,
      cadence: c.cadence,
      shareScope: scope,
      onTrackStatus,
      streak: streakVal,
      completionRate: summaryOrFull ? completionRate : null,
      weeklyTarget: summaryOrFull ? weeklyTarget : null,
      cheeredToday: cheeredSet.has(c.id),
    };
  });
}
