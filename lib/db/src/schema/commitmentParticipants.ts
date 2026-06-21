import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sharedCommitmentsTable } from "./sharedCommitments";
import { buddyRelationshipsTable } from "./buddyRelationships";

/**
 * commitment_participants — one row per (commitment, actor) pair.
 *
 * This is the generalization point of the spine: adding an AI coach or human
 * coach in a later stage is an INSERT here with a different participantType, no
 * schema migration. Buddy-specific invite state lives in buddy_relationships.
 *
 *   - participantType: 'buddy' | 'ai_coach' | 'human_coach'.
 *   - buddyRelationshipId is set only for 'buddy' rows; null for coach rows.
 *   - shareScope governs what the participant may see:
 *       'streak_only' — streak count + pre-computed onTrackStatus only
 *       'summary'     — above + completion rate + streak target
 *       'full'        — above + individual occurrence dates
 *     The owner always sees exactly what is shared.
 *
 * STAGE 1 NOTE: the unique index below treats NULLs as distinct, so it will NOT
 * prevent duplicate ai_coach rows (null buddyRelationshipId) on one commitment.
 * When the coach participant lands, switch to NULLS NOT DISTINCT or a partial
 * unique index. No action needed in Stage 0 — no ai_coach rows are written yet.
 */
export const commitmentParticipantsTable = pgTable(
  "commitment_participants",
  {
    id: serial("id").primaryKey(),
    commitmentId: integer("commitment_id")
      .notNull()
      .references(() => sharedCommitmentsTable.id, { onDelete: "cascade" }),
    participantType: text("participant_type").notNull(),
    buddyRelationshipId: integer("buddy_relationship_id").references(
      () => buddyRelationshipsTable.id,
      { onDelete: "set null" },
    ),
    shareScope: text("share_scope").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("commitment_participants_unique").on(
      t.commitmentId,
      t.participantType,
      t.buddyRelationshipId,
    ),
    index("commitment_participants_buddy_rel_idx").on(t.buddyRelationshipId),
    check(
      "commitment_participants_type_valid",
      sql`${t.participantType} in ('buddy', 'ai_coach', 'human_coach')`,
    ),
    check(
      "commitment_participants_scope_valid",
      sql`${t.shareScope} in ('streak_only', 'summary', 'full')`,
    ),
  ],
);

export const insertCommitmentParticipantSchema = createInsertSchema(
  commitmentParticipantsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCommitmentParticipant = z.infer<typeof insertCommitmentParticipantSchema>;
export type CommitmentParticipant = typeof commitmentParticipantsTable.$inferSelect;
