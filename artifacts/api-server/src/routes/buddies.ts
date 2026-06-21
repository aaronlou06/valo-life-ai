import { Router, type IRouter } from "express";
import { and, eq, or, isNull, gt } from "drizzle-orm";
import {
  db,
  buddyRelationshipsTable,
  userProfilesTable,
  sharedCommitmentsTable,
  commitmentParticipantsTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import {
  generateInviteCode,
  getDisplayName,
  buildBuddyCommitmentViews,
} from "../lib/accountability";

const router: IRouter = Router();

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const APP_SCHEME = "valo";

// POST /buddies/invite — create a single-use, 14-day invite code. Accepts an
// optional displayName so the inviter can set the name their buddy will see
// (the only other place it gets set is the accept flow).
router.post("/buddies/invite", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { displayName } = (req.body ?? {}) as { displayName?: string };
  if (displayName && displayName.trim()) {
    await upsertDisplayName(userId, displayName.trim());
  }
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  // Retry on the rare unique-code collision.
  let inserted: { id: number; inviteCode: string } | undefined;
  for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
    const code = generateInviteCode();
    try {
      const [row] = await db
        .insert(buddyRelationshipsTable)
        .values({ inviterId: userId, inviteCode: code, status: "pending", expiresAt })
        .returning({ id: buddyRelationshipsTable.id, inviteCode: buddyRelationshipsTable.inviteCode });
      inserted = row;
    } catch (err) {
      req.log.warn({ err, attempt }, "invite code collision, retrying");
    }
  }

  if (!inserted) {
    res.status(500).json({ error: "Could not generate an invite code, please try again" });
    return;
  }

  res.status(201).json({
    relationshipId: inserted.id,
    code: inserted.inviteCode,
    shareUrl: `${APP_SCHEME}://buddy-accept/${inserted.inviteCode}`,
    expiresAt: expiresAt.toISOString(),
  });
});

// POST /buddies/accept — consume a code; connect the two users.
router.post("/buddies/accept", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { code, displayName } = req.body as { code?: string; displayName?: string };

  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "An invite code is required" });
    return;
  }
  const normalized = code.trim().toUpperCase();

  const [rel] = await db
    .select()
    .from(buddyRelationshipsTable)
    .where(eq(buddyRelationshipsTable.inviteCode, normalized))
    .limit(1);

  if (!rel) {
    res.status(400).json({ error: "That invite code is not valid" });
    return;
  }
  if (rel.status !== "pending" || rel.inviteeId != null) {
    res.status(400).json({ error: "That invite code has already been used" });
    return;
  }
  if (rel.expiresAt && rel.expiresAt < new Date()) {
    res.status(400).json({ error: "That invite code has expired" });
    return;
  }
  if (rel.inviterId === userId) {
    res.status(409).json({ error: "You can't accept your own invite" });
    return;
  }

  // Prevent a duplicate active relationship between the same two users.
  const existingActive = await db
    .select({ id: buddyRelationshipsTable.id })
    .from(buddyRelationshipsTable)
    .where(
      and(
        eq(buddyRelationshipsTable.status, "active"),
        or(
          and(eq(buddyRelationshipsTable.inviterId, rel.inviterId), eq(buddyRelationshipsTable.inviteeId, userId)),
          and(eq(buddyRelationshipsTable.inviterId, userId), eq(buddyRelationshipsTable.inviteeId, rel.inviterId)),
        ),
      ),
    )
    .limit(1);
  if (existingActive.length > 0) {
    res.status(409).json({ error: "You're already connected with this buddy" });
    return;
  }

  if (displayName && displayName.trim()) {
    await upsertDisplayName(userId, displayName.trim());
  }

  // Atomic single-use guard: the conditions are re-checked inside the write so
  // two concurrent accepts of the same code cannot both succeed.
  const [updated] = await db
    .update(buddyRelationshipsTable)
    .set({ inviteeId: userId, status: "active", expiresAt: null, acceptedAt: new Date() })
    .where(
      and(
        eq(buddyRelationshipsTable.id, rel.id),
        eq(buddyRelationshipsTable.status, "pending"),
        isNull(buddyRelationshipsTable.inviteeId),
        or(
          isNull(buddyRelationshipsTable.expiresAt),
          gt(buddyRelationshipsTable.expiresAt, new Date()),
        ),
      ),
    )
    .returning({ id: buddyRelationshipsTable.id, status: buddyRelationshipsTable.status });

  if (!updated) {
    res.status(400).json({ error: "That invite code has already been used" });
    return;
  }

  res.json({
    relationshipId: updated.id,
    inviterDisplayName: await getDisplayName(rel.inviterId),
    status: updated.status,
  });
});

