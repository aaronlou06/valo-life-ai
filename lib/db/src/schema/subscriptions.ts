import { pgTable, serial, text, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "grace",
  "active",
  "canceled",
  "expired",
]);

export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  status: subscriptionStatusEnum("status").notNull().default("trialing"),
  trialStartAt: timestamp("trial_start_at", { withTimezone: true }),
  trialEndAt: timestamp("trial_end_at", { withTimezone: true }),
  graceEndsAt: timestamp("grace_ends_at", { withTimezone: true }),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  cancelReason: text("cancel_reason"),
  cancelSaveAttempt: text("cancel_save_attempt"),
  saveDiscountApplied: boolean("save_discount_applied").notNull().default(false),
  hadTrial: boolean("had_trial").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Subscription = typeof subscriptionsTable.$inferSelect;
export type InsertSubscription = typeof subscriptionsTable.$inferInsert;
