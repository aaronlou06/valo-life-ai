import { and, asc, desc, eq, gte, lte, inArray } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  db,
  dailyLogsTable,
  debriefExtractionsTable,
  habitsTable,
  habitCompletionsTable,
  workoutSessionsTable,
  nutritionLogsTable,
  insightsPatternsTable,
  weeklyRecapsTable,
  type WeeklyRecap,
  type RecapNarrative,
} from "@workspace/db";
import { logger } from "./logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PillarScores {
  sleep: number | null;
  movement: number | null;
  work: number | null;
  mindset: number | null;
  relationships: number | null;
}

export interface WeeklyAggregate {
  weekStart: string;
  weekEnd: string;
  avgMood: number | null;
  avgSleep: number | null;
  avgHrv: number | null;
  avgSteps: number | null;
  avgEnergy: number | null;
  pillars: PillarScores;
  workoutsCompleted: number;
  habitsCompletionPct: number | null;
  debriefCount: number;
  nutritionDaysLogged: number;
  topWin: string | null;
  topStruggle: string | null;
  wins: string[];
  struggles: string[];
  patternsSnapshot: string[];
  daysWithData: number;
  isQuietWeek: boolean;
  priorPillars: PillarScores | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const ENERGY_TEXT_TO_NUM: Record<string, number> = { low: 3, moderate: 6, medium: 6, high: 9 };

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function clamp10(n: number): number {
  return Math.min(10, Math.max(0, n));
}

function round1(n: number | null): number | null {
  return n == null ? null : Math.round(n * 10) / 10;
}

function pillarsFromRow(r: {
  pillarSleep: number | null;
  pillarMovement: number | null;
  pillarWork: number | null;
  pillarMindset: number | null;
  pillarRelationships: number | null;
}): PillarScores {
  return {
    sleep: r.pillarSleep,
    movement: r.pillarMovement,
    work: r.pillarWork,
    mindset: r.pillarMindset,
    relationships: r.pillarRelationships,
  };
}

// ── Aggregation ─────────────────────────────────────────────────────────────

export async function buildWeeklyAggregate(
  userId: string,
  weekStart: string,
  weekEnd: string,
): Promise<WeeklyAggregate> {
  const [logs, debriefs, habits, workouts, nutrition, patterns, priorRecaps] = await Promise.all([
    db
      .select()
      .from(dailyLogsTable)
      .where(
        and(
          eq(dailyLogsTable.userId, userId),
          gte(dailyLogsTable.date, weekStart),
          lte(dailyLogsTable.date, weekEnd),
        ),
      ),
    db
      .select()
      .from(debriefExtractionsTable)
      .where(
        and(
          eq(debriefExtractionsTable.userId, userId),
          gte(debriefExtractionsTable.date, weekStart),
          lte(debriefExtractionsTable.date, weekEnd),
        ),
      )
      .orderBy(asc(debriefExtractionsTable.date)),
    db.select().from(habitsTable).where(eq(habitsTable.userId, userId)),
    db
      .select({ date: workoutSessionsTable.date })
      .from(workoutSessionsTable)
      .where(
        and(
          eq(workoutSessionsTable.userId, userId),
          eq(workoutSessionsTable.status, "completed"),
          gte(workoutSessionsTable.date, weekStart),
          lte(workoutSessionsTable.date, weekEnd),
        ),
      ),
    db
      .select({ date: nutritionLogsTable.date })
      .from(nutritionLogsTable)
      .where(
        and(
          eq(nutritionLogsTable.userId, userId),
          gte(nutritionLogsTable.date, weekStart),
          lte(nutritionLogsTable.date, weekEnd),
        ),
      ),
    db
      .select()
      .from(insightsPatternsTable)
      .where(
        and(eq(insightsPatternsTable.userId, userId), eq(insightsPatternsTable.isActive, true)),
      ),
    db
      .select()
      .from(weeklyRecapsTable)
      .where(and(eq(weeklyRecapsTable.userId, userId), lte(weeklyRecapsTable.weekStart, weekStart)))
      .orderBy(desc(weeklyRecapsTable.weekStart))
      .limit(2),
  ]);

  // Health metric averages from daily logs.
  const sleepVals = logs.map((l) => l.sleepHours).filter((v): v is number => v != null);
  const hrvVals = logs.map((l) => l.hrv).filter((v): v is number => v != null);
  const stepsVals = logs.map((l) => l.steps).filter((v): v is number => v != null);
  const activeCalVals = logs.map((l) => l.activeCalories).filter((v): v is number => v != null);

  // Mood: prefer daily log moodScore, fall back to debrief moodScore.
  const moodVals = [
    ...logs.map((l) => l.moodScore).filter((v): v is number => v != null),
    ...debriefs.map((d) => d.moodScore).filter((v): v is number => v != null),
  ];

  // Energy: daily_logs.energyLevel is text; map to a number.
  const energyVals = logs
    .map((l) => (l.energyLevel ? ENERGY_TEXT_TO_NUM[l.energyLevel.toLowerCase()] ?? null : null))
    .filter((v): v is number => v != null);

  const meaningfulConnectionDays = logs.filter((l) => l.meaningfulConnection === true).length;

  const avgMood = avg(moodVals);
  const avgSleep = avg(sleepVals);
  const avgHrv = avg(hrvVals);
  const avgSteps = avg(stepsVals);
  const avgEnergy = avg(energyVals);
  const avgActiveCal = avg(activeCalVals);

  // Workouts.
  const workoutsCompleted = workouts.length;

  // Habits completion %: completed completions this week / (habit count * 7).
  const habitIds = habits.map((h) => h.id);
  let habitCompletions: { completed: boolean }[] = [];
  if (habitIds.length > 0) {
    habitCompletions = await db
      .select({ completed: habitCompletionsTable.completed })
      .from(habitCompletionsTable)
      .where(
        and(
          eq(habitCompletionsTable.userId, userId),
          inArray(habitCompletionsTable.habitId, habitIds),
          gte(habitCompletionsTable.completionDate, weekStart),
          lte(habitCompletionsTable.completionDate, weekEnd),
        ),
      );
  }
  const completedCount = habitCompletions.filter((c) => c.completed).length;
  const expectedCount = habits.length * 7;
  const habitsCompletionPct =
    expectedCount > 0 ? clamp10((completedCount / expectedCount) * 10) * 10 : null;

  // Nutrition: count distinct dates logged.
  const nutritionDays = new Set(nutrition.map((n) => String(n.date)));
  const nutritionDaysLogged = nutritionDays.size;

  // Wins / struggles from debriefs.
  const wins = debriefs.map((d) => d.oneWin).filter((v): v is string => !!v && v.trim() !== "");
  const struggles = debriefs
    .map((d) => d.oneStruggle)
    .filter((v): v is string => !!v && v.trim() !== "");

  // topWin: most recent win. topStruggle: most-mentioned struggle (by simple frequency).
  const topWin = wins.length > 0 ? wins[wins.length - 1]! : null;
  let topStruggle: string | null = null;
  if (struggles.length > 0) {
    const freq = new Map<string, number>();
    for (const s of struggles) freq.set(s, (freq.get(s) ?? 0) + 1);
    topStruggle = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  }

  // ── Pillar scores (0-10), grounded in available data; null when no data. ──
  const pillarSleep = avgSleep != null ? clamp10(((avgSleep - 4) / 4) * 10) : null;

  let pillarMovement: number | null = null;
  if (avgSteps != null || avgActiveCal != null || workoutsCompleted > 0) {
    const stepsScore = avgSteps != null ? clamp10((avgSteps / 10000) * 10) : null;
    const calScore = avgActiveCal != null ? clamp10((avgActiveCal / 500) * 10) : null;
    const workoutScore = clamp10((workoutsCompleted / 4) * 10);
    const parts = [stepsScore, calScore, workoutScore].filter((v): v is number => v != null);
    pillarMovement = parts.length > 0 ? clamp10(avg(parts)!) : null;
  }

  const pillarWork = habitsCompletionPct != null ? clamp10(habitsCompletionPct / 10) : null;

  let pillarMindset: number | null = null;
  if (avgMood != null || avgEnergy != null) {
    const parts = [avgMood, avgEnergy].filter((v): v is number => v != null);
    pillarMindset = clamp10(avg(parts)!);
  }

  let pillarRelationships: number | null = null;
  if (debriefs.length > 0 || meaningfulConnectionDays > 0) {
    const connectionScore = clamp10((meaningfulConnectionDays / 7) * 10);
    const moodComponent = avgMood != null ? avgMood : null;
    const parts = [connectionScore, moodComponent].filter((v): v is number => v != null);
    pillarRelationships = clamp10(avg(parts)!);
  }

  const pillars: PillarScores = {
    sleep: round1(pillarSleep),
    movement: round1(pillarMovement),
    work: round1(pillarWork),
    mindset: round1(pillarMindset),
    relationships: round1(pillarRelationships),
  };

  // Data density: count days that have any daily log or debrief.
  const dataDays = new Set<string>([...logs.map((l) => l.date), ...debriefs.map((d) => d.date)]);
  const daysWithData = dataDays.size;
  const isQuietWeek = daysWithData < 3;

  // Prior week pillars: the most recent recap row strictly before this week.
  const priorRow = priorRecaps.find((r) => r.weekStart < weekStart) ?? null;
  const priorPillars = priorRow ? pillarsFromRow(priorRow) : null;

  return {
    weekStart,
    weekEnd,
    avgMood: round1(avgMood),
    avgSleep: round1(avgSleep),
    avgHrv: round1(avgHrv),
    avgSteps: avgSteps != null ? Math.round(avgSteps) : null,
    avgEnergy: round1(avgEnergy),
    pillars,
    workoutsCompleted,
    habitsCompletionPct: round1(habitsCompletionPct),
    debriefCount: debriefs.length,
    nutritionDaysLogged,
    topWin,
    topStruggle,
    wins,
    struggles,
    patternsSnapshot: patterns.map((p) => p.description),
    daysWithData,
    isQuietWeek,
    priorPillars,
  };
}

// ── Claude generation ─────────────────────────────────────────────────────────

const PILLAR_LABELS: Record<keyof PillarScores, string> = {
  sleep: "Sleep",
  movement: "Movement",
  work: "Work & Focus",
  mindset: "Mindset",
  relationships: "Relationships",
};

const WEEKLY_RECAP_SYSTEM_PROMPT = `You are Valo, a warm, thoughtful personal life companion writing a user's weekly recap — "Your Week with Valo". You will receive a structured summary of the user's actual logged data for one Monday–Sunday week. Write a reflective, grounded recap.

GROUNDING RULES (these are absolute):
- Only reference data that was actually logged. Never invent wins, patterns, numbers, or events.
- If a pillar has no data, omit its section entirely rather than guessing or padding.
- Do not give generic self-help advice. Speak only to what this specific week's data shows.
- For a quiet week (few days logged), return a SHORTER, honest recap. Acknowledge it was a lighter week of logging. Do not fabricate momentum or patterns. Only include sections that have real data.

valoInsight: a SINGLE 2–3 sentence cross-cutting observation grounded in this week's actual patterns (e.g. the interplay between sleep and mood, a streak that held or broke, a habit that carried the week). It must be distinct from the per-pillar sections and must NOT simply restate them. If there is genuinely too little data for a real cross-cutting observation, write one honest sentence acknowledging that.

The per-pillar "sections" array should contain one entry per pillar that HAS data. Each section: { "title": <pillar name>, "body": <2-3 sentences grounded in that pillar's data>, "delta": <the week-over-week change number you were given for that pillar, or null> }.

Return ONLY valid JSON in exactly this shape, no markdown fences, no commentary:
{
  "headline": string (one warm sentence summarizing the week),
  "valoInsight": string,
  "sections": [ { "title": string, "body": string, "delta": number | null } ],
  "closing": string (one short reflective closing line),
  "topWin": string | null (the single most meaningful win this week, drawn from logged wins, or null),
  "topStruggle": string | null (the single recurring struggle, drawn from logged struggles, or null),
  "intentionNextWeek": string (one gentle, specific intention grounded in this week's data)
}`;

interface RecapGenResult {
  headline: string;
  valoInsight: string;
  sections: { title: string; body: string; delta: number | null }[];
  closing: string;
  topWin: string | null;
  topStruggle: string | null;
  intentionNextWeek: string;
}

function buildAggregateBlock(agg: WeeklyAggregate): string {
  const lines: string[] = [];
  lines.push(`Week: ${agg.weekStart} to ${agg.weekEnd}`);
  lines.push(`Days with any logged data: ${agg.daysWithData} of 7${agg.isQuietWeek ? " (QUIET WEEK)" : ""}`);

  const metrics: string[] = [];
  if (agg.avgMood != null) metrics.push(`avg mood ${agg.avgMood}/10`);
  if (agg.avgEnergy != null) metrics.push(`avg energy ${agg.avgEnergy}/10`);
  if (agg.avgSleep != null) metrics.push(`avg sleep ${agg.avgSleep}h`);
  if (agg.avgHrv != null) metrics.push(`avg HRV ${agg.avgHrv}`);
  if (agg.avgSteps != null) metrics.push(`avg steps ${agg.avgSteps}`);
  if (metrics.length > 0) lines.push(`Averages: ${metrics.join("; ")}`);

  const pillarLines: string[] = [];
  (Object.keys(agg.pillars) as (keyof PillarScores)[]).forEach((k) => {
    const score = agg.pillars[k];
    if (score == null) return;
    const prior = agg.priorPillars?.[k];
    const delta = prior != null ? Math.round((score - prior) * 10) / 10 : null;
    pillarLines.push(
      `- ${PILLAR_LABELS[k]}: ${score}/10${delta != null ? ` (delta vs last week: ${delta >= 0 ? "+" : ""}${delta})` : " (no prior week to compare)"}`,
    );
  });
  if (pillarLines.length > 0) lines.push(`Pillar scores:\n${pillarLines.join("\n")}`);

  lines.push(
    `Activity: ${agg.workoutsCompleted} workouts; ${agg.habitsCompletionPct != null ? `${Math.round(agg.habitsCompletionPct)}% habit completion` : "no habits tracked"}; ${agg.debriefCount} check-in debriefs; nutrition logged ${agg.nutritionDaysLogged} days`,
  );

  if (agg.wins.length > 0) lines.push(`Logged wins this week:\n${agg.wins.map((w) => `- ${w}`).join("\n")}`);
  if (agg.struggles.length > 0) lines.push(`Logged struggles this week:\n${agg.struggles.map((s) => `- ${s}`).join("\n")}`);
  if (agg.patternsSnapshot.length > 0) lines.push(`Active detected patterns:\n${agg.patternsSnapshot.map((p) => `- ${p}`).join("\n")}`);

  return lines.join("\n");
}

const MODEL = "claude-haiku-4-5";

export async function generateWeeklyRecap(
  userId: string,
  aggregate: WeeklyAggregate,
): Promise<WeeklyRecap> {
  const block = buildAggregateBlock(aggregate);

  let gen: RecapGenResult | null = null;
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: WEEKLY_RECAP_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `THE USER'S WEEK:\n${block}` }],
    });
    const blockText = message.content[0];
    if (blockText && blockText.type === "text") {
      let raw = blockText.text.trim();
      const fenceMatch = raw.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
      if (fenceMatch?.[1]) raw = fenceMatch[1].trim();
      if (!raw.startsWith("{")) {
        const objStart = raw.indexOf("{");
        if (objStart >= 0) raw = raw.slice(objStart);
      }
      const parsed = JSON.parse(raw) as Partial<RecapGenResult>;
      gen = {
        headline: typeof parsed.headline === "string" ? parsed.headline : "",
        valoInsight: typeof parsed.valoInsight === "string" ? parsed.valoInsight : "",
        sections: Array.isArray(parsed.sections)
          ? (parsed.sections as unknown[])
              .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
              .map((s) => ({
                title: typeof s.title === "string" ? s.title : "",
                body: typeof s.body === "string" ? s.body : "",
                delta: typeof s.delta === "number" ? s.delta : null,
              }))
              .filter((s) => s.title !== "" && s.body !== "")
          : [],
        closing: typeof parsed.closing === "string" ? parsed.closing : "",
        topWin: typeof parsed.topWin === "string" ? parsed.topWin : null,
        topStruggle: typeof parsed.topStruggle === "string" ? parsed.topStruggle : null,
        intentionNextWeek:
          typeof parsed.intentionNextWeek === "string" ? parsed.intentionNextWeek : "",
      };
    }
  } catch (err) {
    logger.error({ err, userId }, "generateWeeklyRecap: Claude call failed");
  }

  const narrative: RecapNarrative = {
    sections: gen?.sections ?? [],
    closing: gen?.closing ?? null,
  };

  const values = {
    userId,
    weekStart: aggregate.weekStart,
    weekEnd: aggregate.weekEnd,
    generatedAt: new Date(),
    avgMood: aggregate.avgMood,
    avgSleep: aggregate.avgSleep,
    avgHrv: aggregate.avgHrv,
    avgSteps: aggregate.avgSteps,
    avgEnergy: aggregate.avgEnergy,
    pillarSleep: aggregate.pillars.sleep,
    pillarMovement: aggregate.pillars.movement,
    pillarWork: aggregate.pillars.work,
    pillarMindset: aggregate.pillars.mindset,
    pillarRelationships: aggregate.pillars.relationships,
    workoutsCompleted: aggregate.workoutsCompleted,
    habitsCompletionPct: aggregate.habitsCompletionPct,
    debriefCount: aggregate.debriefCount,
    nutritionDaysLogged: aggregate.nutritionDaysLogged,
    headline: gen?.headline || null,
    valoInsight: gen?.valoInsight || null,
    narrativeJson: narrative,
    patternsSnapshot: aggregate.patternsSnapshot,
    topWin: gen?.topWin ?? aggregate.topWin,
    topStruggle: gen?.topStruggle ?? aggregate.topStruggle,
    intentionNextWeek: gen?.intentionNextWeek || null,
    isQuietWeek: aggregate.isQuietWeek,
    status: "ready" as const,
    modelUsed: MODEL,
  };

  const [row] = await db
    .insert(weeklyRecapsTable)
    .values(values)
    .onConflictDoUpdate({
      target: [weeklyRecapsTable.userId, weeklyRecapsTable.weekStart],
      set: {
        ...values,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row!;
}
