import { Router, type IRouter } from "express";
import { eq, and, desc, gte } from "drizzle-orm";
import {
  db,
  dailyLogsTable,
  moodEntriesTable,
  habitsTable,
  logEntriesTable,
  debriefExtractionsTable,
  userProfilesTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

export function getDateInTimezone(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  } catch {
    return new Date().toISOString().split("T")[0]!;
  }
}

export function computeStreaks(
  dates: Set<string>,
  today: string,
): { current: number; longest: number; lastActive: string | null } {
  if (dates.size === 0) return { current: 0, longest: 0, lastActive: null };

  const sorted = Array.from(dates).sort(); // ascending YYYY-MM-DD
  const lastActive = sorted[sorted.length - 1]!;

  // Current streak: walk backward from today (forgive today if not yet logged)
  let current = 0;
  const cursor = new Date(today + "T12:00:00Z");
  if (!dates.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (true) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cursor.getUTCDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${d}`;
    if (dates.has(dateStr)) {
      current++;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    } else {
      break;
    }
  }

  // Longest streak: find max consecutive run in full history
  let longest = 0;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]! + "T12:00:00Z");
    const curr = new Date(sorted[i]! + "T12:00:00Z");
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86_400_000);
    if (diffDays === 1) {
      run++;
    } else {
      longest = Math.max(longest, run);
      run = 1;
    }
  }
  longest = Math.max(longest, run);

  return { current, longest, lastActive };
}

router.get("/dashboard", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoff = sevenDaysAgo.toISOString().split("T")[0]!;

  const [profile, [todayLogPlaceholder], recentMoods, habits, todayEntries, allLogDates, debriefDates] =
    await Promise.all([
      db
        .select({ callTimezone: userProfilesTable.callTimezone })
        .from(userProfilesTable)
        .where(eq(userProfilesTable.userId, userId))
        .limit(1),
      // Temporary placeholder — we'll re-query once we know today in user tz
      Promise.resolve([]),
      db
        .select()
        .from(moodEntriesTable)
        .where(and(eq(moodEntriesTable.userId, userId), gte(moodEntriesTable.date, cutoff)))
        .orderBy(desc(moodEntriesTable.createdAt)),
      db.select().from(habitsTable).where(eq(habitsTable.userId, userId)),
      // log entries queried below after we know today
      Promise.resolve([]),
      db
        .select({ date: dailyLogsTable.date })
        .from(dailyLogsTable)
        .where(eq(dailyLogsTable.userId, userId)),
      db
        .select({ date: debriefExtractionsTable.date })
        .from(debriefExtractionsTable)
        .where(eq(debriefExtractionsTable.userId, userId)),
    ]);

  const tz = profile[0]?.callTimezone ?? "America/New_York";
  const today = getDateInTimezone(tz);

  const [[todayLog], todayEntries2] = await Promise.all([
    db
      .select()
      .from(dailyLogsTable)
      .where(and(eq(dailyLogsTable.userId, userId), eq(dailyLogsTable.date, today))),
    db
      .select()
      .from(logEntriesTable)
      .where(and(eq(logEntriesTable.userId, userId), eq(logEntriesTable.date, today))),
  ]);

  void todayLogPlaceholder;
  void todayEntries;

  // Merge all activity dates for streak: daily logs + voice debriefs
  const allDates = new Set<string>([
    ...allLogDates.map((r) => r.date),
    ...debriefDates.map((r) => r.date),
  ]);

  const { current: streak, longest: longestStreak } = computeStreaks(allDates, today);

  const avgMood =
    recentMoods.length > 0
      ? recentMoods.reduce((sum, m) => sum + m.score, 0) / recentMoods.length
      : 5;

  const completedHabits = habits.filter((h) => h.completedToday).length;
  const habitRate = habits.length > 0 ? completedHabits / habits.length : 0;

  const hasWorkout =
    todayEntries2.some((e) => e.type === "workout") || !!todayLog?.workoutType;

  let healthScore = 5;
  if (todayLog?.sleepHours) {
    const sleepScore = Math.min(10, Math.max(0, ((todayLog.sleepHours - 4) / 4) * 10));
    healthScore = Math.round(
      (sleepScore +
        (hasWorkout ? 8 : 5) +
        (todayLog.steps ? Math.min(10, (todayLog.steps / 10000) * 10) : 5)) /
        3,
    );
  }

  const workScore = Math.round(habitRate * 10);
  const relationshipScore = Math.round(
    avgMood * 0.8 +
      (todayEntries2.filter((e) => e.type === "relationship").length > 0 ? 2 : 0),
  );

  const healthStatus =
    healthScore >= 7
      ? "Strong momentum"
      : healthScore >= 4
        ? "Building consistency"
        : "Needs attention";
  const workStatus =
    workScore >= 7
      ? "Focused and on track"
      : workScore >= 4
        ? "Making progress"
        : "Off rhythm";
  const relationshipStatus =
    relationshipScore >= 7
      ? "Connected and present"
      : relationshipScore >= 4
        ? "Staying in touch"
        : "Could use more connection";

  res.json({
    sleepHours: todayLog?.sleepHours ?? null,
    hrv: todayLog?.hrv ?? null,
    restingHeartRate: todayLog?.restingHeartRate ?? null,
    steps: todayLog?.steps ?? null,
    healthScore: Math.min(10, Math.max(0, healthScore)),
    workScore: Math.min(10, Math.max(0, workScore)),
    relationshipScore: Math.min(10, Math.max(0, relationshipScore)),
    healthStatus,
    workStatus,
    relationshipStatus,
    streak,
    longestStreak,
  });
});

export default router;
