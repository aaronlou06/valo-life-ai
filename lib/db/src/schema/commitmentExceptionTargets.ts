import {
  pgTable,
  serial,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { commitmentExceptionsTable } from "./commitmentExceptions";
import { sharedCommitmentsTable } from "./sharedCommitments";

/**
 * commitment_exception_targets — junction rows for scope 'several' exceptions,
 * listing exactly which commitments a partial pause covers.
 *
 * Only read when commitment_exceptions.scope = 'several'. Scope 'one' encodes
 * its single target inline on the exception (no junction row), and scope 'all'
 * needs no rows at all. Stage 0 writes no rows here (UI ships 'one' + 'all'),
 * but the table exists so 'several' is a pure additive feature later.
 */
export const commitmentExceptionTargetsTable = pgTable(
  "commitment_exception_targets",
  {
    id: serial("id").primaryKey(),
    exceptionId: integer("exception_id")
      .notNull()
      .references(() => commitmentExceptionsTable.id, { onDelete: "cascade" }),
    commitmentId: integer("commitment_id")
      .notNull()
      .references(() => sharedCommitmentsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("commitment_exception_targets_unique").on(t.exceptionId, t.commitmentId),
  ],
);

export const insertCommitmentExceptionTargetSchema = createInsertSchema(
  commitmentExceptionTargetsTable,
).omit({ id: true, createdAt: true });
export type InsertCommitmentExceptionTarget = z.infer<
  typeof insertCommitmentExceptionTargetSchema
>;
export type CommitmentExceptionTarget = typeof commitmentExceptionTargetsTable.$inferSelect;
