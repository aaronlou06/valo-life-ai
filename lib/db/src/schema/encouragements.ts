import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sharedCommitmentsTable } from "./sharedCommitments";

/**
 * encouragements — one model for buddy support, preset cheers, and free-text
 * chat. Stage 0 surfaces only the single-tap 'support' type; preset and text
 * are schema-ready for later.
 *
 *   - senderType: 'user' | 'ai'. senderId is the userId for 'user' rows and
 *     null for 'ai' rows (the AI coach has no user account), so no FK on sender.
 *   - messageType: 'support' (one-tap "I see you") | 'preset' | 'text'.
 *   - body is null for 'support'; populated for 'preset'/'text'.
 *   - sentDate (YYYY-MM-DD, computed in the sender's local timezone at write
 *     time) backs the once-a-day rate limit; storing the date explicitly avoids
 *     server-timezone ambiguity that a date(sent_at) expression would introduce.
 *
 * The partial unique index enforces: one 'support' tap per buddy (senderId) per
 * commitment per calendar day.
 */
export const encouragementsTable = pgTable(
  "encouragements",
  {
    id: serial("id").primaryKey(),
    commitmentId: integer("commitment_id")
      .notNull()
      .references(() => sharedCommitmentsTable.id, { onDelete: "cascade" }),
    senderType: text("sender_type").notNull(),
    senderId: text("sender_id"),
    recipientId: text("recipient_id").notNull(),
    messageType: text("message_type").notNull(),
    body: text("body"),
    sentDate: text("sent_date").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("encouragements_commitment_sent_idx").on(t.commitmentId, t.sentAt),
    index("encouragements_recipient_sent_idx").on(t.recipientId, t.sentAt),
    uniqueIndex("encouragements_support_once_per_day")
      .on(t.commitmentId, t.senderId, t.sentDate)
      .where(sql`${t.senderType} = 'user' and ${t.messageType} = 'support'`),
    check(
      "encouragements_sender_type_valid",
      sql`${t.senderType} in ('user', 'ai')`,
    ),
    check(
      "encouragements_message_type_valid",
      sql`${t.messageType} in ('support', 'preset', 'text')`,
    ),
  ],
);

export const insertEncouragementSchema = createInsertSchema(encouragementsTable).omit({
  id: true,
  sentAt: true,
});
export type InsertEncouragement = z.infer<typeof insertEncouragementSchema>;
export type Encouragement = typeof encouragementsTable.$inferSelect;
