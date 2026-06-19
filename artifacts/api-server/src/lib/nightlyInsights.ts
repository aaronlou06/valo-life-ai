import { eq, and } from "drizzle-orm";
import { db, usersTable, insightsTable } from "@workspace/db";
import { generateDailyInsights } from "./insightsEngine";
import { generateActionProposals } from "./generateActionProposals";
import { logger } from "./logger";

async function runNightlyInsights(): Promise<void> {
  const today = new Date().toISOString().split("T")[0]!;

  const users = await db.select({ id: usersTable.id }).from(usersTable);

  for (const user of users) {
    const userId = user.id.toString();
    const existing = await db
      .select({ id: insightsTable.id })
      .from(insightsTable)
      .where(and(eq(insightsTable.userId, userId), eq(insightsTable.date, today)))
      .limit(1);

    if (existing.length === 0) {
      try {
        const rows = await generateDailyInsights(userId, today);
        await db.insert(insightsTable).values(
          rows.map((r) => ({
            userId,
            date: today,
            label: r.label,
            content: r.content,
            followUpQuestion: r.followUpQuestion ?? null,
          })),
        );
        logger.info({ userId }, "Nightly insights generated");
      } catch (err) {
        logger.error({ err, userId }, "Nightly insights generation failed for user");
      }
    }

    // Agentic Suggest & Act: generate proposed actions (idempotent per run).
    try {
      await generateActionProposals(userId);
    } catch (err) {
      logger.error({ err, userId }, "Action proposal generation failed for user");
    }
  }
}

export function startNightlyInsightsJob(): void {
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  let lastRunDate = "";

  setInterval(() => {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const today = now.toISOString().split("T")[0]!;

    if (utcHour === 3 && lastRunDate !== today) {
      lastRunDate = today;
      logger.info("Nightly insights job triggered (3AM UTC)");
      void runNightlyInsights().catch((err: unknown) => {
        logger.error({ err }, "Nightly insights job failed");
      });
    }
  }, FIVE_MINUTES_MS);

  logger.info("Nightly insights job scheduled (3AM UTC, 5min poll)");
}
