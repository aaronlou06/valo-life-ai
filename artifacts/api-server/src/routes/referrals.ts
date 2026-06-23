import { Router, type IRouter } from "express";
import { eq, and, gt, isNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import {
  db,
  referralCodesTable,
  referralConversionsTable,
  paymentEventsTable,
  freeMonthBalanceTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const REFERRAL_LINK_BASE = process.env.REFERRAL_LINK_BASE ?? "https://joinvalo.com/r";
const CODE_TTL_DAYS = 30;

function generateCode(): string {
  return randomBytes(6).toString("base64url").slice(0, 8);
}

function codeExpiresAt(): Date {
  return new Date(Date.now() + CODE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

// ── POST /api/referrals/generate-code ─────────────────────────────────────────
// Only callable after the user's first successful payment.

router.post("/referrals/generate-code", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;

  // Check first payment exists.
  const [payment] = await db
    .select({ id: paymentEventsTable.id })
    .from(paymentEventsTable)
    .where(and(eq(paymentEventsTable.userId, userId), eq(paymentEventsTable.status, "success")))
    .limit(1);

  if (!payment) {
    res.status(403).json({ error: "Referral access requires at least one completed payment" });
    return;
  }

  // Return existing unexpired code if available.
  const now = new Date();
  const [existing] = await db
    .select()
    .from(referralCodesTable)
    .where(
      and(
        eq(referralCodesTable.userId, userId),
        eq(referralCodesTable.expired, false),
        gt(referralCodesTable.expiresAt, now),
      ),
    )
    .limit(1);

  if (existing) {
    res.json({
      code: existing.code,
      link: `${REFERRAL_LINK_BASE}/${existing.code}`,
      expiresAt: existing.expiresAt.toISOString(),
    });
    return;
  }

  // Generate a new code.
  let code = generateCode();
  let attempts = 0;
  while (attempts < 5) {
    try {
      const expiresAt = codeExpiresAt();
      await db.insert(referralCodesTable).values({ userId, code, expiresAt });
      res.json({ code, link: `${REFERRAL_LINK_BASE}/${code}`, expiresAt: expiresAt.toISOString() });
      return;
    } catch {
      code = generateCode();
      attempts++;
    }
  }

  res.status(500).json({ error: "Could not generate referral code" });
});

// ── POST /api/referrals/regenerate ────────────────────────────────────────────

router.post("/referrals/regenerate", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;

  // Expire all current codes for this user.
  await db
    .update(referralCodesTable)
    .set({ expired: true })
    .where(eq(referralCodesTable.userId, userId));

  // Generate a new code.
  let code = generateCode();
  let attempts = 0;
  while (attempts < 5) {
    try {
      const expiresAt = codeExpiresAt();
      await db.insert(referralCodesTable).values({ userId, code, expiresAt });
      res.json({ code, link: `${REFERRAL_LINK_BASE}/${code}`, expiresAt: expiresAt.toISOString() });
      return;
    } catch {
      code = generateCode();
      attempts++;
    }
  }

  res.status(500).json({ error: "Could not generate referral code" });
});

// ── POST /api/referrals/redeem ────────────────────────────────────────────────
// Called during onboarding completion. Silently no-ops on invalid codes.

router.post("/referrals/redeem", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { code } = req.body as { code?: string };

  if (!code || typeof code !== "string") {
    res.json({ ok: true, redeemed: false });
    return;
  }

  try {
    const now = new Date();
    const [referralCode] = await db
      .select()
      .from(referralCodesTable)
      .where(
        and(
          eq(referralCodesTable.code, code.trim()),
          eq(referralCodesTable.expired, false),
          gt(referralCodesTable.expiresAt, now),
        ),
      )
      .limit(1);

    if (!referralCode || referralCode.userId === userId) {
      res.json({ ok: true, redeemed: false });
      return;
    }

    // Check if this user already has a referral conversion record.
    const [alreadyReferred] = await db
      .select({ id: referralConversionsTable.id })
      .from(referralConversionsTable)
      .where(eq(referralConversionsTable.referredUserId, userId))
      .limit(1);

    if (alreadyReferred) {
      res.json({ ok: true, redeemed: false, reason: "already_referred" });
      return;
    }

    await db.insert(referralConversionsTable).values({
      referrerUserId: referralCode.userId,
      referredUserId: userId,
      codeUsed: code.trim(),
      signedUpAt: now,
      firstPaidAt: null,
      freeMonthCredited: false,
    });

    res.json({ ok: true, redeemed: true });
  } catch (err) {
    logger.error({ err, userId, code }, "POST /referrals/redeem failed");
    res.json({ ok: true, redeemed: false });
  }
});

// ── GET /api/referrals/dashboard ──────────────────────────────────────────────

router.get("/referrals/dashboard", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;

  // Check payment eligibility.
  const [payment] = await db
    .select({ id: paymentEventsTable.id })
    .from(paymentEventsTable)
    .where(and(eq(paymentEventsTable.userId, userId), eq(paymentEventsTable.status, "success")))
    .limit(1);

  if (!payment) {
    res.json({
      hasAccess: false,
      code: null,
      link: null,
      expiresAt: null,
      totalSent: 0,
      totalConverted: 0,
      lifetimeEarned: 0,
      balanceAvailable: 0,
      currentTier: 1,
      conversionsToNextTier: null,
    });
    return;
  }

  const now = new Date();

  // Active code.
  const [activeCode] = await db
    .select()
    .from(referralCodesTable)
    .where(
      and(
        eq(referralCodesTable.userId, userId),
        eq(referralCodesTable.expired, false),
        gt(referralCodesTable.expiresAt, now),
      ),
    )
    .limit(1);

  // All conversions.
  const conversions = await db
    .select()
    .from(referralConversionsTable)
    .where(eq(referralConversionsTable.referrerUserId, userId));

  const totalSent = conversions.length;
  const totalConverted = conversions.filter((c) => c.firstPaidAt !== null).length;

  // Free month balance.
  const [balance] = await db
    .select()
    .from(freeMonthBalanceTable)
    .where(eq(freeMonthBalanceTable.userId, userId))
    .limit(1);

  const lifetimeEarned = balance?.lifetimeEarned ?? 0;
  const balanceAvailable = balance?.balanceMonths ?? 0;

  // Tier calculation.
  let currentTier: 1 | 2 | 3 = 1;
  let conversionsToNextTier: number | null = null;
  if (lifetimeEarned < 4) {
    currentTier = 1;
    conversionsToNextTier = 4 - lifetimeEarned;
  } else if (lifetimeEarned < 7) {
    currentTier = 2;
    conversionsToNextTier = 7 - lifetimeEarned;
  } else {
    currentTier = 3;
    conversionsToNextTier = null;
  }

  res.json({
    hasAccess: true,
    code: activeCode?.code ?? null,
    link: activeCode ? `${REFERRAL_LINK_BASE}/${activeCode.code}` : null,
    expiresAt: activeCode?.expiresAt?.toISOString() ?? null,
    totalSent,
    totalConverted,
    lifetimeEarned,
    balanceAvailable,
    currentTier,
    conversionsToNextTier,
  });
});

export default router;
