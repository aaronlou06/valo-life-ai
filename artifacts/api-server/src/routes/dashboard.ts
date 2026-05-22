import { Router, type IRouter } from "express";
import { eq, and, desc, gte } from "drizzle-orm";
import { db, dailyLogsTable, moodEntriesTable, habitsTable, logEntriesTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

function computeStreak(logDates: Set<string>, today: string): number {
  let streak = 0;
  const cursor = new Date(today);
  // If today hasn't been logged yet, don't penalise — start counting from yesterday
  if (!logDates.has(today)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (true) {
    const dateStr = cursor.toISOString().split("T")[0]!;
    if (logDates.has(dateStr)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

router.get("/dashboard", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const today = new Date().toISOString().split("T")[0]!;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoff = sevenDaysAgo.toISOString().split("T")[0]!;

  const [[todayLog], recentMoods, habits, todayEntries, allLogDates] = await Promise.all([
    db.select().from(dailyLogsTable).where(and(eq(dailyLogsTable.userId, userId), eq(dailyLogsTable.date, today))),
    db.select().from(moodEntriesTable).where(and(eq(moodEntriesTable.userId, userId), gte(moodEntriesTable.date, cutoff))).orderBy(desc(moodEntriesTable.createdAt)),
    db.select().from(habitsTable).where(eq(habitsTable.userId, userId)),
    db.select().from(logEntriesTable).where(and(eq(logEntriesTable.userId, userId), eq(logEntriesTable.date, today))),
    db.select({ date: dailyLogsTable.date }).from(dailyLogsTable).where(eq(dailyLogsTable.userId, userId)),
  ]);

  const logDateSet = new Set(allLogDates.map((r) => r.date));
  const streak = computeStreak(logDateSet, today);

  const avgMood = recentMoods.length > 0
    ? recentMoods.reduce((sum, m) => sum + m.score, 0) / recentMoods.length
    : 5;

  const completedHabits = habits.filter((h) => h.completedToday).length;
  const habitRate = habits.length > 0 ? completedHabits / habits.length : 0;

  const hasWorkout = todayEntries.some((e) => e.type === "workout") || !!todayLog?.workoutType;

  let healthScore = 5;
  if (todayLog?.sleepHours) {
    const sleepScore = Math.min(10, Math.max(0, ((todayLog.sleepHours - 4) / 4) * 10));
    healthScore = Math.round((sleepScore + (hasWorkout ? 8 : 5) + (todayLog.steps ? Math.min(10, (todayLog.steps / 10000) * 10) : 5)) / 3);
  }

  const workScore = Math.round(habitRate * 10);
  const relationshipScore = Math.round(avgMood * 0.8 + (todayEntries.filter((e) => e.type === "relationship").length > 0 ? 2 : 0));

  const healthStatus = healthScore >= 7 ? "Strong momentum" : healthScore >= 4 ? "Building consistency" : "Needs attention";
  const workStatus = workScore >= 7 ? "Focused and on track" : workScore >= 4 ? "Making progress" : "Off rhythm";
  const relationshipStatus = relationshipScore >= 7 ? "Connected and present" : relationshipScore >= 4 ? "Staying in touch" : "Could use more connection";

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
  });
});

export default router;
