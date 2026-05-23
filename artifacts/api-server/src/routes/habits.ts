import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, habitsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/habits", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const habits = await db.select().from(habitsTable)
    .where(eq(habitsTable.userId, userId))
    .orderBy(desc(habitsTable.createdAt));
  res.json(habits);
});

router.post("/habits", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { name, category, routineId } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const [habit] = await db.insert(habitsTable)
    .values({ userId, name, streak: 0, completedToday: false, category: category ?? "general", routineId: routineId ?? null })
    .returning();
  res.status(201).json(habit);
});

router.patch("/habits/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId!, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { name, completedToday, streak, category, routineId } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (completedToday !== undefined) updates.completedToday = completedToday;
  if (streak !== undefined) updates.streak = streak;
  if (category !== undefined) updates.category = category;
  if (routineId !== undefined) updates.routineId = routineId;
  if (completedToday === true) {
    updates.lastCompletedDate = new Date().toISOString().split("T")[0]!;
  }
  const [habit] = await db.update(habitsTable)
    .set(updates)
    .where(and(eq(habitsTable.id, id), eq(habitsTable.userId, userId)))
    .returning();
  if (!habit) { res.status(404).json({ error: "Not found" }); return; }
  res.json(habit);
});

router.delete("/habits/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId!, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(habitsTable).where(and(eq(habitsTable.id, id), eq(habitsTable.userId, userId)));
  res.sendStatus(204);
});

export default router;
