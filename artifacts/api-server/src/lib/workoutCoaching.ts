import { and, desc, eq } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  db,
  exercisesTable,
  workoutPersonalRecordsTable,
  workoutSessionsTable,
  workoutSetLogsTable,
} from "@workspace/db";
import { logger } from "./logger";

// Formats a set for the Claude prompt context.
function fmtSet(s: {
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null;
  distanceM: number | null;
  rpe: number | null;
}): string {
  const parts: string[] = [];
  if (s.weightKg) parts.push(`${s.weightKg}kg`);
  if (s.reps) parts.push(`${s.reps} reps`);
  if (s.durationSec) parts.push(`${s.durationSec}s`);
  if (s.distanceM) parts.push(`${(s.distanceM / 1000).toFixed(2)}km`);
  if (s.rpe) parts.push(`RPE ${s.rpe}`);
  return parts.join(" × ") || "untracked set";
}

/**
 * Generates a one-off contextual coaching hint for the current workout session.
 *
 * Returns a 1-2 sentence string when there's something genuinely useful to say,
 * or null when there isn't — so the caller can decide whether to surface it.
 * The caller should rate-limit how often this is called (e.g. once per 3 sets
 * logged) to avoid spamming Claude.
 */
export async function generateWorkoutCoaching(
  userId: string,
  sessionId: number,
): Promise<string | null> {
  // 1. Current session sets — most recent first
  const currentSets = await db
    .select({
      exerciseId: workoutSetLogsTable.exerciseId,
      weightKg: workoutSetLogsTable.weightKg,
      reps: workoutSetLogsTable.reps,
      durationSec: workoutSetLogsTable.durationSec,
      distanceM: workoutSetLogsTable.distanceM,
      rpe: workoutSetLogsTable.rpe,
      isWarmup: workoutSetLogsTable.isWarmup,
      loggedAt: workoutSetLogsTable.loggedAt,
    })
    .from(workoutSetLogsTable)
    .where(eq(workoutSetLogsTable.sessionId, sessionId))
    .orderBy(desc(workoutSetLogsTable.loggedAt))
    .limit(30);

  if (currentSets.length === 0) return null;

  // Focus on the exercise the user is currently working
  const lastExerciseId = currentSets[0]!.exerciseId;
  const currentExerciseSets = currentSets
    .filter((s) => s.exerciseId === lastExerciseId && !s.isWarmup)
    .slice(0, 6);

  // 2. Exercise metadata
  const [exercise] = await db
    .select({ name: exercisesTable.name, trackingType: exercisesTable.trackingType })
    .from(exercisesTable)
    .where(eq(exercisesTable.id, lastExerciseId));
  if (!exercise) return null;

  // 3. Historical completed sets for this exercise (≤ last 25)
  const history = await db
    .select({
      weightKg: workoutSetLogsTable.weightKg,
      reps: workoutSetLogsTable.reps,
      durationSec: workoutSetLogsTable.durationSec,
      distanceM: workoutSetLogsTable.distanceM,
      rpe: workoutSetLogsTable.rpe,
      isPersonalBest: workoutSetLogsTable.isPersonalBest,
      isWarmup: workoutSetLogsTable.isWarmup,
      sessionDate: workoutSessionsTable.date,
    })
    .from(workoutSetLogsTable)
    .innerJoin(
      workoutSessionsTable,
      eq(workoutSetLogsTable.sessionId, workoutSessionsTable.id),
    )
    .where(
      and(
        eq(workoutSetLogsTable.exerciseId, lastExerciseId),
        eq(workoutSessionsTable.userId, userId),
        eq(workoutSessionsTable.status, "completed"),
      ),
    )
    .orderBy(desc(workoutSetLogsTable.loggedAt))
    .limit(25);

  // 4. Personal records for this exercise
  const prs = await db
    .select({
      metricType: workoutPersonalRecordsTable.metricType,
      value: workoutPersonalRecordsTable.value,
      weightKg: workoutPersonalRecordsTable.weightKg,
      reps: workoutPersonalRecordsTable.reps,
    })
    .from(workoutPersonalRecordsTable)
    .where(
      and(
        eq(workoutPersonalRecordsTable.userId, userId),
        eq(workoutPersonalRecordsTable.exerciseId, lastExerciseId),
      ),
    );

  // 5. Build concise context strings for the prompt
  const currentSetsSummary = currentExerciseSets.length
    ? currentExerciseSets.map(fmtSet).join(", ")
    : "no working sets logged yet";

  const historySummary = history
    .filter((s) => !s.isWarmup)
    .slice(0, 15)
    .map((s) => `${s.sessionDate}: ${fmtSet(s)}${s.isPersonalBest ? " (PR)" : ""}`)
    .join("\n");

  const prSummary = prs.length
    ? prs
        .map((pr) => {
          if (pr.metricType === "1rm_kg") {
            return `e1RM: ${pr.value}kg${pr.weightKg && pr.reps ? ` (${pr.weightKg}kg × ${pr.reps})` : ""}`;
          }
          if (pr.metricType === "duration_sec") return `Best duration: ${pr.value}s`;
          if (pr.metricType === "distance_m")
            return `Best distance: ${(pr.value / 1000).toFixed(2)}km`;
          return `${pr.metricType}: ${pr.value}`;
        })
        .join(", ")
    : "no PRs yet";

  const prompt = `You are a concise, encouraging personal trainer. The user is mid-workout.

Exercise: ${exercise.name}
Current sets this session (newest first): ${currentSetsSummary}
Personal records: ${prSummary}
Recent history (newest first):
${historySummary || "No previous sessions"}

Provide ONE brief coaching observation (max 2 sentences). Only comment if you have something genuinely useful — for example: they are close to a PR, their RPE trend suggests fatigue, they are doing significantly more or less volume than usual, or their last set shows a form cue worth noting. Be specific about the numbers when relevant. If there is nothing genuinely useful to say, respond with exactly the word: null`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 150,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : null;
    if (!text || text.toLowerCase() === "null") return null;
    return text;
  } catch (err) {
    logger.error({ err, userId, sessionId }, "workoutCoaching: Claude call failed");
    return null;
  }
}
