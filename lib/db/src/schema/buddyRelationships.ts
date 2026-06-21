import {
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * buddy_relationships — the bilateral invite/accept link between two app users.
 *
 * Deliberately separate from commitment_participants so the participant model
 * generalizes ({buddy, ai_coach, human_coach}) without dragging buddy-specific
 * invite machinery into every participant type. An AI coach is system-joined,
 * not invited, so it never touches this table.
 *
 *   - inviteeId is null while the invite is pending; set on accept.
 *   - inviteCode is an 8-char shareable code, single-use (consumed on accept).
 *   - expiresAt is set 14 days out at creation and nulled when consumed; the
 *     API rejects codes past expiry.
 *   - status: 'pending' (awaiting accept) | 'active' (accepted) | 'blocked'.
 */
export const buddyRelationshipsTable = pgTable(
  "buddy_relationships",
  {
    id: serial("id").primaryKey(),
    inviterId: text("inviter_id").notNull(),
    inviteeId: text("invitee_id"),
    inviteCode: text("invite_code").notNull(),
    status: text("status").notNull().default("pending"),
    blockedBy: text("blocked_by"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("buddy_relationships_invite_code_unique").on(t.inviteCode),
    index("buddy_relationships_invitee_idx").on(t.inviteeId),
    index("buddy_relationships_inviter_idx").on(t.inviterId),
    check(
      "buddy_relationships_status_valid",
      sql`${t.status} in ('pending', 'active', 'blocked')`,
    ),
  ],
);

export const insertBuddyRelationshipSchema = createInsertSchema(buddyRelationshipsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBuddyRelationship = z.infer<typeof insertBuddyRelationshipSchema>;
export type BuddyRelationship = typeof buddyRelationshipsTable.$inferSelect;
