import { pgTable, serial, text, integer, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";

export const paymentStatusEnum = pgEnum("payment_status", ["success", "failed", "refunded"]);

export const paymentEventsTable = pgTable("payment_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  helcimTransactionId: text("helcim_transaction_id").notNull().unique(),
  amountCents: integer("amount_cents").notNull(),
  status: paymentStatusEnum("status").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  freeMonthApplied: boolean("free_month_applied").notNull().default(false),
});

export type PaymentEvent = typeof paymentEventsTable.$inferSelect;
export type InsertPaymentEvent = typeof paymentEventsTable.$inferInsert;
