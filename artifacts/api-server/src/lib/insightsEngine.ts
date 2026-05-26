import { eq, desc, and, gte } from "drizzle-orm";
import {
  db,
  dailyLogsTable,
  moodEntriesTable,
  goalsTable,
  insightsPatternsTable,
} from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "./logger";

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, denomX = 0, denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? 0 : num / denom;
}

function nDaysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!;
}

function avg(arr: number[]): number | null {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
}

type PatternInput = {
  userId: string;
  patternType: string;
  metricA: string;
  metricB: string;
  correlationScore: number;
  description: string;
  isActive: boolean;
};

export type InsightRow = { label: string; content: string; followUpQuestion?: string | null };

const SEED_INSIGHTS: InsightRow[] = [
  {
    label: "Sleep & Mood",
    content:
      "Your sleep quality has a strong connection to how you feel the next day. On nights where you logged 7+ hours, mood scores averaged 1.5 points higher. Try keeping your bedtime consistent this week.",
    followUpQuestion: "What helps you wind down before bed on your best nights?",
  },
  {
    label: "Movement Patterns",
    content:
      "You tend to log workouts earlier in the week and taper off by Thursday. Mood scores are noticeably higher on days you move. Schedule one short session for Thursday to break the pattern.",
    followUpQuestion: "What makes it harder to stay active toward the end of the week?",
  },
  {
    label: "Habit Momentum",
    content:
      "Your longest habit streaks correlate with weeks where you also hit your sleep targets. Consistency in one area reinforces the others. Pick one keystone habit to protect first this week.",
    followUpQuestion: "Which habit feels most like a keystone for everything else?",
  },
];

