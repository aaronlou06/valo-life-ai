import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const routinesTable = pgTable("routines", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  days: text("days").notNull().default("[]"),
  scheduledTime: text("scheduled_time"),
  color: text("color").notNull().default("#C17B3F"),
  activities: text("activities").default("[]"),
  isDisplayedOnCalendar: boolean("is_displayed_on_calendar").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type DbRoutine = typeof routinesTable.$inferSelect;
