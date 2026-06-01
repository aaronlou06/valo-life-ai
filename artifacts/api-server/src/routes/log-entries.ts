import { Router, type IRouter } from "express";
import { eq, and, desc, gte } from "drizzle-orm";
import { db, logEntriesTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/log-entries/history", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const d = new Date();
  d.setDate(d.getDate() - 30);
  const since = d.toISOString().split("T")[0]!;
  const entries = await db.select().from(logEntriesTable)
    .where(and(eq(logEntriesTable.userId, userId), gte(logEntriesTable.date, since)))
    .orderBy(desc(logEntriesTable.createdAt))
    .limit(100);
  res.json(entries);
});

router.get("/log-entries", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const today = new Date().toISOString().split("T")[0]!;
  const entries = await db.select().from(logEntriesTable)
    .where(and(eq(logEntriesTable.userId, userId), eq(logEntriesTable.date, today)))
    .orderBy(desc(logEntriesTable.createdAt));
  res.json(entries);
});

router.post("/log-entries", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { type, title, subtitle, value } = req.body;
  if (!type || !title) {
    res.status(400).json({ error: "type and title are required" });
    return;
  }
  const today = new Date().toISOString().split("T")[0]!;
  const [entry] = await db.insert(logEntriesTable)
    .values({ userId, date: today, type, title, subtitle: subtitle ?? null, value: value ?? null })
    .returning();
  res.status(201).json(entry);
});

export default router;
