import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { proposedActionsTable } from "./proposedActions";

/**
 * action_log — the audit + undo trail for executed agentic actions.
 *
 * Every executed action writes one row here capturing `beforeSnapshot`: enough
 * prior state to reverse the mutation. `undo` restores from that snapshot and
 * flips `status` to "undone". `proposedActionId` is nullable so directly-invoked
 * actions (without a surfaced proposal) can still be logged and undone.
 */
export const actionLogTable = pgTable("action_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  proposedActionId: integer("proposed_action_id").references(() => proposedActionsTable.id),
  actionType: text("action_type").notNull(),
  parameters: jsonb("parameters").notNull(),
  beforeSnapshot: jsonb("before_snapshot").notNull(),
  status: text("status").notNull().default("executed"),
  executedAt: timestamp("executed_at", { withTimezone: true }).notNull().defaultNow(),
  undoneAt: timestamp("undone_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ActionLogEntry = typeof actionLogTable.$inferSelect;
export type InsertActionLogEntry = typeof actionLogTable.$inferInsert;
