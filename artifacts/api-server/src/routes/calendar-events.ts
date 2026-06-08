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
  const { title, date, type, notes } = req.body;
  if (!title || !date) {
    res.status(400).json({ error: "title and date are required" });
    return;
  }
  const [event] = await db
    .insert(calendarEventsTable)
    .values({ userId, title, date, type: type ?? null, notes: notes ?? null })
    .returning();
  res.status(201).json(event);
});

router.patch("/calendar-events/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId!, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { title, date, type, notes } = req.body as { title?: string; date?: string; type?: string | null; notes?: string | null };
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (title !== undefined) updateData.title = title;
  if (date !== undefined) updateData.date = date;
  if (type !== undefined) updateData.type = type;
  if (notes !== undefined) updateData.notes = notes;
  const [updated] = await db
    .update(calendarEventsTable)
    .set(updateData)
    .where(and(eq(calendarEventsTable.id, id), eq(calendarEventsTable.userId, userId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
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
