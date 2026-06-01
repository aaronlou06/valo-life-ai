import { pgTable, serial, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const remindersTable = pgTable("reminders", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  label: text("label").notNull(),
  scheduledTime: text("scheduled_time").notNull(),
  daysOfWeek: text("days_of_week").array(),
  isActive: boolean("is_active").default(true).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Reminder = typeof remindersTable.$inferSelect;
export type InsertReminder = typeof remindersTable.$inferInsert;
