import { eq, and, lt } from "drizzle-orm";
import { db, subscriptionsTable } from "@workspace/db";
import { logger } from "./logger";

// Midnight UTC nightly job: advance subscription states on schedule.
// trialing → grace (if trialEndAt is past)
// grace → expired (if graceEndsAt is past)
// canceled → expired (if currentPeriodEnd is past)

async function runSubscriptionStateJob(): Promise<void> {
  const now = new Date();

  // trialing → grace
  const trialingToGrace = await db
    .select({ id: subscriptionsTable.id, trialEndAt: subscriptionsTable.trialEndAt })
    .from(subscriptionsTable)
    .where(
      and(
        eq(subscriptionsTable.status, "trialing"),
        lt(subscriptionsTable.trialEndAt, now),
      ),
    );

  for (const sub of trialingToGrace) {
    const graceEndsAt = sub.trialEndAt
      ? new Date(sub.trialEndAt.getTime() + 48 * 60 * 60 * 1000)
      : new Date(now.getTime() + 48 * 60 * 60 * 1000);

    await db
      .update(subscriptionsTable)
      .set({ status: "grace", graceEndsAt })
      .where(eq(subscriptionsTable.id, sub.id));
  }

  if (trialingToGrace.length > 0) {
    logger.info({ count: trialingToGrace.length }, "Subscription job: trialing → grace");
  }

  // grace → expired
  const graceToExpired = await db
    .select({ id: subscriptionsTable.id })
    .from(subscriptionsTable)
    .where(
      and(
        eq(subscriptionsTable.status, "grace"),
        lt(subscriptionsTable.graceEndsAt, now),
      ),
    );

  for (const sub of graceToExpired) {
    await db
      .update(subscriptionsTable)
      .set({ status: "expired" })
      .where(eq(subscriptionsTable.id, sub.id));
  }

  if (graceToExpired.length > 0) {
    logger.info({ count: graceToExpired.length }, "Subscription job: grace → expired");
  }

  // canceled → expired (when currentPeriodEnd has passed)
  const canceledToExpired = await db
    .select({ id: subscriptionsTable.id })
    .from(subscriptionsTable)
    .where(
      and(
        eq(subscriptionsTable.status, "canceled"),
        lt(subscriptionsTable.currentPeriodEnd, now),
      ),
    );

  for (const sub of canceledToExpired) {
    await db
      .update(subscriptionsTable)
      .set({ status: "expired" })
      .where(eq(subscriptionsTable.id, sub.id));
  }

  if (canceledToExpired.length > 0) {
    logger.info({ count: canceledToExpired.length }, "Subscription job: canceled → expired");
  }
}

export function startSubscriptionStateJob(): void {
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  let lastRunDate = "";

  setInterval(() => {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const today = now.toISOString().split("T")[0]!;

    // Run at midnight UTC (hour 0), once per day.
    if (utcHour === 0 && lastRunDate !== today) {
      lastRunDate = today;
      void runSubscriptionStateJob().catch((err: unknown) => {
        logger.error({ err }, "Subscription state job failed");
      });
    }
  }, FIVE_MINUTES_MS);

  logger.info("Subscription state job scheduled (midnight UTC, 5min poll)");
}
