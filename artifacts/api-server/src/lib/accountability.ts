import crypto from "node:crypto";
import { and, eq, gte, lte, isNull, inArray } from "drizzle-orm";
import {
  db,
  verificationEventsTable,
  commitmentExceptionsTable,
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
 * STAGE 0 NOTE: "away" is derived from exceptions that cover today. Until the
 * commitmentId column lands on commitment_exceptions (Checkpoint D), only
 * scope='all' exceptions (which apply to every active commitment) are honored
 * here; per-commitment scope='one' away-state completes in Checkpoint D.
 */
export async function buildBuddyCommitmentViews(
  ownerId: string,
  commitments: Array<SharedCommitment & { shareScope: string }>,
): Promise<BuddyCommitmentView[]> {
  if (commitments.length === 0) return [];

  const [profile] = await db
    .select({ tz: userProfilesTable.callTimezone })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, ownerId))
    .limit(1);
  const today = getDateInTimezone(profile?.tz ?? DEFAULT_TIMEZONE);
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

  // Owner-wide "all"-scope exceptions covering today (pause or excused).
  const allScopeExceptions = await db
    .select({ id: commitmentExceptionsTable.id })
    .from(commitmentExceptionsTable)
    .where(
      and(
        eq(commitmentExceptionsTable.userId, ownerId),
        eq(commitmentExceptionsTable.scope, "all"),
        lte(commitmentExceptionsTable.startDate, today),
        gte(commitmentExceptionsTable.endDate, today),
      ),
    );
  const awayFromAllScope = allScopeExceptions.length > 0;

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
    if (awayFromAllScope) onTrackStatus = "away";
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
    };
  });
}
