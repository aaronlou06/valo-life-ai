import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const referralCodesTable = pgTable("referral_codes", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  code: text("code").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  expired: boolean("expired").notNull().default(false),
});

export type ReferralCode = typeof referralCodesTable.$inferSelect;
export type InsertReferralCode = typeof referralCodesTable.$inferInsert;