export async function computeCorrelations(userId: string): Promise<PatternInput[]> {
  const thirtyDaysAgo = nDaysAgo(30);

  const [logs, moods] = await Promise.all([
    db
      .select()
      .from(dailyLogsTable)
      .where(and(eq(dailyLogsTable.userId, userId), gte(dailyLogsTable.date, thirtyDaysAgo)))
      .orderBy(desc(dailyLogsTable.date)),
    db
      .select()
      .from(moodEntriesTable)
      .where(and(eq(moodEntriesTable.userId, userId), gte(moodEntriesTable.date, thirtyDaysAgo)))
      .orderBy(desc(moodEntriesTable.date)),
  ]);

  const moodByDate = new Map(moods.map((m) => [m.date, m.score]));
  const patterns: PatternInput[] = [];

  // Sleep hours vs same-day mood
  const sleepMoodPairs = logs
    .filter((l) => l.sleepHours != null && moodByDate.has(l.date))
    .map((l) => ({ sleep: l.sleepHours!, mood: moodByDate.get(l.date)! }));

  if (sleepMoodPairs.length >= 5) {
    const r = pearsonCorrelation(
      sleepMoodPairs.map((p) => p.sleep),
      sleepMoodPairs.map((p) => p.mood),
    );
    if (Math.abs(r) >= 0.25) {
      const lowSleep = sleepMoodPairs.filter((p) => p.sleep < 6);
      const highSleep = sleepMoodPairs.filter((p) => p.sleep >= 7);
      const lowAvg = avg(lowSleep.map((p) => p.mood));
      const highAvg = avg(highSleep.map((p) => p.mood));
      const description =
        lowAvg != null && highAvg != null
          ? `On nights with <6h sleep your mood averages ${lowAvg.toFixed(1)}/10 vs ${highAvg.toFixed(1)}/10 on nights with 7h+.`
          : `Sleep duration correlates with mood (r=${r.toFixed(2)}).`;
      patterns.push({ userId, patternType: "sleep_mood", metricA: "sleep_hours", metricB: "mood_score", correlationScore: r, description, isActive: true });
    }
  }

  // HRV vs same-day mood
  const hrvMoodPairs = logs
    .filter((l) => l.hrv != null && moodByDate.has(l.date))
    .map((l) => ({ hrv: l.hrv!, mood: moodByDate.get(l.date)! }));

  if (hrvMoodPairs.length >= 5) {
    const r = pearsonCorrelation(
      hrvMoodPairs.map((p) => p.hrv),
      hrvMoodPairs.map((p) => p.mood),
    );
    if (Math.abs(r) >= 0.25) {
      const meanHrv = avg(hrvMoodPairs.map((p) => p.hrv))!;
      const highHrv = hrvMoodPairs.filter((p) => p.hrv >= meanHrv);
      const lowHrv = hrvMoodPairs.filter((p) => p.hrv < meanHrv);
      const highAvg = avg(highHrv.map((p) => p.mood));
      const lowAvg = avg(lowHrv.map((p) => p.mood));
      const description =
        highAvg != null && lowAvg != null
          ? `Your mood averages ${highAvg.toFixed(1)}/10 on high-HRV days (≥${Math.round(meanHrv)}) vs ${lowAvg.toFixed(1)}/10 on low-HRV days.`
          : `HRV correlates with mood (r=${r.toFixed(2)}).`;
      patterns.push({ userId, patternType: "hrv_mood", metricA: "hrv", metricB: "mood_score", correlationScore: r, description, isActive: true });
    }
  }

  // Workout days vs mood
  const workoutMoodPairs = logs
    .filter((l) => moodByDate.has(l.date))
    .map((l) => ({ workedOut: l.workoutType != null ? 1 : 0, mood: moodByDate.get(l.date)! }));

  if (workoutMoodPairs.length >= 7) {
    const r = pearsonCorrelation(
      workoutMoodPairs.map((p) => p.workedOut),
      workoutMoodPairs.map((p) => p.mood),
    );
    if (Math.abs(r) >= 0.2) {
      const workoutDays = workoutMoodPairs.filter((p) => p.workedOut === 1);
      const restDays = workoutMoodPairs.filter((p) => p.workedOut === 0);
      const workAvg = avg(workoutDays.map((p) => p.mood));
      const restAvg = avg(restDays.map((p) => p.mood));
      const description =
        workAvg != null && restAvg != null
          ? `Your mood averages ${workAvg.toFixed(1)}/10 on workout days vs ${restAvg.toFixed(1)}/10 on rest days.`
          : `Workout days correlate with ${r > 0 ? "higher" : "lower"} mood (r=${r.toFixed(2)}).`;
      patterns.push({ userId, patternType: "workout_mood", metricA: "workout_logged", metricB: "mood_score", correlationScore: r, description, isActive: true });
    }
  }

  if (patterns.length > 0) {
    await db.delete(insightsPatternsTable).where(eq(insightsPatternsTable.userId, userId));
    await db.insert(insightsPatternsTable).values(patterns);
  }

  return patterns;
}

type AggregatedContext = {
  avgLine: string;
  recentDetail: string;
  patternLines: string;
  goalLines: string;
  hasData: boolean;
};

