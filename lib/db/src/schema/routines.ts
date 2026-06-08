import { pgTable, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const routinesTable = pgTable("routines", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  days: text("days").notNull().default("[]"),
  scheduledTime: text("scheduled_time"),
  color: text("color").notNull().default("#C17B3F"),
  activities: text("activities").default("[]"),
  isDisplayedOnCalendar: boolean("is_displayed_on_calendar").notNull().default(true),
  recurrenceType: text("recurrence_type").notNull().default("none"),
  recurrenceInterval: integer("recurrence_interval"),
  recurrenceEndDate: text("recurrence_end_date"),
  skippedDates: text("skipped_dates"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type DbRoutine = typeof routinesTable.$inferSelect;
