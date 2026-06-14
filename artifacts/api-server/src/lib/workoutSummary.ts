import { and, desc, eq, inArray } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  db,
  exercisesTable,
  userProfilesTable,
  workoutPersonalRecordsTable,
  workoutSessionsTable,
  workoutSetLogsTable,
  workoutSummariesTable,
} from "@workspace/db";
import { logger } from "./logger";

// Epley formula — estimates 1-rep-max from a given weight × reps.
function estimateOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

interface NewPR {
  exerciseName: string;
  metricType: string;
  value: number;
}

/**
 * Completes a workout session:
 *   1. Marks it completed + records duration.
 *   2. Detects personal records across all exercises in the session.
 *   3. Marks isPersonalBest on the relevant set rows.
 *   4. Generates a short Claude summary.
 *   5. Persists the summary to workout_summaries.
 *   6. Merges key facts into the user's workout_memory for Vapi context.
 */
export async function completeWorkoutSession(
  userId: string,
  sessionId: number,
): Promise<{
  session: Record<string, unknown>;
  summary: Record<string, unknown> | null;
  prs: NewPR[];
}> {
  // ── 1. Load session ─────────────────────────────────────────────────────────
  const [session] = await db
    .select()
    .from(workoutSessionsTable)
    .where(eq(workoutSessionsTable.id, sessionId));
  if (!session) throw new Error("Session not found");

  // ── 2. All sets in this session ─────────────────────────────────────────────
  const sets = await db
    .select()
    .from(workoutSetLogsTable)
    .where(eq(workoutSetLogsTable.sessionId, sessionId))
    .orderBy(workoutSetLogsTable.loggedAt);

  // ── 3. Exercise metadata ────────────────────────────────────────────────────
  const exerciseIds = [...new Set(sets.map((s) => s.exerciseId))];
  const exercises =
    exerciseIds.length > 0
      ? await db
          .select({
            id: exercisesTable.id,
            name: exercisesTable.name,
            trackingType: exercisesTable.trackingType,
          })
          .from(exercisesTable)
          .where(inArray(exercisesTable.id, exerciseIds))
      : [];
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));

  // ── 4. Mark session completed ────────────────────────────────────────────────
  const now = new Date();
  const rawDuration = session.startedAt
    ? Math.round((now.getTime() - new Date(session.startedAt).getTime()) / 1000)
    : null;

  const [updatedSession] = await db
    .update(workoutSessionsTable)
    .set({
      status: "completed",
      completedAt: now,
      durationSec: session.durationSec ?? rawDuration,
    })
    .where(eq(workoutSessionsTable.id, sessionId))
    .returning();
  if (!updatedSession) throw new Error("Session update failed");

  const finalDuration = updatedSession.durationSec ?? rawDuration ?? 0;

  // ── 5. PR detection ──────────────────────────────────────────────────────────
  const newPRs: NewPR[] = [];

  for (const exId of exerciseIds) {
    const exercise = exerciseById.get(exId);
    if (!exercise) continue;

    const workingSets = sets.filter((s) => s.exerciseId === exId && !s.isWarmup);
    if (workingSets.length === 0) continue;

    // — Weight × reps → estimated 1RM ————————————————————————————————————————
    const weightRepsSets = workingSets.filter((s) => s.weightKg && s.reps);
    if (weightRepsSets.length > 0) {
      const best1RMSet = weightRepsSets.reduce((best, s) =>
        estimateOneRepMax(s.weightKg!, s.reps!) >
        estimateOneRepMax(best.weightKg!, best.reps!)
          ? s
          : best,
      );
      const best1RM = estimateOneRepMax(best1RMSet.weightKg!, best1RMSet.reps!);

      const [current] = await db
        .select({ id: workoutPersonalRecordsTable.id, value: workoutPersonalRecordsTable.value })
        .from(workoutPersonalRecordsTable)
        .where(
          and(
            eq(workoutPersonalRecordsTable.userId, userId),
            eq(workoutPersonalRecordsTable.exerciseId, exId),
            eq(workoutPersonalRecordsTable.metricType, "1rm_kg"),
          ),
        );

      if (!current) {
        await db.insert(workoutPersonalRecordsTable).values({
          userId,
          exerciseId: exId,
          metricType: "1rm_kg",
          value: best1RM,
          weightKg: best1RMSet.weightKg,
          reps: best1RMSet.reps,
          estimatedOneRepMax: best1RM,
          sessionId,
          achievedAt: now,
        });
        newPRs.push({ exerciseName: exercise.name, metricType: "1rm_kg", value: best1RM });
      } else if (best1RM > current.value) {
        await db
          .update(workoutPersonalRecordsTable)
          .set({
            value: best1RM,
            weightKg: best1RMSet.weightKg,
            reps: best1RMSet.reps,
            estimatedOneRepMax: best1RM,
            sessionId,
            achievedAt: now,
          })
          .where(eq(workoutPersonalRecordsTable.id, current.id));
        newPRs.push({ exerciseName: exercise.name, metricType: "1rm_kg", value: best1RM });
      }

      // Mark the best set row
      if (!current || best1RM > (current.value ?? 0)) {
        await db
          .update(workoutSetLogsTable)
          .set({ isPersonalBest: true })
          .where(eq(workoutSetLogsTable.id, best1RMSet.id));
      }
    }

    // — Duration (timed exercises) ───────────────────────────────────────────
    if (exercise.trackingType === "duration") {
      const durationSets = workingSets.filter((s) => s.durationSec && s.durationSec > 0);
      if (durationSets.length > 0) {
        const bestDuration = Math.max(...durationSets.map((s) => s.durationSec!));
        const [current] = await db
          .select({ id: workoutPersonalRecordsTable.id, value: workoutPersonalRecordsTable.value })
          .from(workoutPersonalRecordsTable)
          .where(
            and(
              eq(workoutPersonalRecordsTable.userId, userId),
              eq(workoutPersonalRecordsTable.exerciseId, exId),
              eq(workoutPersonalRecordsTable.metricType, "duration_sec"),
            ),
          );

        if (!current) {
          await db.insert(workoutPersonalRecordsTable).values({
            userId, exerciseId: exId, metricType: "duration_sec",
            value: bestDuration, durationSec: bestDuration, sessionId, achievedAt: now,
          });
          newPRs.push({ exerciseName: exercise.name, metricType: "duration_sec", value: bestDuration });
        } else if (bestDuration > current.value) {
          await db.update(workoutPersonalRecordsTable)
            .set({ value: bestDuration, durationSec: bestDuration, sessionId, achievedAt: now })
            .where(eq(workoutPersonalRecordsTable.id, current.id));
          newPRs.push({ exerciseName: exercise.name, metricType: "duration_sec", value: bestDuration });
        }
      }
    }

    // — Distance (cardio) ────────────────────────────────────────────────────
    if (
      exercise.trackingType === "distance_duration" ||
      exercise.trackingType === "cardio_machine"
    ) {
      const distanceSets = workingSets.filter((s) => s.distanceM && s.distanceM > 0);
      if (distanceSets.length > 0) {
        const bestDistance = Math.max(...distanceSets.map((s) => s.distanceM!));
        const [current] = await db
          .select({ id: workoutPersonalRecordsTable.id, value: workoutPersonalRecordsTable.value })
          .from(workoutPersonalRecordsTable)
          .where(
            and(
              eq(workoutPersonalRecordsTable.userId, userId),
              eq(workoutPersonalRecordsTable.exerciseId, exId),
              eq(workoutPersonalRecordsTable.metricType, "distance_m"),
            ),
          );

        if (!current) {
          await db.insert(workoutPersonalRecordsTable).values({
            userId, exerciseId: exId, metricType: "distance_m",
            value: bestDistance, distanceM: bestDistance, sessionId, achievedAt: now,
          });
          newPRs.push({ exerciseName: exercise.name, metricType: "distance_m", value: bestDistance });
        } else if (bestDistance > current.value) {
          await db.update(workoutPersonalRecordsTable)
            .set({ value: bestDistance, distanceM: bestDistance, sessionId, achievedAt: now })
            .where(eq(workoutPersonalRecordsTable.id, current.id));
          newPRs.push({ exerciseName: exercise.name, metricType: "distance_m", value: bestDistance });
        }
      }
    }
  }

  // ── 6. Build summary context ─────────────────────────────────────────────────
  const workingSets = sets.filter((s) => !s.isWarmup);
  const totalTonnageKg = workingSets.reduce((acc, s) => {
    if (s.weightKg && s.reps) return acc + s.weightKg * s.reps;
    return acc;
  }, 0);

  const exerciseSummaryLines = exercises.map((ex) => {
    const exSets = workingSets.filter((s) => s.exerciseId === ex.id);
    if (exSets.length === 0) return null;
    // Find top set by e1RM
    const topSet = exSets.reduce(
      (best, s) => {
        if (!s.weightKg || !s.reps) return best;
        if (!best) return s;
        return estimateOneRepMax(s.weightKg, s.reps) > estimateOneRepMax(best.weightKg!, best.reps!)
          ? s
          : best;
      },
      null as (typeof exSets)[0] | null,
    );
    const topStr =
      topSet?.weightKg && topSet?.reps ? `, top set ${topSet.weightKg}kg × ${topSet.reps}` : "";
    return `${ex.name}: ${exSets.length} set${exSets.length !== 1 ? "s" : ""}${topStr}`;
  }).filter(Boolean);

  const prLines = newPRs.map((pr) => {
    if (pr.metricType === "1rm_kg") return `${pr.exerciseName} (e1RM ${pr.value}kg)`;
    if (pr.metricType === "duration_sec") return `${pr.exerciseName} (${pr.value}s)`;
    if (pr.metricType === "distance_m")
      return `${pr.exerciseName} (${(pr.value / 1000).toFixed(2)}km)`;
    return pr.exerciseName;
  });

  const contextBlock = [
    `Workout: ${updatedSession.name}`,
    `Date: ${updatedSession.date}`,
    `Duration: ${Math.round(finalDuration / 60)} min`,
    `Total working sets: ${workingSets.length}`,
    totalTonnageKg > 0 ? `Total tonnage: ${Math.round(totalTonnageKg)}kg` : null,
    prLines.length > 0 ? `New PRs: ${prLines.join(", ")}` : null,
    exerciseSummaryLines.length > 0 ? `Exercises:\n${exerciseSummaryLines.join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  // ── 7. Generate Claude summary ───────────────────────────────────────────────
  let summaryText =
    `Completed ${updatedSession.name}: ${workingSets.length} sets` +
    (exercises.length > 0 ? ` across ${exercises.length} exercise${exercises.length !== 1 ? "s" : ""}` : "") +
    ".";

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `Write a 2-3 sentence workout summary in second person ("You"). Be specific about numbers. Mention any PRs. Keep it warm but factual — no filler phrases like "great job".

${contextBlock}`,
        },
      ],
    });
    const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : null;
    if (text) summaryText = text;
  } catch (err) {
    logger.error({ err, userId, sessionId }, "workoutSummary: Claude call failed, using fallback");
  }

  const keyFacts: Record<string, unknown> = {
    date: updatedSession.date,
    durationMin: Math.round(finalDuration / 60),
    totalSets: workingSets.length,
    totalTonnageKg: Math.round(totalTonnageKg),
    exercises: exercises.map((e) => e.name),
    newPRs: prLines,
  };

  // ── 8. Persist summary ───────────────────────────────────────────────────────
  const existing = await db
    .select({ id: workoutSummariesTable.id })
    .from(workoutSummariesTable)
    .where(eq(workoutSummariesTable.sessionId, sessionId));

  let summary: Record<string, unknown> | null = null;
  if (existing.length > 0) {
    const [row] = await db
      .update(workoutSummariesTable)
      .set({ summaryText, keyFacts, updatedAt: new Date() })
      .where(eq(workoutSummariesTable.sessionId, sessionId))
      .returning();
    summary = row as unknown as Record<string, unknown>;
  } else {
    const [row] = await db
      .insert(workoutSummariesTable)
      .values({ userId, sessionId, summaryText, keyFacts })
      .returning();
    summary = row as unknown as Record<string, unknown>;
  }

  // ── 9. Update workout memory on user profile ─────────────────────────────────
  await mergeWorkoutMemory(userId, keyFacts, prLines);

  return {
    session: updatedSession as unknown as Record<string, unknown>,
    summary,
    prs: newPRs,
  };
}

async function mergeWorkoutMemory(
  userId: string,
  keyFacts: Record<string, unknown>,
  prLines: string[],
): Promise<void> {
  const date = String(keyFacts.date ?? "");
  const durationMin = Number(keyFacts.durationMin ?? 0);
  const totalSets = Number(keyFacts.totalSets ?? 0);
  const exNames = ((keyFacts.exercises as string[]) ?? []).slice(0, 3).join(", ");
  const prStr = prLines.length > 0 ? `, PR: ${prLines.join(", ")}` : "";

  const fact = `${date}: ${exNames}${exNames ? ", " : ""}${durationMin}min, ${totalSets} sets${prStr}`;

  const [profile] = await db
    .select({ workoutMemory: userProfilesTable.workoutMemory })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId));

  let memory: string[] = [];
  if (profile?.workoutMemory) {
    try {
      memory = JSON.parse(profile.workoutMemory) as string[];
    } catch {
      memory = [];
    }
  }

  memory.unshift(fact);
  if (memory.length > 8) memory = memory.slice(0, 8);

  try {
    await db
      .update(userProfilesTable)
      .set({ workoutMemory: JSON.stringify(memory) })
      .where(eq(userProfilesTable.userId, userId));
  } catch (err) {
    logger.error({ err, userId }, "mergeWorkoutMemory: DB write failed");
  }
}
