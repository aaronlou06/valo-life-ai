import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const logEntriesTable = pgTable("log_entries", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  date: text("date").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  value: text("value"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLogEntrySchema = createInsertSchema(logEntriesTable).omit({ id: true, createdAt: true });
export type InsertLogEntry = z.infer<typeof insertLogEntrySchema>;
export type LogEntry = typeof logEntriesTable.$inferSelect;
