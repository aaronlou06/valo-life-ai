import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const personalDatesTable = pgTable("personal_dates", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  month: integer("month").notNull(),
  day: integer("day").notNull(),
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PersonalDate = typeof personalDatesTable.$inferSelect;
export type InsertPersonalDate = typeof personalDatesTable.$inferInsert;
