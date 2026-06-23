import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

export const wearableTokensTable = pgTable(
  "wearable_tokens",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    source: text("source").notNull(), // 'oura' | 'whoop' | 'garmin'
    accessTokenEnc: text("access_token_enc").notNull(),
    // For OAuth 2.0: encrypted refresh token.
    // For Garmin OAuth 1.0a: encrypted access token secret.
    refreshTokenEnc: text("refresh_token_enc").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scope: text("scope"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("wearable_tokens_user_source_unique").on(t.userId, t.source)],
);

export type WearableToken = typeof wearableTokensTable.$inferSelect;
