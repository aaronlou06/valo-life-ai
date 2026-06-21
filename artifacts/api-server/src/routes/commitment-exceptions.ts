import { Router, type IRouter } from "express";
import { and, eq, desc, or } from "drizzle-orm";
import {
  db,
  commitmentExceptionsTable,
  sharedCommitmentsTable,
  userProfilesTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { getDateInTimezone, DEFAULT_TIMEZONE } from "../lib/dates";
import { MAX_EXCEPTION_WINDOW_DAYS } from "../lib/commitmentExceptions";

const router: IRouter = Router();

const KINDS = new Set(["pause", "excused"]);
// Stage 0 ships UI for 'one' and 'all'; 'several' is schema-ready but deferred.
const SCOPES = new Set(["one", "all"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function resolveToday(userId: string): Promise<string> {
  const [p] = await db
    .select({ tz: userProfilesTable.callTimezone })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);
  return getDateInTimezone(p?.tz ?? DEFAULT_TIMEZONE);
}

// POST /commitment-exceptions — declare a pause / excused window.
router.post("/commitment-exceptions", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { kind, scope, commitmentId, startDate, endDate, reason } = req.body as {
    kind?: string;
    scope?: string;
    commitmentId?: number | null;
    startDate?: string;
    endDate?: string;
    reason?: string | null;
  };

  if (!kind || !KINDS.has(kind)) {
    res.status(400).json({ error: "kind must be 'pause' or 'excused'" });
    return;
  }
  if (!scope || !SCOPES.has(scope)) {
    res.status(400).json({ error: "scope must be 'one' or 'all'" });
    return;
  }
  if (!startDate || !ISO_DATE.test(startDate) || !endDate || !ISO_DATE.test(endDate)) {
    res.status(400).json({ error: "startDate and endDate must be YYYY-MM-DD" });
    return;
  }
  if (startDate > endDate) {
    res.status(400).json({ error: "startDate must be on or before endDate" });
    return;
  }
  // Cap window length so a single exception can't silently span unbounded time.
  const windowDays =
    Math.round(
      (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) /
        (24 * 60 * 60 * 1000),
    ) + 1;
  if (windowDays > MAX_EXCEPTION_WINDOW_DAYS) {
    res
      .status(400)
      .json({ error: `Exception window must be ${MAX_EXCEPTION_WINDOW_DAYS} days or fewer` });
    return;
  }

  let targetCommitmentId: number | null = null;
  if (scope === "one") {
    if (commitmentId == null) {
      res.status(400).json({ error: "commitmentId is required for scope 'one'" });
      return;
    }
    // The target commitment must belong to the authed user.
    const [owned] = await db
      .select({ id: sharedCommitmentsTable.id })
      .from(sharedCommitmentsTable)
      .where(
        and(
          eq(sharedCommitmentsTable.id, commitmentId),
          eq(sharedCommitmentsTable.userId, userId),
        ),
      )
      .limit(1);
    if (!owned) {
      res.status(404).json({ error: "Commitment not found" });
      return;
    }
    targetCommitmentId = commitmentId;
  }

  // Retroactive when the window opens before today — the feed badges these so
  // history is never silently rewritten.
  const today = await resolveToday(userId);
  const isRetroactive = startDate < today;

  const [created] = await db
    .insert(commitmentExceptionsTable)
    .values({
      userId,
      commitmentId: targetCommitmentId,
      kind,
      scope,
      startDate,
      endDate,
      reason: reason ?? null,
      isRetroactive,
    })
    .returning();

  res.status(201).json(created);
});

// GET /shared-commitments/:id/exceptions — exceptions affecting one commitment,
// newest first. Includes its own scope='one' rows plus owner-wide scope='all'.
router.get(
  "/shared-commitments/:id/exceptions",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [commitment] = await db
      .select({ id: sharedCommitmentsTable.id })
      .from(sharedCommitmentsTable)
      .where(and(eq(sharedCommitmentsTable.id, id), eq(sharedCommitmentsTable.userId, userId)))
      .limit(1);
    if (!commitment) {
      res.status(404).json({ error: "Commitment not found" });
      return;
    }

    const rows = await db
      .select()
      .from(commitmentExceptionsTable)
      .where(
        and(
          eq(commitmentExceptionsTable.userId, userId),
          or(
            eq(commitmentExceptionsTable.commitmentId, id),
            eq(commitmentExceptionsTable.scope, "all"),
          ),
        ),
      )
      .orderBy(desc(commitmentExceptionsTable.createdAt));

    res.json(rows);
  },
);

function parseId(raw: string | string[] | undefined): number | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = parseInt(v!, 10);
  return isNaN(n) ? null : n;
}

export default router;
