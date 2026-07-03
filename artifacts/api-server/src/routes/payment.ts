import { Router, type IRouter } from "express";
import { eq, and, isNull } from "drizzle-orm";
import {
  db,
  paymentEventsTable,
  subscriptionsTable,
  freeMonthBalanceTable,
  referralConversionsTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { createHmac } from "crypto";

const router: IRouter = Router();

const HELCIM_API_KEY = process.env.HELCIM_API_KEY ?? "";
const HELCIM_ACCOUNT_ID = process.env.HELCIM_ACCOUNT_ID ?? "";
const HELCIM_WEBHOOK_SECRET = process.env.HELCIM_WEBHOOK_SECRET ?? "";
const SUBSCRIPTION_PRICE_CENTS = 2000; // $20.00

// ── POST /api/payment/helcim-token ────────────────────────────────────────────
// Initialize a Helcim checkout session and return a one-time token.

router.post("/payment/helcim-token", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;

  if (!HELCIM_API_KEY || !HELCIM_ACCOUNT_ID) {
    res.status(503).json({ error: "Payment provider not configured" });
    return;
  }

  try {
    const response = await fetch("https://api.helcim.com/v2/helcim-pay/initialize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-token": HELCIM_API_KEY,
      },
      body: JSON.stringify({
        paymentType: "purchase",
        amount: SUBSCRIPTION_PRICE_CENTS / 100,
        currency: "USD",
        customerCode: userId,
        comment: "Valo monthly subscription",
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error({ userId, status: response.status, body: text }, "Helcim token init failed");
      res.status(502).json({ error: "Could not initialize payment" });
      return;
    }

    const data = (await response.json()) as { checkoutToken?: string; secretToken?: string };
    res.json({ checkoutToken: data.checkoutToken, secretToken: data.secretToken });
  } catch (err) {
    logger.error({ err, userId }, "POST /payment/helcim-token error");
    res.status(500).json({ error: "Payment initialization failed" });
  }
});

// ── POST /api/payment/confirm ─────────────────────────────────────────────────
// Called by the mobile app after the Helcim WebView reports a successful transaction.

router.post("/payment/confirm", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { helcimTransactionId, amountCents } = req.body as {
    helcimTransactionId?: string;
    amountCents?: number;
  };

  if (!helcimTransactionId) {
    res.status(400).json({ error: "helcimTransactionId is required" });
    return;
  }

  // Idempotency: if we already recorded this transaction, return success.
  const existing = await db
    .select({ id: paymentEventsTable.id, status: paymentEventsTable.status })
    .from(paymentEventsTable)
    .where(eq(paymentEventsTable.helcimTransactionId, helcimTransactionId))
    .limit(1);

  if (existing.length > 0) {
    res.json({ success: true, subscriptionStatus: "active", alreadyProcessed: true });
    return;
  }

  // Check if user has a free month to apply instead of payment.
  const [balance] = await db
    .select()
    .from(freeMonthBalanceTable)
    .where(eq(freeMonthBalanceTable.userId, userId))
    .limit(1);

  const freeMonthApplied = (balance?.balanceMonths ?? 0) > 0;

  try {
    await db.transaction(async (tx) => {
      // Record the payment event.
      await tx.insert(paymentEventsTable).values({
        userId,
        helcimTransactionId,
        amountCents: amountCents ?? SUBSCRIPTION_PRICE_CENTS,
        status: "success",
        freeMonthApplied,
      });

      // Determine new period dates.
      const now = new Date();
      const periodStart = now;
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Activate subscription.
      await tx
        .update(subscriptionsTable)
        .set({
          status: "active",
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        })
        .where(eq(subscriptionsTable.userId, userId));

      // Decrement free month balance if applied.
      if (freeMonthApplied && balance) {
        await tx
          .update(freeMonthBalanceTable)
          .set({ balanceMonths: Math.max(0, balance.balanceMonths - 1) })
          .where(eq(freeMonthBalanceTable.userId, userId));
      }

      // Credit referrer on first payment.
      const [conversion] = await tx
        .select()
        .from(referralConversionsTable)
        .where(
          and(
            eq(referralConversionsTable.referredUserId, userId),
            isNull(referralConversionsTable.firstPaidAt),
          ),
        )
        .limit(1);

      if (conversion) {
        await tx
          .update(referralConversionsTable)
          .set({ firstPaidAt: now })
          .where(eq(referralConversionsTable.id, conversion.id));

        // Get referrer's current lifetime earned to determine tier.
        const [referrerBalance] = await tx
          .select()
          .from(freeMonthBalanceTable)
          .where(eq(freeMonthBalanceTable.userId, conversion.referrerUserId))
          .limit(1);

        const lifetimeEarned = referrerBalance?.lifetimeEarned ?? 0;

        // Tier thresholds: 0-3 earned = 1:1, 4-6 = need 2, 7+ = need 3.
        // Count unconverted pending conversions to see if threshold is hit.
        // Simple approach: credit 1 free month per this conversion at current tier.
        // Tier 0-3: always credit. Tier 4-6: credit every 2nd conversion. 7+: every 3rd.
        let shouldCredit = false;
        const pendingConversions = await tx
          .select({ id: referralConversionsTable.id })
          .from(referralConversionsTable)
          .where(
            and(
              eq(referralConversionsTable.referrerUserId, conversion.referrerUserId),
              eq(referralConversionsTable.freeMonthCredited, false),
            ),
          );
        const creditedCount = pendingConversions.length;

        if (lifetimeEarned < 4) {
          shouldCredit = true; // 1:1
        } else if (lifetimeEarned < 7) {
          shouldCredit = creditedCount % 2 === 0; // every 2 conversions
        } else {
          shouldCredit = creditedCount % 3 === 0; // every 3 conversions
        }

        if (shouldCredit) {
          if (referrerBalance) {
            await tx
              .update(freeMonthBalanceTable)
              .set({
                balanceMonths: referrerBalance.balanceMonths + 1,
                lifetimeEarned: referrerBalance.lifetimeEarned + 1,
              })
              .where(eq(freeMonthBalanceTable.userId, conversion.referrerUserId));
          } else {
            await tx.insert(freeMonthBalanceTable).values({
              userId: conversion.referrerUserId,
              balanceMonths: 1,
              lifetimeEarned: 1,
            });
          }

          await tx
            .update(referralConversionsTable)
            .set({ freeMonthCredited: true })
            .where(eq(referralConversionsTable.id, conversion.id));
        }
      }
    });

    res.json({ success: true, subscriptionStatus: "active" });
  } catch (err) {
    logger.error({ err, userId, helcimTransactionId }, "POST /payment/confirm failed");
    res.status(500).json({ error: "Payment confirmation failed" });
  }
});

