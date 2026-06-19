import { eq, inArray, is, getTableColumns, getTableName } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as dbExports from "@workspace/db";
import {
  db,
  usersTable,
  exercisesTable,
  workoutSessionsTable,
  workoutTemplatesTable,
  workoutProgramsTable,
  workoutSetLogsTable,
  workoutHrSamplesTable,
  workoutTemplateExercisesTable,
  workoutProgramDaysTable,
  workoutSummariesTable,
  workoutPersonalRecordsTable,
} from "@workspace/db";

// Tables handled separately or intentionally omitted from the export.
// - users: selected with explicit field list (no passwordHash / sessionToken)
// - google_tokens: OAuth credentials — not user data, must not be exported
// - feature_flags: global config, no per-user rows
// - exercises: only user-created rows; fetched separately to exclude system rows
// - workout_*: fetched together so transitive tables (set_logs etc.) can be
//   joined to parent IDs without a user_id column of their own
const EXPORT_EXCLUDED = new Set<string>([
  "users",
  "google_tokens",
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
]);

// snake_case → camelCase for JSON collection keys
function toCamelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

// Reflect over the live schema and return every per-user table not handled
// explicitly. Keeps export coverage in sync with the deletion module
// automatically as tables are added.
function getGenericUserTables(): Array<{ table: PgTable; userColName: string; key: string }> {
  const out = [];
  for (const value of Object.values(dbExports)) {
    if (!is(value, PgTable)) continue;
    const name = getTableName(value);
    if (EXPORT_EXCLUDED.has(name)) continue;
    const columns = getTableColumns(value);
    const userColumn = Object.values(columns).find((c) => c.name === "user_id");
    if (userColumn) {
      out.push({ table: value, userColName: userColumn.name, key: toCamelCase(name) });
    }
  }
  return out;
}

export interface UserExport {
  exportedAt: string;
  email: string;
  account: { email: string; createdAt: Date | string | null };
  workoutSessions: unknown[];
  workoutSetLogs: unknown[];
  workoutHrSamples: unknown[];
  workoutTemplates: unknown[];
  workoutTemplateExercises: unknown[];
  workoutPrograms: unknown[];
  workoutProgramDays: unknown[];
  workoutSummaries: unknown[];
  workoutPersonalRecords: unknown[];
  customExercises: unknown[];
  [collection: string]: unknown;
}

export async function exportUserData(userId: string): Promise<UserExport> {
  const genericTables = getGenericUserTables();

  // Fetch the user record, explicitly excluding credential columns.
  const [userRow] = await db
    .select({ email: usersTable.email, createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(eq(usersTable.id, Number(userId)))
    .limit(1);

  // Fetch all generic per-user collections in parallel.
  const genericResults = await Promise.all(
    genericTables.map(({ table, key }) => {
      // Drizzle's `eq` needs the actual column object; re-derive from the table.
      const cols = getTableColumns(table);
      const userCol = Object.values(cols).find((c) => c.name === "user_id")!;
      return db
        .select()
        .from(table)
        .where(eq(userCol, userId))
        .then((rows) => ({ key, rows }));
    }),
  );

  // Workout subtree: fetch parent tables first, then transitive children by ID.
  const [sessions, templates, programs, summaries, prs, customExercises] = await Promise.all([
    db.select().from(workoutSessionsTable).where(eq(workoutSessionsTable.userId, userId)),
    db.select().from(workoutTemplatesTable).where(eq(workoutTemplatesTable.userId, userId)),
    db.select().from(workoutProgramsTable).where(eq(workoutProgramsTable.userId, userId)),
    db.select().from(workoutSummariesTable).where(eq(workoutSummariesTable.userId, userId)),
    db.select().from(workoutPersonalRecordsTable).where(eq(workoutPersonalRecordsTable.userId, userId)),
    db.select().from(exercisesTable).where(eq(exercisesTable.userId, userId)),
  ]);

  const sessionIds = sessions.map((s) => s.id);
  const templateIds = templates.map((t) => t.id);
  const programIds = programs.map((p) => p.id);

  const [setLogs, hrSamples, templateExercises, programDays] = await Promise.all([
    sessionIds.length
      ? db.select().from(workoutSetLogsTable).where(inArray(workoutSetLogsTable.sessionId, sessionIds))
      : Promise.resolve([]),
    sessionIds.length
      ? db.select().from(workoutHrSamplesTable).where(inArray(workoutHrSamplesTable.sessionId, sessionIds))
      : Promise.resolve([]),
    templateIds.length
      ? db.select().from(workoutTemplateExercisesTable).where(inArray(workoutTemplateExercisesTable.templateId, templateIds))
      : Promise.resolve([]),
    programIds.length
      ? db.select().from(workoutProgramDaysTable).where(inArray(workoutProgramDaysTable.programId, programIds))
      : Promise.resolve([]),
  ]);

  // Assemble the document: fixed fields first, then generic collections.
  const doc: UserExport = {
    exportedAt: new Date().toISOString(),
    email: userRow?.email ?? "",
    account: userRow ?? { email: "", createdAt: null },
    workoutSessions: sessions,
    workoutSetLogs: setLogs,
    workoutHrSamples: hrSamples,
    workoutTemplates: templates,
    workoutTemplateExercises: templateExercises,
    workoutPrograms: programs,
    workoutProgramDays: programDays,
    workoutSummaries: summaries,
    workoutPersonalRecords: prs,
    customExercises,
  };

  for (const { key, rows } of genericResults) {
    doc[key] = rows;
  }

  return doc;
}
