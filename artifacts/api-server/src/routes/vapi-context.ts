import { Router, type IRouter } from "express";
import { eq, and, desc, gte, avg } from "drizzle-orm";
import { db, dailyLogsTable, moodEntriesTable, habitsTable, goalsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/vapi/context/:userId", requireAuth, async (req, res): Promise<void> => {
  const authUserId = (req as AuthenticatedRequest).userId;
  const rawUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

  if (authUserId !== rawUserId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const today = new Date().toISOString().split("T")[0]!;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().split("T")[0]!;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const weekCutoff = sevenDaysAgo.toISOString().split("T")[0]!;

  const [[todayLog], recentMoods, habits, goals, recentLogs] = await Promise.all([
    db.select().from(dailyLogsTable).where(
      and(eq(dailyLogsTable.userId, authUserId), eq(dailyLogsTable.date, today))
    ),
    db.select().from(moodEntriesTable).where(
      and(eq(moodEntriesTable.userId, authUserId), gte(moodEntriesTable.date, weekCutoff))
    ).orderBy(desc(moodEntriesTable.createdAt)),
    db.select().from(habitsTable).where(eq(habitsTable.userId, authUserId)),
    db.select().from(goalsTable).where(eq(goalsTable.userId, authUserId)).limit(5),
    db.select().from(dailyLogsTable).where(
      and(eq(dailyLogsTable.userId, authUserId), gte(dailyLogsTable.date, cutoff))
    ).orderBy(desc(dailyLogsTable.date)).limit(30),
  ]);

  const hrvValues = recentLogs.filter((l) => l.hrv != null).map((l) => l.hrv!);
  const hrv_avg = hrvValues.length > 0 ? Math.round(hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length) : null;

  const sleepValues = recentLogs.filter((l) => l.sleepHours != null).map((l) => l.sleepHours!);
  const sleep_avg = sleepValues.length > 0 ? (sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length).toFixed(1) : null;

  const avgMoodScore = recentMoods.length > 0
    ? (recentMoods.reduce((sum, m) => sum + m.score, 0) / recentMoods.length).toFixed(1)
    : null;

  const completedHabits = habits.filter((h) => h.completedToday).map((h) => h.name);
  const pendingHabits = habits.filter((h) => !h.completedToday).map((h) => h.name);
  const topGoal = goals[0];

  const contextPayload = {
    user_id: authUserId,
    sleep_hours_today: todayLog?.sleepHours ?? null,
    sleep_avg_30d: sleep_avg,
    hrv_today: todayLog?.hrv ?? null,
    hrv_avg_30d: hrv_avg,
    rhr_today: todayLog?.restingHeartRate ?? null,
    steps_today: todayLog?.steps ?? null,
    workout_today: todayLog?.workoutType ?? null,
    workout_duration: todayLog?.workoutDuration ?? null,
    workout_effort: todayLog?.workoutEffort ?? null,
    mood_avg_7d: avgMoodScore,
    habits_completed_today: completedHabits.join(", ") || "none",
    habits_pending_today: pendingHabits.join(", ") || "none",
    top_goal: topGoal?.title ?? null,
    top_goal_progress: topGoal?.progressPercent ?? null,
    date_today: today,
  };

  res.json(contextPayload);
});

export default router;
