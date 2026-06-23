import { pgTable, serial, text, timestamp, numeric, unique } from "drizzle-orm/pg-core";

// Stores individual health metrics pulled from wearable integrations.
// Each row is one metric for one user on one date from one source.
// The unique constraint on (userId, source, date, metric) allows idempotent upserts.
export const wearableDataTable = pgTable(
  "wearable_data",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    source: text("source").notNull(), // 'oura' | 'whoop' | 'garmin'
    date: text("date").notNull(),     // YYYY-MM-DD local calendar date
    metric: text("metric").notNull(), // e.g. 'sleep_score', 'hrv_avg_ms', 'recovery_score'
    value: numeric("value").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("wearable_data_user_source_date_metric_unique").on(
      t.userId,
      t.source,
      t.date,
      t.metric,
    ),
  ],
);

export type WearableData = typeof wearableDataTable.$inferSelect;
