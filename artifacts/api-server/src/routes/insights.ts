import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import {
  db,
  insightsTable,
  insightsPatternsTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { generateDailyInsights } from "../lib/insightsEngine";

const router: IRouter = Router();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

router.get("/insights", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const today = new Date().toISOString().split("T")[0]!;

  const cached = await db
    .select()
    .from(insightsTable)
    .where(and(eq(insightsTable.userId, userId), eq(insightsTable.date, today)))
    .orderBy(desc(insightsTable.createdAt));

  if (cached.length > 0) {
    const age = Date.now() - new Date(cached[0]!.createdAt).getTime();
    if (age < CACHE_TTL_MS) {
      res.json(cached);
      return;
    }
    await db
      .delete(insightsTable)
      .where(and(eq(insightsTable.userId, userId), eq(insightsTable.date, today)));
  }

  const rows = await generateDailyInsights(userId, today);
  if (rows.length === 0) {
    res.json([]);
    return;
  }
  const saved = await db
    .insert(insightsTable)
    .values(
      rows.map((r) => ({
        userId,
        date: today,
        label: r.label,
        content: r.content,
        followUpQuestion: r.followUpQuestion ?? null,
      })),
    )
    .returning();

  res.json(saved);
});

router.post("/insights/refresh", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const today = new Date().toISOString().split("T")[0]!;

  await db
    .delete(insightsTable)
    .where(and(eq(insightsTable.userId, userId), eq(insightsTable.date, today)));

  const rows = await generateDailyInsights(userId, today);
  if (rows.length === 0) {
    res.json([]);
    return;
  }
  const saved = await db
    .insert(insightsTable)
    .values(
      rows.map((r) => ({
        userId,
        date: today,
        label: r.label,
        content: r.content,
        followUpQuestion: r.followUpQuestion ?? null,
      })),
    )
    .returning();

  res.json(saved);
});

router.get("/insights/patterns", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;

  const patterns = await db
    .select()
    .from(insightsPatternsTable)
    .where(and(eq(insightsPatternsTable.userId, userId), eq(insightsPatternsTable.isActive, true)))
    .orderBy(desc(insightsPatternsTable.discoveredAt));

  res.json(patterns);
});

export default router;
