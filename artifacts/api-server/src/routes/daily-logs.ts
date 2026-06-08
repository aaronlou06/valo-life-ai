import { Router, type IRouter } from "express";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { db, dailyLogsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function today(): string {
  return new Date().toISOString().split("T")[0]!;
}

router.get("/daily-logs/history", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;

  const rawStart = req.query["startDate"];
  const rawEnd = req.query["endDate"];

  const endDate =
    typeof rawEnd === "string" && DATE_RE.test(rawEnd) ? rawEnd : today();

  let startDate: string;
  if (typeof rawStart === "string" && DATE_RE.test(rawStart)) {
    startDate = rawStart;
  } else {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    startDate = d.toISOString().split("T")[0]!;
  }

  const logs = await db.select().from(dailyLogsTable)
    .where(
      and(
        eq(dailyLogsTable.userId, userId),
        gte(dailyLogsTable.date, startDate),
        lte(dailyLogsTable.date, endDate),
      )
    )
    .orderBy(desc(dailyLogsTable.date));

  res.json(logs);
});

router.get("/daily-logs/today", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const [log] = await db.select().from(dailyLogsTable).where(
    and(eq(dailyLogsTable.userId, userId), eq(dailyLogsTable.date, today()))
  );
  res.json(log ?? null);
});

router.post("/daily-logs", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const rawDate = req.body.date;
  const date =
    typeof rawDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
      ? rawDate
      : today();
  const { sleepHours, hrv, restingHeartRate, steps, activeCalories, respiratoryRate, workoutType, workoutDuration, workoutEffort } = req.body;
  const updates = { sleepHours: sleepHours ?? null, hrv: hrv ?? null, restingHeartRate: restingHeartRate ?? null, steps: steps ?? null, activeCalories: activeCalories ?? null, respiratoryRate: respiratoryRate ?? null, workoutType: workoutType ?? null, workoutDuration: workoutDuration ?? null, workoutEffort: workoutEffort ?? null };

  const [result] = await db.insert(dailyLogsTable)
    .values({ userId, date, ...updates })
    .onConflictDoUpdate({
      target: [dailyLogsTable.userId, dailyLogsTable.date],
      set: updates,
    })
    .returning();
  res.json(result);
});

export default router;
