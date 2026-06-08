import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, remindersTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/reminders", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const reminders = await db
    .select()
    .from(remindersTable)
    .where(eq(remindersTable.userId, userId));
  res.json(reminders);
});

router.post("/reminders", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { type, label, scheduledTime, isActive, metadata } = req.body as {
    type: string;
    label: string;
    scheduledTime: string;
    isActive?: boolean;
    metadata?: { habitId?: number };
  };

  if (!type || !label || !scheduledTime) {
    res.status(400).json({ error: "type, label, and scheduledTime are required" });
    return;
  }

  const habitId = metadata?.habitId;

  if (type === "habit" && habitId != null) {
    const existing = await db
      .select()
      .from(remindersTable)
      .where(
        and(
          eq(remindersTable.userId, userId),
          eq(remindersTable.type, type),
        ),
      )
      .then((rows) =>
        rows.find((r) => {
          const m = r.metadata as { habitId?: number } | null;
          return m?.habitId === habitId;
        }),
      );

    if (existing) {
      const [updated] = await db
        .update(remindersTable)
        .set({
          label,
          scheduledTime,
          isActive: isActive ?? true,
          metadata: metadata ?? null,
          updatedAt: new Date(),
        })
        .where(eq(remindersTable.id, existing.id))
        .returning();
      res.json(updated);
      return;
    }
  }

  // Entity-aware upsert for event and routine reminders:
  // find by (userId, type, metadata.entityId, metadata.remindBeforeSeconds) and update if exists.
  if ((type === "event" || type === "routine") && metadata != null) {
    const entityId = String((metadata as { entityId?: unknown }).entityId ?? "");
    const remindBeforeSeconds = (metadata as { remindBeforeSeconds?: unknown }).remindBeforeSeconds;
    if (entityId) {
      const existing = await db
        .select()
        .from(remindersTable)
        .where(and(eq(remindersTable.userId, userId), eq(remindersTable.type, type)))
        .then((rows) =>
          rows.find((r) => {
            const m = r.metadata as { entityId?: string; remindBeforeSeconds?: number } | null;
            return m?.entityId === entityId && m?.remindBeforeSeconds === remindBeforeSeconds;
          }),
        );
      if (existing) {
        const [updated] = await db
          .update(remindersTable)
          .set({
            label,
            scheduledTime,
            isActive: isActive ?? true,
            metadata: metadata ?? null,
            updatedAt: new Date(),
          })
          .where(eq(remindersTable.id, existing.id))
          .returning();
        res.json(updated);
        return;
      }
    }
  }

  const [reminder] = await db
    .insert(remindersTable)
    .values({
      userId,
      type,
      label,
      scheduledTime,
      isActive: isActive ?? true,
      metadata: metadata ?? null,
    })
    .returning();
  res.json(reminder);
});

router.delete("/reminders/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId!, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db
    .delete(remindersTable)
    .where(and(eq(remindersTable.id, id), eq(remindersTable.userId, userId)));
  res.sendStatus(204);
});

export default router;
