import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, routinesTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/routines", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const rows = await db.select().from(routinesTable).where(eq(routinesTable.userId, userId));
  res.json(rows);
});

router.post("/routines", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const {
    id, name, days, scheduledTime, color, activities, isDisplayedOnCalendar,
    recurrenceType, recurrenceInterval, recurrenceEndDate, skippedDates,
  } = req.body as {
    id?: string; name?: string; days?: string; scheduledTime?: string;
    color?: string; activities?: string; isDisplayedOnCalendar?: boolean;
    recurrenceType?: string; recurrenceInterval?: number | null; recurrenceEndDate?: string | null;
    skippedDates?: string | null;
  };
  if (!id || !name) { res.status(400).json({ error: "id and name are required" }); return; }
  const [row] = await db
    .insert(routinesTable)
    .values({
      id,
      userId,
      name,
      days: days ?? "[]",
      scheduledTime: scheduledTime ?? null,
      color: color ?? "#C17B3F",
      activities: activities ?? "[]",
      isDisplayedOnCalendar: isDisplayedOnCalendar ?? true,
      recurrenceType: recurrenceType ?? "none",
      recurrenceInterval: recurrenceInterval ?? null,
      recurrenceEndDate: recurrenceEndDate ?? null,
      skippedDates: skippedDates ?? null,
    })
    .onConflictDoUpdate({
      target: routinesTable.id,
      set: {
        name,
        days: days ?? "[]",
        scheduledTime: scheduledTime ?? null,
        color: color ?? "#C17B3F",
        activities: activities ?? "[]",
        isDisplayedOnCalendar: isDisplayedOnCalendar ?? true,
        recurrenceType: recurrenceType ?? "none",
        recurrenceInterval: recurrenceInterval ?? null,
        recurrenceEndDate: recurrenceEndDate ?? null,
        skippedDates: skippedDates ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/routines/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const routineId = Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!;
  const {
    name, days, scheduledTime, color, activities, isDisplayedOnCalendar,
    recurrenceType, recurrenceInterval, recurrenceEndDate, skippedDates,
  } = req.body as {
    name?: string; days?: string; scheduledTime?: string;
    color?: string; activities?: string; isDisplayedOnCalendar?: boolean;
    recurrenceType?: string; recurrenceInterval?: number | null; recurrenceEndDate?: string | null;
    skippedDates?: string | null;
  };
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name;
  if (days !== undefined) updates.days = days;
  if (scheduledTime !== undefined) updates.scheduledTime = scheduledTime;
  if (color !== undefined) updates.color = color;
  if (activities !== undefined) updates.activities = activities;
  if (isDisplayedOnCalendar !== undefined) updates.isDisplayedOnCalendar = isDisplayedOnCalendar;
  if (recurrenceType !== undefined) updates.recurrenceType = recurrenceType;
  if (recurrenceInterval !== undefined) updates.recurrenceInterval = recurrenceInterval;
  if (recurrenceEndDate !== undefined) updates.recurrenceEndDate = recurrenceEndDate;
  if (skippedDates !== undefined) updates.skippedDates = skippedDates;

  const [row] = await db
    .update(routinesTable)
    .set(updates)
    .where(and(eq(routinesTable.id, routineId), eq(routinesTable.userId, userId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/routines/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const routineId = Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!;
  await db.delete(routinesTable).where(and(eq(routinesTable.id, routineId), eq(routinesTable.userId, userId)));
  res.sendStatus(204);
});

export default router;
