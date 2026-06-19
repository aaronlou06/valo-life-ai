import {
  eq,
  inArray,
  is,
  getTableColumns,
  getTableName,
  type Column,
} from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as dbExports from "@workspace/db";
import {
  db,
  usersTable,
  callsTable,
  googleTokensTable,
  workoutSessionsTable,
  workoutTemplatesTable,
  workoutProgramsTable,
  workoutSetLogsTable,
  workoutHrSamplesTable,
  workoutTemplateExercisesTable,
  workoutProgramDaysTable,
  workoutSummariesTable,
  workoutPersonalRecordsTable,
  exercisesTable,
  actionLogTable,
  proposedActionsTable,
} from "@workspace/db";
import { decrypt } from "./tokenCrypto";
import { logger } from "./logger";

// Tables handled explicitly below (the workout subtree + custom exercises) or
// intentionally preserved (the `users` root, and the global `feature_flags`
// table which is not per-user). Every OTHER table carrying a `user_id` column is
// deleted generically via live-schema reflection, so any future per-user table
// is covered automatically without editing this module.
const EXPLICIT_OR_PRESERVED = new Set<string>([
  "users",
  "feature_flags",
  "exercises",
  "workout_sessions",
  "workout_templates",
  "workout_programs",
  "workout_summaries",
  "workout_personal_records",
  "workout_set_logs",
  "workout_hr_samples",
  "workout_template_exercises",
  "workout_program_days",
  // action_log.proposed_action_id -> proposed_actions.id has a RESTRICT (default)
  // FK, so these two must be deleted child-before-parent, not in arbitrary
  // reflection order. Handled explicitly below.
  "action_log",
  "proposed_actions",
]);

interface UserKeyedTable {
  table: PgTable;
  userColumn: Column;
  name: string;
}

// Reflect over the live Drizzle schema and return every table that has a
// `user_id` column and is not handled explicitly.
function getGenericUserTables(): UserKeyedTable[] {
  const out: UserKeyedTable[] = [];
  for (const value of Object.values(dbExports)) {
    if (!is(value, PgTable)) continue;
    const name = getTableName(value);
    if (EXPLICIT_OR_PRESERVED.has(name)) continue;
    const columns = getTableColumns(value);
    const userColumn = Object.values(columns).find((c) => c.name === "user_id");
    if (userColumn) out.push({ table: value, userColumn, name });
  }
  return out;
}

// Revoke the user's Google OAuth grant at Google's side before the local token
// rows are deleted. Best-effort: a network error or already-invalid token must
// not block account deletion (an App Store requirement), but is logged.
async function revokeGoogleGrant(userId: string): Promise<void> {
  const [row] = await db
    .select()
    .from(googleTokensTable)
    .where(eq(googleTokensTable.userId, userId));
  if (!row) return;

  // Revoking the refresh token revokes the entire grant (all derived access tokens).
  let token: string;
  try {
    token = decrypt(row.refreshTokenEnc);
  } catch (err) {
    logger.warn({ userId, err }, "deleteAccount: failed to decrypt Google refresh token — skipping revoke");
    return;
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
    if (res.ok) {
      logger.info({ userId }, "deleteAccount: Google grant revoked");
    } else {
      const body = await res.text().catch(() => "(unreadable)");
      // 400 invalid_token means the grant is already invalid — effectively revoked.
      logger.warn({ userId, status: res.status, body }, "deleteAccount: Google revoke returned non-OK");
    }
  } catch (err) {
    logger.warn({ userId, err }, "deleteAccount: Google revoke request failed");
  }
}

