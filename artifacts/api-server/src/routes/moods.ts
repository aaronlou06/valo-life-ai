import { Router, type IRouter } from "express";
import { eq, and, desc, gte } from "drizzle-orm";
import { db, moodEntriesTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/moods", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoff = sevenDaysAgo.toISOString().split("T")[0]!;
  const moods = await db.select().from(moodEntriesTable)
    .where(and(eq(moodEntriesTable.userId, userId), gte(moodEntriesTable.date, cutoff)))
    .orderBy(desc(moodEntriesTable.createdAt));
  res.json(moods);
});

router.post("/moods", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { score, note } = req.body;
  if (score == null || typeof score !== "number") {
    res.status(400).json({ error: "score is required and must be a number" });
    return;
  }
  const date = new Date().toISOString().split("T")[0]!;
  const [entry] = await db.insert(moodEntriesTable)
    .values({ userId, date, score, note: note ?? null })
    .returning();
  res.status(201).json(entry);
});

export default router;
