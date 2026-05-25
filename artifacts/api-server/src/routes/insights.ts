import { Router, type IRouter } from "express";
import { eq, desc, and, gte } from "drizzle-orm";
import {
  db,
  insightsTable,
  moodEntriesTable,
  dailyLogsTable,
  habitsTable,
  goalsTable,
} from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";

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

type InsightRow = { label: string; content: string; followUpQuestion?: string | null };

function getThirtyDaysAgo(): string {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!;
}

async function generateAndSaveInsights(userId: string, today: string): Promise<InsightRow[]> {
  const thirtyDaysAgo = getThirtyDaysAgo();

  const [logs, moods, habits, goals] = await Promise.all([
    db.select().from(dailyLogsTable)
      .where(and(eq(dailyLogsTable.userId, userId), gte(dailyLogsTable.date, thirtyDaysAgo)))
      .orderBy(desc(dailyLogsTable.date))
      .limit(30),
    db.select().from(moodEntriesTable)
      .where(and(eq(moodEntriesTable.userId, userId), gte(moodEntriesTable.date, thirtyDaysAgo)))
      .orderBy(desc(moodEntriesTable.date))
      .limit(30),
    db.select().from(habitsTable)
      .where(eq(habitsTable.userId, userId)),
    db.select().from(goalsTable)
      .where(eq(goalsTable.userId, userId)),
  ]);

  if (logs.length < 3) {
    const seeded = await db.insert(insightsTable)
      .values(SEED_INSIGHTS.map((s) => ({ ...s, userId, date: today })))
      .returning();
    return seeded;
  }

  const dataSummary = `
User's last 30 days of data:

Daily logs: ${JSON.stringify(logs.slice(0, 30))}
Mood entries: ${JSON.stringify(moods.slice(0, 30))}
Habits: ${JSON.stringify(habits)}
Goals: ${JSON.stringify(goals)}
`;

  const prompt = `You are Valo's insight engine. Analyze this user's health and lifestyle data and generate 3-5 meaningful, personalized insights.

${dataSummary}

For each insight return a JSON array with objects containing:
- label: short category name (e.g. "Sleep Pattern", "Habit Streak", "Mood Trend", "Goal Progress", "Recovery")
- content: 2-3 sentences describing a real pattern you found in their data. Be specific with numbers when available. If data is sparse, note what you'd expect to see with more data.
- followUpQuestion: one thoughtful question Valo could ask in a check-in related to this insight

Return only valid JSON array, no markdown.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    const block = message.content[0];
    if (!block || block.type !== "text") throw new Error("No text block in response");

    const parsed = JSON.parse(block.text.trim()) as InsightRow[];
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Empty or invalid JSON");

    const saved = await db.insert(insightsTable)
      .values(parsed.map((ins) => ({
        userId,
        date: today,
        label: String(ins.label),
        content: String(ins.content),
        followUpQuestion: ins.followUpQuestion ? String(ins.followUpQuestion) : null,
      })))
      .returning();
    return saved;
  } catch (err) {
    logger.error({ err }, "Claude insight generation failed — falling back to seed insights");
    const seeded = await db.insert(insightsTable)
      .values(SEED_INSIGHTS.map((s) => ({ ...s, userId, date: today })))
      .returning();
    return seeded;
  }
}

router.get("/insights", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const today = new Date().toISOString().split("T")[0]!;

  const todaysInsights = await db.select().from(insightsTable)
    .where(and(eq(insightsTable.userId, userId), eq(insightsTable.date, today)))
    .orderBy(desc(insightsTable.createdAt));

  if (todaysInsights.length > 0) {
    res.json(todaysInsights);
    return;
  }

  const insights = await generateAndSaveInsights(userId, today);
  res.json(insights);
});

router.post("/insights/refresh", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const today = new Date().toISOString().split("T")[0]!;

  await db.delete(insightsTable)
    .where(and(eq(insightsTable.userId, userId), eq(insightsTable.date, today)));

  const insights = await generateAndSaveInsights(userId, today);
  res.json(insights);
});

export default router;