// Delete the user's Vapi-hosted calls/recordings/transcripts via Vapi's
// call-deletion API (DELETE https://api.vapi.ai/call/{id}). Best-effort per
// call; if the API key is missing the limitation is surfaced loudly in the logs
// rather than silently skipped.
async function deleteVapiCalls(userId: string): Promise<void> {
  const apiKey = process.env["VAPI_API_KEY"];
  const rows = await db
    .select({ vapiCallId: callsTable.vapiCallId })
    .from(callsTable)
    .where(eq(callsTable.userId, userId));
  const ids = rows.map((r) => r.vapiCallId).filter((v): v is string => !!v);

  if (ids.length === 0) return;

  if (!apiKey) {
    logger.warn(
      { userId, callCount: ids.length },
      "deleteAccount: VAPI_API_KEY not set — Vapi-hosted call data could NOT be deleted on Vapi's side",
    );
    return;
  }

  let failed = 0;
  for (const id of ids) {
    try {
      const res = await fetch(`https://api.vapi.ai/call/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      // 404 means the call no longer exists on Vapi — treat as already deleted.
      if (!res.ok && res.status !== 404) {
        failed++;
        const body = await res.text().catch(() => "(unreadable)");
        logger.warn({ userId, vapiCallId: id, status: res.status, body }, "deleteAccount: Vapi call deletion non-OK");
      }
    } catch (err) {
      failed++;
      logger.warn({ userId, vapiCallId: id, err }, "deleteAccount: Vapi call deletion failed");
    }
  }
  logger.info({ userId, attempted: ids.length, failed }, "deleteAccount: Vapi call deletion attempted");
}

/**
 * Permanently and exhaustively delete a single user's entire footprint.
 *
 * Order of operations:
 *   1. External revocations (Google grant, Vapi calls) — performed first, while
 *      the tokens/ids still exist, so a later DB failure can never orphan a live
 *      external grant.
 *   2. A single DB transaction that removes the workout subtree (children before
 *      parents, respecting the exercise_id RESTRICT edges), the user's custom
 *      exercises (system rows with user_id IS NULL are preserved), every other
 *      per-user table discovered from the live schema, and finally the `users`
 *      row. Any failure rolls the whole transaction back — never a partial delete.
 *
 * Deleting the `users` row removes the session token, so no stale token can be
 * reused afterward.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  // 1) External revocations FIRST.
  await revokeGoogleGrant(userId);
  await deleteVapiCalls(userId);

  const genericTables = getGenericUserTables();

  // 2) Single atomic transaction.
  await db.transaction(async (tx) => {
    // Workout subtree: children before parents, respecting exercise_id RESTRICT.
    const [sessions, templates, programs] = await Promise.all([
      tx.select({ id: workoutSessionsTable.id }).from(workoutSessionsTable).where(eq(workoutSessionsTable.userId, userId)),
      tx.select({ id: workoutTemplatesTable.id }).from(workoutTemplatesTable).where(eq(workoutTemplatesTable.userId, userId)),
      tx.select({ id: workoutProgramsTable.id }).from(workoutProgramsTable).where(eq(workoutProgramsTable.userId, userId)),
    ]);
    const sessionIds = sessions.map((s) => s.id);
    const templateIds = templates.map((t) => t.id);
    const programIds = programs.map((p) => p.id);

    if (sessionIds.length > 0) {
      await tx.delete(workoutSetLogsTable).where(inArray(workoutSetLogsTable.sessionId, sessionIds));
      await tx.delete(workoutHrSamplesTable).where(inArray(workoutHrSamplesTable.sessionId, sessionIds));
    }
    // PRs and summaries are keyed by user_id directly. PRs reference exercise_id
    // with RESTRICT, so they must go before the user's custom exercises.
    await tx.delete(workoutPersonalRecordsTable).where(eq(workoutPersonalRecordsTable.userId, userId));
    await tx.delete(workoutSummariesTable).where(eq(workoutSummariesTable.userId, userId));
    if (templateIds.length > 0) {
      await tx.delete(workoutTemplateExercisesTable).where(inArray(workoutTemplateExercisesTable.templateId, templateIds));
    }
    if (programIds.length > 0) {
      await tx.delete(workoutProgramDaysTable).where(inArray(workoutProgramDaysTable.programId, programIds));
    }
    await tx.delete(workoutSessionsTable).where(eq(workoutSessionsTable.userId, userId));
    await tx.delete(workoutTemplatesTable).where(eq(workoutTemplatesTable.userId, userId));
    await tx.delete(workoutProgramsTable).where(eq(workoutProgramsTable.userId, userId));
    // Custom exercises only — never the shared system rows (user_id IS NULL).
    await tx.delete(exercisesTable).where(eq(exercisesTable.userId, userId));

    // action_log references proposed_actions (RESTRICT) — child before parent.
    await tx.delete(actionLogTable).where(eq(actionLogTable.userId, userId));
    await tx.delete(proposedActionsTable).where(eq(proposedActionsTable.userId, userId));

    // Every other per-user table, discovered from the live schema.
    for (const { table, userColumn } of genericTables) {
      await tx.delete(table).where(eq(userColumn, userId));
    }

    // The user row last — this removes the session token along with it.
    await tx.delete(usersTable).where(eq(usersTable.id, Number(userId)));
  });

  logger.info({ userId, genericTableCount: genericTables.length }, "deleteAccount: user fully deleted");
}
