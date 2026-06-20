import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, habitCompletionsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { recomputeAndPersistHabit } from "../lib/habitStreaks";

const router: IRouter = Router();

router.get("/habit-completions/:date", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const date = Array.isArray(req.params.date) ? req.params.date[0]! : req.params.date!;
  const rows = await db
    .select()
    .from(habitCompletionsTable)
    .where(and(eq(habitCompletionsTable.userId, userId), eq(habitCompletionsTable.completionDate, date)));
  res.json(rows);
});

router.post("/habit-completions/toggle", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { habitId, date } = req.body as { habitId?: number; date?: string };
  if (!habitId || !date) { res.status(400).json({ error: "habitId and date are required" }); return; }

  const existing = await db
    .select()
    .from(habitCompletionsTable)
    .where(
      and(
        eq(habitCompletionsTable.habitId, habitId),
        eq(habitCompletionsTable.userId, userId),
        eq(habitCompletionsTable.completionDate, date),
      ),
    );

  if (existing.length > 0) {
    const current = existing[0]!;
    const newCompleted = !current.completed;
    const [updated] = await db
      .update(habitCompletionsTable)
      .set({ completed: newCompleted })
      .where(eq(habitCompletionsTable.id, current.id))
      .returning();
    // Recompute the cached streak/completedToday from the full completion
    // history — never increment/decrement, so the cache always matches reality.
    await recomputeAndPersistHabit(userId, habitId);
    res.json(updated);
  } else {
    const [created] = await db
      .insert(habitCompletionsTable)
      .values({ habitId, userId, completionDate: date, completed: true })
      .returning();
    await recomputeAndPersistHabit(userId, habitId);
    res.status(201).json(created);
  }
});

export default router;
