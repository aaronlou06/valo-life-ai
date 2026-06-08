import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, personalDatesTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/personal-dates", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const rows = await db
    .select()
    .from(personalDatesTable)
    .where(eq(personalDatesTable.userId, userId));
  res.json(rows);
});

router.post("/personal-dates", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { name, month, day, label } = req.body as {
    name: string;
    month: number;
    day: number;
    label?: string | null;
  };

  if (!name || !month || !day) {
    res.status(400).json({ error: "name, month, and day are required" });
    return;
  }
  if (month < 1 || month > 12) {
    res.status(400).json({ error: "month must be 1–12" });
    return;
  }
  if (day < 1 || day > 31) {
    res.status(400).json({ error: "day must be 1–31" });
    return;
  }

  const [created] = await db
    .insert(personalDatesTable)
    .values({ userId, name, month, day, label: label ?? null })
    .returning();
  res.status(201).json(created);
});

router.patch("/personal-dates/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId!, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const { name, month, day, label } = req.body as {
    name?: string;
    month?: number;
    day?: number;
    label?: string | null;
  };

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updateData.name = name;
  if (month !== undefined) updateData.month = month;
  if (day !== undefined) updateData.day = day;
  if (label !== undefined) updateData.label = label;

  const [updated] = await db
    .update(personalDatesTable)
    .set(updateData)
    .where(and(eq(personalDatesTable.id, id), eq(personalDatesTable.userId, userId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(updated);
});

router.delete("/personal-dates/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId!, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db
    .delete(personalDatesTable)
    .where(and(eq(personalDatesTable.id, id), eq(personalDatesTable.userId, userId)));
  res.sendStatus(204);
});

export default router;
