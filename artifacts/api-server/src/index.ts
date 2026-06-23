import app from "./app";
import { logger } from "./lib/logger";
import { startOutboundCallScheduler } from "./lib/outboundCaller";
import { startKeepAlive } from "./lib/keepAlive";
import { startNightlyInsightsJob } from "./lib/nightlyInsights";
import { startNightlyAggregationJob } from "./lib/nightlyAggregation";
import { startCalendarSyncJob } from "./lib/calendarSyncJob";
import { startWeeklyRecapJob } from "./lib/weeklyRecapJob";
import { startSubscriptionStateJob } from "./lib/subscriptionJob";
import { startWearableSyncJob } from "./lib/wearableSyncJob";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startOutboundCallScheduler();
  startKeepAlive(port);
  startNightlyInsightsJob();
  startNightlyAggregationJob();
  startCalendarSyncJob();
  startWeeklyRecapJob();
  startSubscriptionStateJob();
  startWearableSyncJob();
});
