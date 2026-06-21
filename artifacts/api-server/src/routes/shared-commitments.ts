import { Router, type IRouter } from "express";
import { and, eq, or, desc, inArray } from "drizzle-orm";
import {
  db,
  sharedCommitmentsTable,
  commitmentParticipantsTable,
  buddyRelationshipsTable,
  habitsTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { getDisplayName } from "../lib/accountability";

const router: IRouter = Router();

const METRIC_TYPES = new Set(["binary", "count", "streak"]);
const CADENCES = new Set(["daily", "weekly", "custom"]);
const SHARE_SCOPES = new Set(["streak_only", "summary", "full"]);

// POST /shared-commitments — create (habit-backed only in Stage 0).
router.post("/shared-commitments", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { title, description, sourceType, sourceId, metricType, cadence, cadenceDaysPerWeek } =
    req.body as {
      title?: string;
      description?: string | null;
      sourceType?: string;
      sourceId?: number | null;
      metricType?: string;
      cadence?: string;
      cadenceDaysPerWeek?: number | null;
    };

  if (!title || !title.trim()) {
    res.status(400).json({ error: "A title is required" });
    return;
  }
  if (sourceType !== "habit") {
    res.status(400).json({ error: "Only habit-backed commitments are supported right now" });
    return;
  }
  if (!metricType || !METRIC_TYPES.has(metricType)) {
    res.status(400).json({ error: "Invalid metricType" });
    return;
  }
  if (!cadence || !CADENCES.has(cadence)) {
    res.status(400).json({ error: "Invalid cadence" });
    return;
  }
  if (sourceId == null) {
    res.status(400).json({ error: "A habit must be selected" });
    return;
  }

  // The source habit must belong to the authed user.
  const [habit] = await db
    .select({ id: habitsTable.id })
    .from(habitsTable)
    .where(and(eq(habitsTable.id, sourceId), eq(habitsTable.userId, userId)))
    .limit(1);
  if (!habit) {
    res.status(400).json({ error: "That habit was not found" });
    return;
  }

  const [created] = await db
    .insert(sharedCommitmentsTable)
    .values({
      userId,
      title: title.trim(),
      description: description ?? null,
      sourceType,
      sourceId,
      metricType,
      cadence,
      cadenceDaysPerWeek: cadence === "weekly" ? cadenceDaysPerWeek ?? null : null,
    })
    .returning();

  res.status(201).json(created);
});

// GET /shared-commitments — my commitments with their participant summary.
router.get("/shared-commitments", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const commitments = await db
    .select()
    .from(sharedCommitmentsTable)
    .where(eq(sharedCommitmentsTable.userId, userId))
    .orderBy(desc(sharedCommitmentsTable.createdAt));

  if (commitments.length === 0) {
    res.json([]);
    return;
  }

  const commitmentIds = commitments.map((c) => c.id);
  const parts = await db
    .select({
      participant: commitmentParticipantsTable,
      rel: buddyRelationshipsTable,
    })
    .from(commitmentParticipantsTable)
    .leftJoin(
      buddyRelationshipsTable,
      eq(commitmentParticipantsTable.buddyRelationshipId, buddyRelationshipsTable.id),
    )
    .where(
      and(
        eq(commitmentParticipantsTable.isActive, true),
        inArray(commitmentParticipantsTable.commitmentId, commitmentIds),
      ),
    );

  // Resolve each participant's display name (the other party in the relationship),
  // caching lookups so a buddy on multiple commitments is fetched once.
  const nameCache = new Map<string, string | null>();
  const resolveName = async (id: string): Promise<string | null> => {
    if (nameCache.has(id)) return nameCache.get(id)!;
    const name = await getDisplayName(id);
    nameCache.set(id, name);
    return name;
  };

  const byCommitment = new Map<number, Array<Record<string, unknown>>>();
  for (const { participant: p, rel } of parts) {
    let displayName: string | null = null;
    if (rel) {
      const otherId = rel.inviterId === userId ? rel.inviteeId : rel.inviterId;
      if (otherId) displayName = await resolveName(otherId);
    }
    const list = byCommitment.get(p.commitmentId) ?? [];
    list.push({
      participantId: p.id,
      participantType: p.participantType,
      shareScope: p.shareScope,
      buddyRelationshipId: p.buddyRelationshipId,
      displayName,
    });
    byCommitment.set(p.commitmentId, list);
  }

  res.json(
    commitments.map((c) => ({ ...c, participants: byCommitment.get(c.id) ?? [] })),
  );
});

