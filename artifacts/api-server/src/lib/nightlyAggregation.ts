import { eq, and, gte, lt } from "drizzle-orm";
import {
  db,
  usersTable,
  dailyLogsTable,
  habitsTable,
  habitCompletionsTable,
  dailySummariesTable,
  weeklyRollupsTable,
} from "@workspace/db";
import { logger } from "./logger";

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().split("T")[0]!;
}

function avgOf(vals: (number | null | undefined)[]): number | null {
  const nums = vals.filter((v): v is number => v != null);
  return nums.length > 0 ? nums.reduce((s, v) => s + v, 0) / nums.length : null;
}

async function upsertDailySummary(userId: string, day: string): Promise<void> {
  const [log] = await db
    .select()
    .from(dailyLogsTable)
    .where(and(eq(dailyLogsTable.userId, userId), eq(dailyLogsTable.date, day)))
    .limit(1);

  if (!log) return;

  const [habitRows, completionRows] = await Promise.all([
    db.select({ id: habitsTable.id }).from(habitsTable).where(eq(habitsTable.userId, userId)),
    db
      .select({ habitId: habitCompletionsTable.habitId })
      .from(habitCompletionsTable)
      .where(
        and(
          eq(habitCompletionsTable.userId, userId),
          eq(habitCompletionsTable.completionDate, day),
          eq(habitCompletionsTable.completed, true),
        ),
      ),
  ]);

  const habitCompletionRate =
    habitRows.length > 0 ? completionRows.length / habitRows.length : null;

  const values = {
    userId,
    day,
    steps: log.steps ?? null,
    sleepHours: log.sleepHours ?? null,
    hrvMs: log.hrv != null ? (log.hrv as number) : null,
    restingHr: log.restingHeartRate != null ? (log.restingHeartRate as number) : null,
    activeCalories: log.activeCalories != null ? (log.activeCalories as number) : null,
    moodAvg: log.moodScore != null ? (log.moodScore as number) : null,
    habitCompletionRate,
  };

  await db
    .insert(dailySummariesTable)
    .values(values)
    .onConflictDoUpdate({
      target: [dailySummariesTable.userId, dailySummariesTable.day],
      set: {
        steps: values.steps,
        sleepHours: values.sleepHours,
        hrvMs: values.hrvMs,
        restingHr: values.restingHr,
        activeCalories: values.activeCalories,
        moodAvg: values.moodAvg,
        habitCompletionRate: values.habitCompletionRate,
      },
    });
}

async function upsertWeeklyRollup(userId: string, weekStart: string): Promise<void> {
  const end = new Date(weekStart + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() + 7);
  const weekEnd = end.toISOString().split("T")[0]!;

  const rows = await db
    .select()
    .from(dailySummariesTable)
    .where(
      and(
        eq(dailySummariesTable.userId, userId),
        gte(dailySummariesTable.day, weekStart),
        lt(dailySummariesTable.day, weekEnd),
      ),
    );

  if (rows.length === 0) return;

  const values = {
    userId,
    weekStart,
    avgSteps: (() => {
      const v = avgOf(rows.map((r) => r.steps));
      return v != null ? Math.round(v) : null;
    })(),
    avgSleepHours: avgOf(rows.map((r) => r.sleepHours)),
    avgHrvMs: avgOf(rows.map((r) => r.hrvMs)),
    avgRestingHr: avgOf(rows.map((r) => r.restingHr)),
    moodAvg: avgOf(rows.map((r) => r.moodAvg)),
  };

  await db
    .insert(weeklyRollupsTable)
    .values(values)
    .onConflictDoUpdate({
      target: [weeklyRollupsTable.userId, weeklyRollupsTable.weekStart],
      set: {
        avgSteps: values.avgSteps,
        avgSleepHours: values.avgSleepHours,
        avgHrvMs: values.avgHrvMs,
        avgRestingHr: values.avgRestingHr,
        moodAvg: values.moodAvg,
      },
    });
}

async function runDailyAggregation(): Promise<void> {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0]!;
  const weekStart = getWeekStart(yesterdayStr);

  const users = await db.select({ id: usersTable.id }).from(usersTable);

  for (const user of users) {
    const userId = user.id.toString();
    try {
      await upsertDailySummary(userId, yesterdayStr);
      await upsertWeeklyRollup(userId, weekStart);
      logger.info({ userId, day: yesterdayStr }, "Daily aggregation complete");
    } catch (err) {
      logger.error({ err, userId }, "Daily aggregation failed for user");
    }
  }
}

export function startNightlyAggregationJob(): void {
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  let lastRunDate = "";

  setInterval(() => {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const today = now.toISOString().split("T")[0]!;

    if (utcHour === 4 && lastRunDate !== today) {
      lastRunDate = today;
      logger.info("Nightly aggregation job triggered (4AM UTC)");
      void runDailyAggregation().catch((err: unknown) => {
        logger.error({ err }, "Nightly aggregation job failed");
      });
    }
  }, FIVE_MINUTES_MS);

  logger.info("Nightly aggregation job scheduled (4AM UTC, 5min poll)");
}