async function buildContext(userId: string): Promise<AggregatedContext> {
  const sevenDaysAgo = nDaysAgo(7);

  const [logs, moods, goals, patterns] = await Promise.all([
    db
      .select()
      .from(dailyLogsTable)
      .where(and(eq(dailyLogsTable.userId, userId), gte(dailyLogsTable.date, sevenDaysAgo)))
      .orderBy(desc(dailyLogsTable.date))
      .limit(7),
    db
      .select()
      .from(moodEntriesTable)
      .where(and(eq(moodEntriesTable.userId, userId), gte(moodEntriesTable.date, sevenDaysAgo)))
      .orderBy(desc(moodEntriesTable.date))
      .limit(7),
    db
      .select()
      .from(goalsTable)
      .where(eq(goalsTable.userId, userId))
      .orderBy(desc(goalsTable.updatedAt))
      .limit(3),
    db
      .select()
      .from(insightsPatternsTable)
      .where(and(eq(insightsPatternsTable.userId, userId), eq(insightsPatternsTable.isActive, true)))
      .limit(10),
  ]);

  const moodByDate = new Map(moods.map((m) => [m.date, m.score]));

  const sleepVals = logs.filter((l) => l.sleepHours != null).map((l) => l.sleepHours!);
  const hrvVals = logs.filter((l) => l.hrv != null).map((l) => l.hrv!);
  const stepsVals = logs.filter((l) => l.steps != null).map((l) => l.steps!);
  const moodVals = Array.from(moodByDate.values());
  const workoutDays = logs.filter((l) => l.workoutType != null).length;

  const avgParts = [
    sleepVals.length ? `sleep ${avg(sleepVals)!.toFixed(1)}h avg` : null,
    hrvVals.length ? `HRV ${Math.round(avg(hrvVals)!)} avg` : null,
    moodVals.length ? `mood ${avg(moodVals)!.toFixed(1)}/10 avg` : null,
    `${workoutDays}/7 workout days`,
    stepsVals.length ? `${Math.round(avg(stepsVals)!).toLocaleString()} steps/day avg` : null,
  ].filter(Boolean);

  const recentLines = logs.map((l) => {
    const mood = moodByDate.get(l.date) ?? null;
    return `  ${l.date}: sleep=${l.sleepHours ?? "-"}h, hrv=${l.hrv ?? "-"}, mood=${mood ?? "-"}/10, workout=${l.workoutType ?? "none"}, steps=${l.steps ?? "-"}`;
  });

  const sortedPatterns = [...patterns].sort(
    (a, b) => Math.abs(b.correlationScore) - Math.abs(a.correlationScore),
  );
  const topPatterns = sortedPatterns.slice(0, 2);

  const patternLines =
    topPatterns.length > 0
      ? `Detected patterns:\n${topPatterns.map((p) => `- ${p.description}`).join("\n")}`
      : "";

  const goalLines =
    goals.length > 0
      ? `Active goals (top 3):\n${goals
          .map(
            (g) =>
              `- "${g.title}" (${g.category}, ${g.progressPercent}% complete${g.targetDate ? `, target ${g.targetDate}` : ""})`,
          )
          .join("\n")}`
      : "";

  return {
    avgLine: avgParts.join(", "),
    recentDetail: recentLines.join("\n"),
    patternLines,
    goalLines,
    hasData: logs.length >= 3,
  };
}

export async function generateDailyInsights(userId: string, today: string): Promise<InsightRow[]> {
  try {
    await computeCorrelations(userId);
  } catch (err) {
    logger.warn({ err }, "Correlation computation failed — proceeding without new patterns");
  }

  const ctx = await buildContext(userId);

  if (!ctx.hasData) {
    return SEED_INSIGHTS;
  }

  const contextBlock = [
    `7-day averages: ${ctx.avgLine}`,
    `\nLast 7 days:\n${ctx.recentDetail}`,
    ctx.patternLines ? `\n${ctx.patternLines}` : "",
    ctx.goalLines ? `\n${ctx.goalLines}` : "",
  ]
    .filter(Boolean)
    .join("");

  const prompt = `You are Valo's insight engine. Generate 3-4 personalized insight cards.

${contextBlock}

Return a JSON array where each object has:
- label: short category name (e.g. "Sleep Recovery", "HRV Trend", "Workout Impact", "Goal Momentum")
- content: 2-3 sentences following ALL of these rules strictly:
  1. Reference specific numbers from the data provided above.
  2. If goals exist, connect at least one insight to a stated goal.
  3. Never give generic advice ("get more sleep", "drink water") unless tied to a specific number in the data.
  4. Every observation must be grounded in the actual data above — do not invent patterns.
  5. End with one concrete action the user can take tomorrow.
  6. Stay under 120 words total for the content field.
- followUpQuestion: one specific voice check-in question referencing the actual data

Return only valid JSON array, no markdown.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });

    const block = message.content[0];
    if (!block || block.type !== "text") throw new Error("No text block");

    const text = block.text.trim();
    const jsonText = text.startsWith("[") ? text : text.slice(text.indexOf("["));
    const parsed = JSON.parse(jsonText) as InsightRow[];
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Invalid JSON array");
    return parsed;
  } catch (err) {
    logger.error({ err }, "Claude insight generation failed — returning seed insights");
    return SEED_INSIGHTS;
  }
}
