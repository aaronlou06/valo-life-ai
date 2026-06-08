import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, calendarEventsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/calendar-events", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const events = await db
    .select()
    .from(calendarEventsTable)
    .where(eq(calendarEventsTable.userId, userId))
    .orderBy(desc(calendarEventsTable.date));
  res.json(events);
});

router.post("/calendar-events", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { title, date, type, notes, recurrenceType, recurrenceInterval, recurrenceEndDate } = req.body as {
    title?: string; date?: string; type?: string | null; notes?: string | null;
    recurrenceType?: string; recurrenceInterval?: number | null; recurrenceEndDate?: string | null;
  };
  if (!title || !date) {
    res.status(400).json({ error: "title and date are required" });
    return;
  }
  const [event] = await db
    .insert(calendarEventsTable)
    .values({
      userId,
      title,
      date,
      type: type ?? null,
      notes: notes ?? null,
      recurrenceType: recurrenceType ?? "none",
      recurrenceInterval: recurrenceInterval ?? null,
      recurrenceEndDate: recurrenceEndDate ?? null,
    })
    .returning();
  res.status(201).json(event);
});

router.patch("/calendar-events/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId!, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { title, date, type, notes, recurrenceType, recurrenceInterval, recurrenceEndDate, deletedOccurrences } = req.body as {
    title?: string; date?: string; type?: string | null; notes?: string | null;
    recurrenceType?: string; recurrenceInterval?: number | null;
    recurrenceEndDate?: string | null; deletedOccurrences?: string | null;
  };

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (date !== undefined) updates.date = date;
  if (type !== undefined) updates.type = type;
  if (notes !== undefined) updates.notes = notes;
  if (recurrenceType !== undefined) updates.recurrenceType = recurrenceType;
  if (recurrenceInterval !== undefined) updates.recurrenceInterval = recurrenceInterval;
  if (recurrenceEndDate !== undefined) updates.recurrenceEndDate = recurrenceEndDate;
  if (deletedOccurrences !== undefined) updates.deletedOccurrences = deletedOccurrences;

  const [row] = await db
    .update(calendarEventsTable)
    .set(updates)
    .where(and(eq(calendarEventsTable.id, id), eq(calendarEventsTable.userId, userId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/calendar-events/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId!, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db
    .delete(calendarEventsTable)
    .where(and(eq(calendarEventsTable.id, id), eq(calendarEventsTable.userId, userId)));
  res.sendStatus(204);
});

export default router;
