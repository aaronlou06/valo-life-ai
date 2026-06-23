import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const freeMonthBalanceTable = pgTable("free_month_balance", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  balanceMonths: integer("balance_months").notNull().default(0),
  lifetimeEarned: integer("lifetime_earned").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type FreeMonthBalance = typeof freeMonthBalanceTable.$inferSelect;
export type InsertFreeMonthBalance = typeof freeMonthBalanceTable.$inferInsert;
