import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, habitCompletionsTable, habitsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

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
    const habit = await db.select().from(habitsTable)
      .where(and(eq(habitsTable.id, habitId), eq(habitsTable.userId, userId)));
    if (habit[0]) {
      const newStreak = newCompleted ? habit[0].streak + 1 : Math.max(0, habit[0].streak - 1);
      await db.update(habitsTable).set({
        completedToday: newCompleted,
        streak: newStreak,
        lastCompletedDate: newCompleted ? date : habit[0].lastCompletedDate,
      }).where(and(eq(habitsTable.id, habitId), eq(habitsTable.userId, userId)));
    }
    res.json(updated);
  } else {
    const [created] = await db
      .insert(habitCompletionsTable)
      .values({ habitId, userId, completionDate: date, completed: true })
      .returning();
    const habit = await db.select().from(habitsTable)
      .where(and(eq(habitsTable.id, habitId), eq(habitsTable.userId, userId)));
    if (habit[0]) {
      const newStreak = habit[0].streak + 1;
      await db.update(habitsTable).set({
        completedToday: true,
        streak: newStreak,
        lastCompletedDate: date,
      }).where(and(eq(habitsTable.id, habitId), eq(habitsTable.userId, userId)));
    }
    res.status(201).json(created);
  }
});

export default router;
