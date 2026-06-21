import { Router, type IRouter } from "express";
import { and, eq, or, lte, desc } from "drizzle-orm";
import {
  db,
  encouragementsTable,
  sharedCommitmentsTable,
  commitmentParticipantsTable,
  buddyRelationshipsTable,
  commitmentExceptionsTable,
  userProfilesTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { getDateInTimezone, DEFAULT_TIMEZONE } from "../lib/dates";

const router: IRouter = Router();

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

async function resolveToday(userId: string): Promise<string> {
  const [p] = await db
    .select({ tz: userProfilesTable.callTimezone })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);
  return getDateInTimezone(p?.tz ?? DEFAULT_TIMEZONE);
}

// POST /encouragements — a buddy sends a one-tap "I see you" on a commitment.
// Stage 0 supports only messageType 'support', capped at one per buddy per
// commitment per day (enforced by a partial unique index → 409 on repeat).
router.post("/encouragements", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { commitmentId, messageType } = req.body as {
    commitmentId?: number;
    messageType?: string;
  };

  if (commitmentId == null) {
    res.status(400).json({ error: "commitmentId is required" });
    return;
  }
  if (messageType != null && messageType !== "support") {
    res.status(400).json({ error: "Only 'support' encouragements are supported right now" });
    return;
  }

  // The commitment must exist; its owner is the recipient.
  const [commitment] = await db
    .select({ id: sharedCommitmentsTable.id, ownerId: sharedCommitmentsTable.userId })
    .from(sharedCommitmentsTable)
    .where(eq(sharedCommitmentsTable.id, commitmentId))
    .limit(1);
  if (!commitment) {
    res.status(404).json({ error: "Commitment not found" });
    return;
  }
  if (commitment.ownerId === userId) {
    res.status(400).json({ error: "You cannot encourage your own commitment" });
    return;
  }

  // The sender must be an active buddy participant on this commitment.
  const [participant] = await db
    .select({ id: commitmentParticipantsTable.id })
    .from(commitmentParticipantsTable)
    .innerJoin(
      buddyRelationshipsTable,
      eq(commitmentParticipantsTable.buddyRelationshipId, buddyRelationshipsTable.id),
    )
    .where(
      and(
        eq(commitmentParticipantsTable.commitmentId, commitmentId),
        eq(commitmentParticipantsTable.isActive, true),
        eq(commitmentParticipantsTable.participantType, "buddy"),
        eq(buddyRelationshipsTable.status, "active"),
        or(
          eq(buddyRelationshipsTable.inviterId, userId),
          eq(buddyRelationshipsTable.inviteeId, userId),
        ),
      ),
    )
    .limit(1);
  if (!participant) {
    res.status(403).json({ error: "You are not a buddy on this commitment" });
    return;
  }

  const sentDate = await resolveToday(userId);

  try {
    const [created] = await db
      .insert(encouragementsTable)
      .values({
        commitmentId,
        senderType: "user",
        senderId: userId,
        recipientId: commitment.ownerId,
        messageType: "support",
        body: null,
        sentDate,
      })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    // Partial unique index violation = already cheered this commitment today.
    if (err && typeof err === "object" && (err as { code?: string }).code === "23505") {
      res.status(409).json({ error: "You already encouraged this today" });
      return;
    }
    throw err;
  }
});

type FeedType = "encouragement" | "exception" | "buddy_joined";

interface FeedItem {
  type: FeedType;
  id: number;
  timestamp: string;
  data: Record<string, unknown>;
}

// Total order over (timestamp, type, id) so a feed page boundary is stable even
// when several events share the exact same timestamp.
function tupleCmp(a: FeedItem, b: FeedItem): number {
  if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? -1 : 1;
  if (a.type !== b.type) return a.type < b.type ? -1 : 1;
  return a.id - b.id;
}

interface FeedCursor {
  timestamp: string;
  type: FeedType;
  id: number;
}

function encodeCursor(item: FeedItem): string {
  return `${item.timestamp}|${item.type}|${item.id}`;
}

function decodeCursor(raw: string): FeedCursor | null {
  const parts = raw.split("|");
  if (parts.length !== 3) return null;
  const [timestamp, type, idStr] = parts;
  const id = parseInt(idStr!, 10);
  if (Number.isNaN(id) || Number.isNaN(new Date(timestamp!).getTime())) return null;
  if (type !== "encouragement" && type !== "exception" && type !== "buddy_joined") return null;
  return { timestamp: timestamp!, type, id };
}

