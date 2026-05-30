import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const googleTokensTable = pgTable("google_tokens", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  scope: text("scope"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GoogleToken = typeof googleTokensTable.$inferSelect;
