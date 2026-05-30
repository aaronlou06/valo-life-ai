import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const googleCalendarSelectionsTable = pgTable("google_calendar_selections", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  calendarId: text("calendar_id").notNull(),
  calendarName: text("calendar_name").notNull(),
  calendarColor: text("calendar_color"),
  isSelected: boolean("is_selected").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GoogleCalendarSelection = typeof googleCalendarSelectionsTable.$inferSelect;