// ── POST /api/payment/webhook ─────────────────────────────────────────────────
// Helcim webhook backstop — HMAC-verified, idempotent.

router.post("/payment/webhook", async (req, res): Promise<void> => {
  // Fail closed: require HELCIM_WEBHOOK_SECRET to be configured.
  if (!HELCIM_WEBHOOK_SECRET) {
    logger.error("HELCIM_WEBHOOK_SECRET is not configured — rejecting webhook");
    res.status(503).json({ error: "Webhook not configured" });
    return;
  }

  // Verify HMAC signature — required when secret is set.
  const signature = req.headers["helcim-signature"] as string | undefined;
  if (!signature) {
    logger.warn("Helcim webhook missing signature header");
    res.status(401).json({ error: "Missing signature" });
    return;
  }

  const rawBody = JSON.stringify(req.body);
  const expected = createHmac("sha256", HELCIM_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  if (signature !== expected) {
    logger.warn("Helcim webhook signature mismatch");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  const event = req.body as {
    event?: string;
    data?: {
      transactionId?: string;
      customerCode?: string;
      amount?: number;
      status?: string;
    };
  };

  const txId = event.data?.transactionId;
  const userId = event.data?.customerCode;
  const amountCents = Math.round((event.data?.amount ?? 0) * 100);

  if (!txId || !userId) {
    res.json({ ok: true, skipped: "missing data" });
    return;
  }

  // Idempotency check.
  const existing = await db
    .select({ id: paymentEventsTable.id })
    .from(paymentEventsTable)
    .where(eq(paymentEventsTable.helcimTransactionId, txId))
    .limit(1);

  if (existing.length > 0) {
    res.json({ ok: true, idempotent: true });
    return;
  }

  try {
    if (event.event === "payment.completed") {
      await db.insert(paymentEventsTable).values({
        userId,
        helcimTransactionId: txId,
        amountCents,
        status: "success",
        freeMonthApplied: false,
      });

      await db
        .update(subscriptionsTable)
        .set({
          status: "active",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        })
        .where(eq(subscriptionsTable.userId, userId));
    } else if (event.event === "payment.failed") {
      await db.insert(paymentEventsTable).values({
        userId,
        helcimTransactionId: txId,
        amountCents,
        status: "failed",
        freeMonthApplied: false,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, txId, userId }, "Helcim webhook processing failed");
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