// POST /shared-commitments/:id/participants — share with an active buddy.
router.post("/shared-commitments/:id/participants", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const id = parseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { buddyRelationshipId, shareScope } = req.body as {
    buddyRelationshipId?: number;
    shareScope?: string;
  };
  if (buddyRelationshipId == null) {
    res.status(400).json({ error: "buddyRelationshipId is required" });
    return;
  }
  if (!shareScope || !SHARE_SCOPES.has(shareScope)) {
    res.status(400).json({ error: "Invalid shareScope" });
    return;
  }

  // Commitment must belong to the authed user.
  const [commitment] = await db
    .select({ id: sharedCommitmentsTable.id })
    .from(sharedCommitmentsTable)
    .where(and(eq(sharedCommitmentsTable.id, id), eq(sharedCommitmentsTable.userId, userId)))
    .limit(1);
  if (!commitment) {
    res.status(404).json({ error: "Commitment not found" });
    return;
  }

  // Relationship must be active and involve the authed user.
  const [rel] = await db
    .select({ id: buddyRelationshipsTable.id })
    .from(buddyRelationshipsTable)
    .where(
      and(
        eq(buddyRelationshipsTable.id, buddyRelationshipId),
        eq(buddyRelationshipsTable.status, "active"),
        or(
          eq(buddyRelationshipsTable.inviterId, userId),
          eq(buddyRelationshipsTable.inviteeId, userId),
        ),
      ),
    )
    .limit(1);
  if (!rel) {
    res.status(400).json({ error: "That buddy relationship is not active" });
    return;
  }

  // Idempotent: reactivate / re-scope an existing buddy participant if present.
  const [existing] = await db
    .select({ id: commitmentParticipantsTable.id })
    .from(commitmentParticipantsTable)
    .where(
      and(
        eq(commitmentParticipantsTable.commitmentId, id),
        eq(commitmentParticipantsTable.participantType, "buddy"),
        eq(commitmentParticipantsTable.buddyRelationshipId, buddyRelationshipId),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(commitmentParticipantsTable)
      .set({ shareScope, isActive: true, updatedAt: new Date() })
      .where(eq(commitmentParticipantsTable.id, existing.id))
      .returning();
    res.status(201).json(updated);
    return;
  }

  const [participant] = await db
    .insert(commitmentParticipantsTable)
    .values({
      commitmentId: id,
      participantType: "buddy",
      buddyRelationshipId,
      shareScope,
    })
    .returning();
  res.status(201).json(participant);
});

// DELETE /shared-commitments/:id/participants/:participantId — silent revoke.
router.delete(
  "/shared-commitments/:id/participants/:participantId",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    const id = parseId(req.params.id);
    const participantId = parseId(req.params.participantId);
    if (id == null || participantId == null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    // Ownership guard: the commitment must belong to the authed user.
    const [commitment] = await db
      .select({ id: sharedCommitmentsTable.id })
      .from(sharedCommitmentsTable)
      .where(and(eq(sharedCommitmentsTable.id, id), eq(sharedCommitmentsTable.userId, userId)))
      .limit(1);
    if (!commitment) {
      res.status(404).json({ error: "Commitment not found" });
      return;
    }

    await db
      .delete(commitmentParticipantsTable)
      .where(
        and(
          eq(commitmentParticipantsTable.id, participantId),
          eq(commitmentParticipantsTable.commitmentId, id),
        ),
      );
    res.sendStatus(204);
  },
);

function parseId(raw: string | string[] | undefined): number | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = parseInt(v!, 10);
  return isNaN(n) ? null : n;
}

export default router;
