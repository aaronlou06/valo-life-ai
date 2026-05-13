import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, insightsTable, moodEntriesTable, dailyLogsTable, habitsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

const SEED_INSIGHTS = [
  {
    label: "Sleep & Mood",
    content: "Your sleep quality has a strong connection to how you feel the next day. On nights where you logged 7+ hours, your mood scores averaged 1.5 points higher.",
    followUpQuestion: "What helps you wind down before bed on your best nights?",
  },
  {
    label: "Movement Patterns",
    content: "You tend to log workouts earlier in the week and taper off by Thursday. Your energy and mood scores are noticeably higher on days you move.",
    followUpQuestion: "What makes it harder to stay active toward the end of the week?",
  },
  {
    label: "Habit Momentum",
    content: "Your longest habit streaks correlate with weeks where you also hit your sleep targets. Consistency in one area appears to reinforce the others.",
    followUpQuestion: "Which habit feels most like a keystone for everything else?",
  },
];

router.get("/insights", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const stored = await db.select().from(insightsTable)
    .where(eq(insightsTable.userId, userId))
    .orderBy(desc(insightsTable.createdAt))
    .limit(10);

  if (stored.length > 0) {
    res.json(stored);
    return;
  }

  const today = new Date().toISOString().split("T")[0]!;
  const seeded = await db.insert(insightsTable)
    .values(SEED_INSIGHTS.map((s) => ({ ...s, userId, date: today })))
    .returning();
  res.json(seeded);
});

export default router;
