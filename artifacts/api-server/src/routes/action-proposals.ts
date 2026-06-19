import { Router, type IRouter } from "express";
import { and, eq, ne } from "drizzle-orm";
import {
  db,
  proposedActionsTable,
  actionLogTable,
  calendarEventsTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { getActionHandler } from "../lib/actions";

const router: IRouter = Router();

function parseIntId(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Action-type-specific freshness guard. The proposal captured the world at
 * surface time; before mutating we re-verify nothing relevant moved underneath
 * it. Returns true when the proposal is still safe to execute.
 *
 * Mirrors the expire-on-read check in home-briefing, plus a target-slot
 * collision check so we never double-book a workout day.
 */
async function isStillFresh(
  actionType: string,
  params: Record<string, unknown>,
  userId: string,
): Promise<boolean> {
  if (actionType !== "reschedule_workout") return true;

  const calendarEventId = params.calendarEventId as number;
  const currentDate = params.currentDate as string;
  const currentStartTime = (params.currentStartTime as string | null | undefined) ?? null;
  const targetDate = params.targetDate as string;

  const [event] = await db
    .select()
    .from(calendarEventsTable)
    .where(
      and(
        eq(calendarEventsTable.id, calendarEventId),
        eq(calendarEventsTable.userId, userId),
        eq(calendarEventsTable.type, "workout"),
      ),
    )
    .limit(1);

  if (!event) return false;

  const liveStart = event.startTime ? event.startTime.toISOString() : null;
  if (event.date !== currentDate || liveStart !== currentStartTime) return false;

  // Refuse to move onto a day that already holds another workout.
  const conflicts = await db
    .select({ id: calendarEventsTable.id })
    .from(calendarEventsTable)
    .where(
      and(
        eq(calendarEventsTable.userId, userId),
        eq(calendarEventsTable.type, "workout"),
        eq(calendarEventsTable.date, targetDate),
        ne(calendarEventsTable.id, calendarEventId),
      ),
    )
    .limit(1);

  if (conflicts.length > 0) return false;

  return true;
}

// POST /action-proposals/:id/execute — run the proposed action, log it, and
// mark the proposal executed. Idempotent against stale state via a 409 guard.
router.post(
  "/action-proposals/:id/execute",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    const id = parseIntId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid proposal id" });
      return;
    }

    try {
      const [proposal] = await db
        .select()
        .from(proposedActionsTable)
        .where(
          and(eq(proposedActionsTable.id, id), eq(proposedActionsTable.userId, userId)),
        )
        .limit(1);

      if (!proposal) {
        res.status(404).json({ error: "Proposal not found" });
        return;
      }

      // Already responded to (executed/declined/modified/expired): treat as stale.
      if (proposal.status !== "pending") {
        res.status(409).json({ stale: true });
        return;
      }
      if (proposal.expiresAt && proposal.expiresAt.getTime() <= Date.now()) {
        res.status(409).json({ stale: true });
        return;
      }

      const handler = getActionHandler(proposal.actionType);
      if (!handler) {
        res.status(400).json({ error: `Unknown action type: ${proposal.actionType}` });
        return;
      }

      const parsed = handler.parameterSchema.safeParse(proposal.parameters);
      if (!parsed.success) {
        req.log.error(
          { err: parsed.error, proposalId: id },
          "execute: proposal parameters failed validation",
        );
        res.status(409).json({ stale: true });
        return;
      }

      const params = parsed.data as Record<string, unknown>;
      const fresh = await isStillFresh(proposal.actionType, params, userId);
      if (!fresh) {
        // Mark the now-stale proposal expired so it stops surfacing.
        await db
          .update(proposedActionsTable)
          .set({ status: "expired", updatedAt: new Date() })
          .where(
            and(
              eq(proposedActionsTable.id, id),
              eq(proposedActionsTable.userId, userId),
            ),
          );
        res.status(409).json({ stale: true });
        return;
      }

      const { beforeSnapshot } = await handler.execute(parsed.data, { userId });

      const [logRow] = await db
        .insert(actionLogTable)
        .values({
          userId,
          proposedActionId: id,
          actionType: proposal.actionType,
          parameters: params,
          beforeSnapshot: beforeSnapshot as Record<string, unknown>,
          status: "executed",
        })
        .returning({ id: actionLogTable.id });

      await db
        .update(proposedActionsTable)
        .set({ status: "executed", respondedAt: new Date(), updatedAt: new Date() })
        .where(
          and(eq(proposedActionsTable.id, id), eq(proposedActionsTable.userId, userId)),
        );

      res.status(200).json({ actionLogId: logRow!.id });
    } catch (err) {
      req.log.error({ err, proposalId: id }, "execute action proposal failed");
      res.status(500).json({ error: "Failed to execute action" });
    }
  },
);

// POST /action-proposals/:id/dismiss — record the user's decline (or "modified"
// when the user edited the suggestion instead). Idempotent.
router.post(
  "/action-proposals/:id/dismiss",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    const id = parseIntId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid proposal id" });
      return;
    }

    const modified = (req.body as { modified?: unknown } | undefined)?.modified === true;
    const status = modified ? "modified" : "declined";

    try {
      const [proposal] = await db
        .select({ id: proposedActionsTable.id, status: proposedActionsTable.status })
        .from(proposedActionsTable)
        .where(
          and(eq(proposedActionsTable.id, id), eq(proposedActionsTable.userId, userId)),
        )
        .limit(1);

      if (!proposal) {
        res.status(404).json({ error: "Proposal not found" });
        return;
      }

      // Only move a still-pending proposal; leave already-resolved ones as-is.
      if (proposal.status === "pending") {
        await db
          .update(proposedActionsTable)
          .set({ status, respondedAt: new Date(), updatedAt: new Date() })
          .where(
            and(eq(proposedActionsTable.id, id), eq(proposedActionsTable.userId, userId)),
          );
      }

      res.status(200).json({ status });
    } catch (err) {
      req.log.error({ err, proposalId: id }, "dismiss action proposal failed");
      res.status(500).json({ error: "Failed to dismiss action" });
    }
  },
);

// POST /action-log/:id/undo — reverse a previously executed action using its
// captured before-snapshot, then flip the log row to "undone".
router.post(
  "/action-log/:id/undo",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    const id = parseIntId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid action log id" });
      return;
    }

    try {
      const [logRow] = await db
        .select()
        .from(actionLogTable)
        .where(and(eq(actionLogTable.id, id), eq(actionLogTable.userId, userId)))
        .limit(1);

      if (!logRow) {
        res.status(404).json({ error: "Action log entry not found" });
        return;
      }

      if (logRow.status !== "executed") {
        res.status(409).json({ error: "Action already undone" });
        return;
      }

      const handler = getActionHandler(logRow.actionType);
      if (!handler) {
        res.status(400).json({ error: `Unknown action type: ${logRow.actionType}` });
        return;
      }

      await handler.undo(logRow.beforeSnapshot, { userId });

      await db
        .update(actionLogTable)
        .set({ status: "undone", undoneAt: new Date(), updatedAt: new Date() })
        .where(and(eq(actionLogTable.id, id), eq(actionLogTable.userId, userId)));

      res.status(200).json({ undone: true });
    } catch (err) {
      req.log.error({ err, actionLogId: id }, "undo action failed");
      res.status(500).json({ error: "Failed to undo action" });
    }
  },
);

export default router;
