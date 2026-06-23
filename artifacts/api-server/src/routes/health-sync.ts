import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, dailyLogsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

function today(): string {
  return new Date().toISOString().split("T")[0]!;
}

// POST /api/health/sync
// Upserts today's HealthKit metrics for the authenticated user. Called by the
// iOS BGAppRefreshTask (com.valo.healthkit.refresh) so health data syncs to
// the backend in the background without the user opening the app.
// Only fields present in the request body are written; omitted fields are left
// unchanged so a background sync never clobbers manually-entered data.
router.post("/health/sync", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const dateStr = today();

  const {
    sleepHours,
    hrv,
    restingHeartRate,
    steps,
    activeCalories,
    respiratoryRate,
    workoutType,
    workoutDuration,
    workoutEffort,
  } = req.body as Record<string, unknown>;

  // Build only the fields that were explicitly sent so we never overwrite a
  // field with null when the client simply omitted it.
  const incoming: Record<string, unknown> = {};
  if (sleepHours !== undefined) incoming.sleepHours = sleepHours;
  if (hrv !== undefined) incoming.hrv = hrv;
  if (restingHeartRate !== undefined) incoming.restingHeartRate = restingHeartRate;
  if (steps !== undefined) incoming.steps = steps;
  if (activeCalories !== undefined) incoming.activeCalories = activeCalories;
  if (respiratoryRate !== undefined) incoming.respiratoryRate = respiratoryRate;
  if (workoutType !== undefined) incoming.workoutType = workoutType;
  if (workoutDuration !== undefined) incoming.workoutDuration = workoutDuration;
  if (workoutEffort !== undefined) incoming.workoutEffort = workoutEffort;

  if (Object.keys(incoming).length === 0) {
    res.status(204).end();
    return;
  }

  // Check whether a row already exists so we can merge rather than overwrite.
  const [existing] = await db
    .select()
    .from(dailyLogsTable)
    .where(and(eq(dailyLogsTable.userId, userId), eq(dailyLogsTable.date, dateStr)));

  if (existing) {
    // Merge: only update fields that are present in this request.
    const [updated] = await db
      .update(dailyLogsTable)
      .set(incoming as any)
      .where(and(eq(dailyLogsTable.userId, userId), eq(dailyLogsTable.date, dateStr)))
      .returning();
    res.json(updated);
  } else {
    const [created] = await db
      .insert(dailyLogsTable)
      .values({ userId, date: dateStr, ...(incoming as any) })
      .returning();
    res.json(created);
  }
});

export default router;
