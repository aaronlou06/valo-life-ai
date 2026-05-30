import { Router, type IRouter } from "express";
import { eq, and, gte, desc } from "drizzle-orm";
import {
  db,
  dailyLogsTable,
  goalsTable,
  habitsTable,
  debriefExtractionsTable,
  userProfilesTable,
  insightsTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

function getDateInTimezone(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  } catch {
    return new Date().toISOString().split("T")[0]!;
  }
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export interface PrimaryAction {
  label: string;
  actionType: "start_checkin" | "open_goals" | "open_habits" | "open_voice" | "open_log" | "open_insights";
  payload: Record<string, unknown>;
}

export interface TodayCard {
  type: string;
  priority: number;
  data: Record<string, unknown>;
  primaryAction: PrimaryAction;
  bonus?: boolean;
}

function readinessLabel(
  hrv: number | null | undefined,
  sleep: number | null | undefined,
  avgHrv: number | null,
  avgSleep: number | null,
): "Strong" | "Good" | "Low" | "No data" {
  if (hrv == null && sleep == null) return "No data";
  const lowHrv = hrv != null && (avgHrv != null ? hrv < avgHrv - 8 : hrv < 40);
  const lowSleep = sleep != null && (avgSleep != null ? sleep < avgSleep - 0.5 : sleep < 6);
  if (lowHrv || lowSleep) return "Low";
  const strongHrv = hrv != null && (avgHrv != null ? hrv >= avgHrv : hrv > 55);
  const strongSleep = sleep != null && (avgSleep != null ? sleep >= avgSleep : sleep >= 7.5);
  if (strongHrv || strongSleep) return "Strong";
  return "Good";
}

router.get("/today/cards", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const cutoff14 = fourteenDaysAgo.toISOString().split("T")[0]!;

  const [profileRows, recentLogs, goals, habits, latestInsights] = await Promise.all([
    db
      .select({
        callTimezone: userProfilesTable.callTimezone,
        userMotivation: userProfilesTable.userMotivation,
      })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, userId))
      .limit(1),
    db
      .select({
        date: dailyLogsTable.date,
        hrv: dailyLogsTable.hrv,
        sleepHours: dailyLogsTable.sleepHours,
        restingHeartRate: dailyLogsTable.restingHeartRate,
      })
      .from(dailyLogsTable)
      .where(and(eq(dailyLogsTable.userId, userId), gte(dailyLogsTable.date, cutoff14)))
      .orderBy(desc(dailyLogsTable.date)),
    db.select().from(goalsTable).where(eq(goalsTable.userId, userId)),
    db.select().from(habitsTable).where(eq(habitsTable.userId, userId)),
    db
      .select({ content: insightsTable.content })
      .from(insightsTable)
      .where(eq(insightsTable.userId, userId))
      .orderBy(desc(insightsTable.createdAt))
      .limit(1),
  ]);

  const tz = profileRows[0]?.callTimezone ?? "America/New_York";
  const today = getDateInTimezone(tz);

  const yesterdayDate = new Date(today + "T12:00:00Z");
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const yesterday = yesterdayDate.toISOString().split("T")[0]!;

  const yesterdayDebriefRows = await db
    .select({ oneWin: debriefExtractionsTable.oneWin })
    .from(debriefExtractionsTable)
    .where(and(eq(debriefExtractionsTable.userId, userId), eq(debriefExtractionsTable.date, yesterday)))
    .limit(1);

  // Compute 14-day averages (exclude today)
  const histLogs = recentLogs.filter((l) => l.date !== today);
  const logsWithHrv = histLogs.filter((l) => l.hrv != null);
  const avgHrv =
    logsWithHrv.length > 0
      ? Math.round(logsWithHrv.reduce((s, l) => s + l.hrv!, 0) / logsWithHrv.length)
      : null;
  const logsWithSleep = histLogs.filter((l) => l.sleepHours != null);
  const avgSleep =
    logsWithSleep.length > 0
      ? Math.round((logsWithSleep.reduce((s, l) => s + l.sleepHours!, 0) / logsWithSleep.length) * 10) / 10
      : null;

  const todayLog = recentLogs.find((l) => l.date === today);
  const readiness = readinessLabel(todayLog?.hrv, todayLog?.sleepHours, avgHrv, avgSleep);

  // ── Priority scoring ────────────────────────────────────────────────────────
  const candidates: TodayCard[] = [];

  // 1. Recovery card — priority 1 when below baseline, else lower
  const hasWearable = todayLog?.hrv != null || todayLog?.sleepHours != null;
  const recoveryPriority = readiness === "Low" ? 1 : readiness === "Strong" ? 3 : hasWearable ? 4 : 6;
  candidates.push({
    type: "recovery",
    priority: recoveryPriority,
    data: {
      hrv: todayLog?.hrv ?? null,
      sleep: todayLog?.sleepHours ?? null,
      rhr: todayLog?.restingHeartRate ?? null,
      readiness,
      avgHrv,
      avgSleep,
    },
    primaryAction:
      readiness === "Low"
        ? { label: "Talk to Valo about recovery", actionType: "start_checkin", payload: { focus: "recovery" } }
        : hasWearable
          ? { label: "Log today's metrics", actionType: "open_log", payload: {} }
          : { label: "Log your sleep and HRV", actionType: "open_log", payload: { focus: "health" } },
  });

  // 2. Goal deadline — priority 1 when due within 7 days
  const urgentGoal = goals
    .filter((g) => g.targetDate != null && daysUntil(g.targetDate) >= 0 && daysUntil(g.targetDate) <= 7)
    .sort((a, b) => daysUntil(a.targetDate!) - daysUntil(b.targetDate!))[0];

  if (urgentGoal) {
    candidates.push({
      type: "goal_deadline",
      priority: 1,
      data: {
        goalName: urgentGoal.title,
        percent: urgentGoal.progressPercent,
        daysLeft: urgentGoal.targetDate != null ? daysUntil(urgentGoal.targetDate) : null,
      },
      primaryAction: { label: "Update goal progress", actionType: "open_goals", payload: { goalId: urgentGoal.id } },
    });
  } else {
    const activeGoal = goals
      .filter((g) => g.progressPercent < 100)
      .sort((a, b) => b.progressPercent - a.progressPercent)[0];
    if (activeGoal) {
      candidates.push({
        type: "goal_progress",
        priority: 4,
        data: {
          goalName: activeGoal.title,
          percent: activeGoal.progressPercent,
          daysLeft: activeGoal.targetDate != null ? daysUntil(activeGoal.targetDate) : null,
        },
        primaryAction: { label: "Update goal progress", actionType: "open_goals", payload: { goalId: activeGoal.id } },
      });
    }
  }

  // 3. Win card — yesterday's debrief win (high priority if present)
  const win = yesterdayDebriefRows[0]?.oneWin;
  if (win) {
    candidates.push({
      type: "win",
      priority: 1,
      data: { text: win },
      primaryAction: { label: "Keep the momentum going", actionType: "start_checkin", payload: { focus: "win" } },
    });
  }

  // 4. Streak card — habits with streak ≥ 5 get priority 2, shorter streaks lower
  const topStreakHabit = habits
    .filter((h) => h.streak >= 5)
    .sort((a, b) => b.streak - a.streak)[0];
  if (topStreakHabit) {
    candidates.push({
      type: "streak",
      priority: 2,
      data: { habitName: topStreakHabit.name, streakDays: topStreakHabit.streak },
      primaryAction: { label: "Log today's habits", actionType: "open_habits", payload: {} },
    });
  } else {
    const anyStreakHabit = habits
      .filter((h) => h.streak >= 2)
      .sort((a, b) => b.streak - a.streak)[0];
    if (anyStreakHabit) {
      candidates.push({
        type: "streak",
        priority: 5,
        data: { habitName: anyStreakHabit.name, streakDays: anyStreakHabit.streak },
        primaryAction: { label: "Log today's habits", actionType: "open_habits", payload: {} },
      });
    }
  }

  // 5. Motivation card — filler from onboarding text
  const motivation = profileRows[0]?.userMotivation;
  if (motivation) {
    candidates.push({
      type: "motivation",
      priority: 7,
      data: { text: motivation },
      primaryAction: { label: "Start your evening debrief", actionType: "open_voice", payload: {} },
    });
  }

  // 6. Pattern card — latest AI insight, lowest priority filler
  const latestInsight = latestInsights[0];
  if (latestInsight?.content) {
    candidates.push({
      type: "pattern",
      priority: 8,
      data: { text: latestInsight.content },
      primaryAction: { label: "Explore your insights", actionType: "open_insights", payload: {} },
    });
  }

  // Sort and pick top 3
  candidates.sort((a, b) => a.priority - b.priority);
  const topCards = candidates.slice(0, 3);

  // Fill to 3 with graceful placeholders if user has no data yet
  const fillers: TodayCard[] = [
    {
      type: "recovery",
      priority: 99,
      data: { hrv: null, sleep: null, rhr: null, readiness: "No data" },
      primaryAction: { label: "Log your sleep and HRV", actionType: "open_log", payload: { focus: "health" } },
    },
    {
      type: "goal_progress",
      priority: 99,
      data: { goalName: "Add your first goal to start tracking progress." },
      primaryAction: { label: "Add a goal", actionType: "open_goals", payload: {} },
    },
    {
      type: "motivation",
      priority: 99,
      data: { text: "Every check-in helps Valo understand you better." },
      primaryAction: { label: "Start your evening debrief", actionType: "open_voice", payload: {} },
    },
  ];
  let fi = 0;
  while (topCards.length < 3 && fi < fillers.length) {
    const filler = fillers[fi++]!;
    if (!topCards.some((c) => c.type === filler.type)) {
      topCards.push(filler);
    }
  }

  // ── Bonus card ──────────────────────────────────────────────────────────────
  const maxHabitStreak = habits.reduce((max, h) => Math.max(max, h.streak), 0);
  const completedGoal = goals.find((g) => g.progressPercent >= 100);
  let bonusCard: TodayCard | null = null;

  if (completedGoal) {
    bonusCard = {
      type: "congratulations",
      priority: 0,
      bonus: true,
      data: {
        message: `You completed "${completedGoal.title}". Outstanding work.`,
        streak: maxHabitStreak,
      },
      primaryAction: { label: "Celebrate with Valo", actionType: "start_checkin", payload: { focus: "win" } },
    };
  } else if (maxHabitStreak >= 3) {
    bonusCard = {
      type: "congratulations",
      priority: 0,
      bonus: true,
      data: {
        message: `${maxHabitStreak}-day streak — you're building something real.`,
        streak: maxHabitStreak,
      },
      primaryAction: { label: "Celebrate with Valo", actionType: "start_checkin", payload: { focus: "win" } },
    };
  }

  res.json({ cards: topCards, bonusCard });
});

export default router;
