import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, goalsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/goals", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const goals = await db.select().from(goalsTable)
    .where(eq(goalsTable.userId, userId))
    .orderBy(desc(goalsTable.createdAt));
  res.json(goals);
});

router.post("/goals", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { title, targetDate, progressPercent, category } = req.body;
  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  const [goal] = await db.insert(goalsTable)
    .values({ userId, title, targetDate: targetDate ?? null, progressPercent: progressPercent ?? 0, category: category ?? "personal" })
    .returning();
  res.status(201).json(goal);
});

router.patch("/goals/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId!, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { title, targetDate, progressPercent, category } = req.body;
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (targetDate !== undefined) updates.targetDate = targetDate;
  if (progressPercent !== undefined) updates.progressPercent = progressPercent;
  if (category !== undefined) updates.category = category;
  const [goal] = await db.update(goalsTable)
    .set(updates)
    .where(and(eq(goalsTable.id, id), eq(goalsTable.userId, userId)))
    .returning();
  if (!goal) { res.status(404).json({ error: "Not found" }); return; }
  res.json(goal);
});

router.delete("/goals/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId!, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(goalsTable).where(and(eq(goalsTable.id, id), eq(goalsTable.userId, userId)));
  res.sendStatus(204);
});

export default router;
