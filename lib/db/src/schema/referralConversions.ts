import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const referralConversionsTable = pgTable("referral_conversions", {
  id: serial("id").primaryKey(),
  referrerUserId: text("referrer_user_id").notNull(),
  referredUserId: text("referred_user_id").notNull().unique(),
  codeUsed: text("code_used").notNull(),
  signedUpAt: timestamp("signed_up_at", { withTimezone: true }).notNull().defaultNow(),
  firstPaidAt: timestamp("first_paid_at", { withTimezone: true }),
  freeMonthCredited: boolean("free_month_credited").notNull().default(false),
});

export type ReferralConversion = typeof referralConversionsTable.$inferSelect;
export type InsertReferralConversion = typeof referralConversionsTable.$inferInsert;
