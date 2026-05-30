import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const telemetryEventsTable = pgTable("telemetry_events", {
  id: serial("id").primaryKey(),
  event: text("event").notNull(),
  userId: text("user_id"),
  sessionId: text("session_id"),
  props: text("props"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TelemetryEvent = typeof telemetryEventsTable.$inferSelect;
export type InsertTelemetryEvent = typeof telemetryEventsTable.$inferInsert;