// GET /buddies — active relationships for the authed user (either side).
router.get("/buddies", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const rels = await db
    .select()
    .from(buddyRelationshipsTable)
    .where(
      and(
        eq(buddyRelationshipsTable.status, "active"),
        or(
          eq(buddyRelationshipsTable.inviterId, userId),
          eq(buddyRelationshipsTable.inviteeId, userId),
        ),
      ),
    );

  const out = await Promise.all(
    rels.map(async (r) => {
      const isInviter = r.inviterId === userId;
      const otherId = isInviter ? r.inviteeId : r.inviterId;
      return {
        relationshipId: r.id,
        displayName: otherId ? await getDisplayName(otherId) : null,
        role: isInviter ? "inviter" : "invitee",
        status: r.status,
        since: r.acceptedAt ? r.acceptedAt.toISOString() : null,
      };
    }),
  );
  res.json(out);
});

// POST /buddies/:id/block — either party may block at any time.
router.post("/buddies/:id/block", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId!, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [updated] = await db
    .update(buddyRelationshipsTable)
    .set({ status: "blocked", blockedBy: userId })
    .where(
      and(
        eq(buddyRelationshipsTable.id, id),
        or(
          eq(buddyRelationshipsTable.inviterId, userId),
          eq(buddyRelationshipsTable.inviteeId, userId),
        ),
      ),
    )
    .returning({ id: buddyRelationshipsTable.id });

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.sendStatus(204);
});

// GET /buddies/:buddyRelationshipId/commitments — what the *other* party shared
// with me, scope-enforced. Never returns raw occurrence dates.
router.get("/buddies/:buddyRelationshipId/commitments", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const rawId = Array.isArray(req.params.buddyRelationshipId)
    ? req.params.buddyRelationshipId[0]
    : req.params.buddyRelationshipId;
  const relId = parseInt(rawId!, 10);
  if (isNaN(relId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [rel] = await db
    .select()
    .from(buddyRelationshipsTable)
    .where(eq(buddyRelationshipsTable.id, relId))
    .limit(1);

  if (
    !rel ||
    rel.status !== "active" ||
    (rel.inviterId !== userId && rel.inviteeId !== userId)
  ) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const ownerId = rel.inviterId === userId ? rel.inviteeId : rel.inviterId;
  if (!ownerId) {
    res.json([]);
    return;
  }

  // Commitments the owner has actively shared with THIS relationship.
  const rows = await db
    .select({
      commitment: sharedCommitmentsTable,
      shareScope: commitmentParticipantsTable.shareScope,
    })
    .from(commitmentParticipantsTable)
    .innerJoin(
      sharedCommitmentsTable,
      eq(commitmentParticipantsTable.commitmentId, sharedCommitmentsTable.id),
    )
    .where(
      and(
        eq(commitmentParticipantsTable.buddyRelationshipId, relId),
        eq(commitmentParticipantsTable.participantType, "buddy"),
        eq(commitmentParticipantsTable.isActive, true),
        eq(sharedCommitmentsTable.isActive, true),
        eq(sharedCommitmentsTable.userId, ownerId),
      ),
    );

  const views = await buildBuddyCommitmentViews(
    ownerId,
    rows.map((r) => ({ ...r.commitment, shareScope: r.shareScope })),
  );
  res.json(views);
});

async function upsertDisplayName(userId: string, displayName: string): Promise<void> {
  const [existing] = await db
    .select({ id: userProfilesTable.id })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);
  if (existing) {
    await db
      .update(userProfilesTable)
      .set({ displayName, updatedAt: new Date() })
      .where(eq(userProfilesTable.userId, userId));
  } else {
    await db.insert(userProfilesTable).values({ userId, displayName });
  }
}

export default router;
