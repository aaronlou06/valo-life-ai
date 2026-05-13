import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, dailyLogsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

function today(): string {
  return new Date().toISOString().split("T")[0]!;
}

router.get("/daily-logs/today", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const [log] = await db.select().from(dailyLogsTable).where(
    and(eq(dailyLogsTable.userId, userId), eq(dailyLogsTable.date, today()))
  );
  res.json(log ?? null);
});

router.post("/daily-logs", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const date = today();
  const { sleepHours, hrv, restingHeartRate, steps, workoutType, workoutDuration, workoutEffort } = req.body;
  const updates = { sleepHours: sleepHours ?? null, hrv: hrv ?? null, restingHeartRate: restingHeartRate ?? null, steps: steps ?? null, workoutType: workoutType ?? null, workoutDuration: workoutDuration ?? null, workoutEffort: workoutEffort ?? null };

  const [existing] = await db.select().from(dailyLogsTable).where(
    and(eq(dailyLogsTable.userId, userId), eq(dailyLogsTable.date, date))
  );

  if (existing) {
    const [updated] = await db.update(dailyLogsTable)
      .set(updates)
      .where(and(eq(dailyLogsTable.userId, userId), eq(dailyLogsTable.date, date)))
      .returning();
    res.json(updated);
  } else {
    const [created] = await db.insert(dailyLogsTable)
      .values({ userId, date, ...updates })
      .returning();
    res.json(created);
  }
});

export default router;