// GET /accountability/feed — merged, newest-first activity stream for the user:
// encouragements they received, exceptions they declared, and buddies who
// joined. The cursor is an opaque composite (timestamp|type|id) from the last
// item of the prior page, so same-timestamp events are never skipped.
router.get("/accountability/feed", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const rawLimit = parseInt(String(req.query.limit ?? ""), 10);
  const limit = Number.isNaN(rawLimit) ? DEFAULT_LIMIT : Math.min(Math.max(rawLimit, 1), MAX_LIMIT);
  const cursorRaw = typeof req.query.cursor === "string" ? req.query.cursor : null;
  const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;
  // Inclusive (lte) bound on the timestamp: boundary-timestamp rows are fetched,
  // then the in-memory tuple filter drops the ones already returned.
  const cursorDate = cursor ? new Date(cursor.timestamp) : null;

  const [encouragements, exceptions, buddies] = await Promise.all([
    db
      .select()
      .from(encouragementsTable)
      .where(
        cursorDate
          ? and(
              eq(encouragementsTable.recipientId, userId),
              lte(encouragementsTable.sentAt, cursorDate),
            )
          : eq(encouragementsTable.recipientId, userId),
      )
      .orderBy(desc(encouragementsTable.sentAt))
      .limit(limit),
    db
      .select()
      .from(commitmentExceptionsTable)
      .where(
        cursorDate
          ? and(
              eq(commitmentExceptionsTable.userId, userId),
              lte(commitmentExceptionsTable.createdAt, cursorDate),
            )
          : eq(commitmentExceptionsTable.userId, userId),
      )
      .orderBy(desc(commitmentExceptionsTable.createdAt))
      .limit(limit),
    db
      .select()
      .from(buddyRelationshipsTable)
      .where(
        cursorDate
          ? and(
              eq(buddyRelationshipsTable.status, "active"),
              or(
                eq(buddyRelationshipsTable.inviterId, userId),
                eq(buddyRelationshipsTable.inviteeId, userId),
              ),
              lte(buddyRelationshipsTable.acceptedAt, cursorDate),
            )
          : and(
              eq(buddyRelationshipsTable.status, "active"),
              or(
                eq(buddyRelationshipsTable.inviterId, userId),
                eq(buddyRelationshipsTable.inviteeId, userId),
              ),
            ),
      )
      .orderBy(desc(buddyRelationshipsTable.acceptedAt))
      .limit(limit),
  ]);

  const items: FeedItem[] = [];
  for (const e of encouragements) {
    items.push({
      type: "encouragement",
      id: e.id,
      timestamp: e.sentAt.toISOString(),
      data: {
        commitmentId: e.commitmentId,
        messageType: e.messageType,
        senderType: e.senderType,
        senderId: e.senderId,
      },
    });
  }
  for (const x of exceptions) {
    items.push({
      type: "exception",
      id: x.id,
      timestamp: x.createdAt.toISOString(),
      data: {
        commitmentId: x.commitmentId,
        kind: x.kind,
        scope: x.scope,
        startDate: x.startDate,
        endDate: x.endDate,
        isRetroactive: x.isRetroactive,
        reason: x.reason,
      },
    });
  }
  for (const b of buddies) {
    if (!b.acceptedAt) continue;
    items.push({
      type: "buddy_joined",
      id: b.id,
      timestamp: b.acceptedAt.toISOString(),
      data: {
        relationshipId: b.id,
        role: b.inviterId === userId ? "inviter" : "invitee",
      },
    });
  }

  // Drop anything at-or-after the cursor in the total order (already returned),
  // then sort newest-first by the same (timestamp, type, id) tuple.
  const filtered = cursor
    ? items.filter(
        (it) =>
          tupleCmp(it, { type: cursor.type, id: cursor.id, timestamp: cursor.timestamp, data: {} }) <
          0,
      )
    : items;
  filtered.sort((a, b) => tupleCmp(b, a));
  const page = filtered.slice(0, limit);
  const nextCursor = page.length === limit ? encodeCursor(page[page.length - 1]!) : null;

  res.json({ items: page, nextCursor });
});

export default router;
