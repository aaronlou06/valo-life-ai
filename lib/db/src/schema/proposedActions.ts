import { pgTable, serial, text, real, jsonb, timestamp } from "drizzle-orm/pg-core";

/**
 * proposed_actions — the agentic "suggest" surface.
 *
 * Each row is a concrete, confirmable action Valo proposes to the user (e.g.
 * "move Leg Day to Thursday"). The suggestion engine writes these as `pending`;
 * the Home action card reads pending, non-expired rows; the user's tap moves the
 * row to accepted/modified/declined/executed/expired.
 *
 * `parameters` is the typed parameter shape for the action handler keyed by
 * `actionType` in the action registry (see api-server lib/actions).
 */
export const proposedActionsTable = pgTable("proposed_actions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  actionType: text("action_type").notNull(),
  parameters: jsonb("parameters").notNull(),
  rationale: text("rationale").notNull(),
  lifeArea: text("life_area"),
  confidence: real("confidence"),
  status: text("status").notNull().default("pending"),
  surfacedAt: timestamp("surfaced_at", { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProposedAction = typeof proposedActionsTable.$inferSelect;
export type InsertProposedAction = typeof proposedActionsTable.$inferInsert;
