import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Stores hashed, single-use, time-limited password reset codes.
// Follows the text("user_id") convention used elsewhere — no real FK to
// users.id (which is serial), to stay consistent with the rest of the schema.
export const passwordResetTokensTable = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PasswordResetToken = typeof passwordResetTokensTable.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokensTable.$inferInsert;
