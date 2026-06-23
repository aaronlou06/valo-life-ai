import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, subscriptionsTable, freeMonthBalanceTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── GET /api/subscription/status ──────────────────────────────────────────────
// Returns computed status without mutating DB (nightly job handles transitions).

router.get("/subscription/status", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;

  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId))
    .limit(1);

  const [balance] = await db
    .select({ balanceMonths: freeMonthBalanceTable.balanceMonths })
    .from(freeMonthBalanceTable)
    .where(eq(freeMonthBalanceTable.userId, userId))
    .limit(1);

  if (!sub) {
    // No subscription yet — treat as expired (shouldn't happen for registered users)
    res.json({
      status: "expired",
      trialEndsAt: null,
      graceEndsAt: null,
      currentPeriodEnd: null,
      freeMonthsAvailable: 0,
      hadTrial: false,
    });
    return;
  }

  const now = new Date();

  // Compute derived status without writing to DB.
  let computedStatus = sub.status;

  if (sub.status === "trialing" && sub.trialEndAt) {
    if (now > sub.trialEndAt) {
      const graceEnd = new Date(sub.trialEndAt.getTime() + 48 * 60 * 60 * 1000);
      computedStatus = now <= graceEnd ? "grace" : "expired";
    }
  } else if (sub.status === "grace" && sub.graceEndsAt) {
    if (now > sub.graceEndsAt) {
      computedStatus = "expired";
    }
  } else if (sub.status === "canceled" && sub.currentPeriodEnd) {
    if (now > sub.currentPeriodEnd) {
      computedStatus = "expired";
    }
  }

  const graceEndsAt =
    sub.graceEndsAt ??
    (sub.trialEndAt
      ? new Date(sub.trialEndAt.getTime() + 48 * 60 * 60 * 1000).toISOString()
      : null);

  res.json({
    status: computedStatus,
    trialEndsAt: sub.trialEndAt?.toISOString() ?? null,
    graceEndsAt: graceEndsAt,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    freeMonthsAvailable: balance?.balanceMonths ?? 0,
    hadTrial: sub.hadTrial,
  });
});

// ── POST /api/subscription/cancel ─────────────────────────────────────────────

router.post("/subscription/cancel", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { reason, reasonDetail, saveAttemptOffered, saveAttemptAccepted } = req.body as {
    reason?: string;
    reasonDetail?: string;
    saveAttemptOffered?: string;
    saveAttemptAccepted?: boolean;
  };

  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId))
    .limit(1);

  if (!sub) {
    res.status(404).json({ error: "No subscription found" });
    return;
  }

  if (sub.status === "canceled" || sub.status === "expired") {
    res.status(400).json({ error: "Subscription is already canceled or expired" });
    return;
  }

  const now = new Date();
  const updateValues: Record<string, unknown> = {
    canceledAt: now,
    cancelReason: reason ?? null,
    cancelSaveAttempt: saveAttemptOffered ?? null,
    status: "canceled" as const,
  };

  // If user accepted a 30-day pause, extend currentPeriodEnd by 30 days.
  if (saveAttemptAccepted && saveAttemptOffered === "pause") {
    const base = sub.currentPeriodEnd ?? now;
    const extended = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
    updateValues.currentPeriodEnd = extended;
  }

  // If user accepted 50% discount, flag it (used by billing logic on renewal).
  if (saveAttemptAccepted && saveAttemptOffered === "discount") {
    updateValues.saveDiscountApplied = true;
    updateValues.status = "active";
    updateValues.canceledAt = null;
    updateValues.cancelReason = null;
  }

  try {
    await db
      .update(subscriptionsTable)
      .set(updateValues as any)
      .where(eq(subscriptionsTable.userId, userId));

    res.json({ ok: true, status: updateValues.status ?? "canceled" });
  } catch (err) {
    logger.error({ err, userId }, "POST /subscription/cancel failed");
    res.status(500).json({ error: "Could not cancel subscription" });
  }
});

export default router;
