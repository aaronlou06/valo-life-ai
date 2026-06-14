import { Router, type IRouter } from "express";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import {
  db,
  exercisesTable,
  workoutPersonalRecordsTable,
  workoutSessionsTable,
  workoutSetLogsTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { generateWorkoutCoaching } from "../lib/workoutCoaching";
import { completeWorkoutSession } from "../lib/workoutSummary";

const router: IRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseIntParam(raw: string | string[] | undefined): number | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s) return null;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

/** Returns the ISO Monday (YYYY-MM-DD) for a given date string. */
function isoWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay(); // 0 = Sun
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0]!;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

/**
 * POST /workout/sessions
 * Start a new workout session.
 */
router.post("/workout/sessions", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { name, templateId, date } = req.body as Record<string, unknown>;
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const today = typeof date === "string" ? date : new Date().toISOString().split("T")[0]!;

  const [session] = await db
    .insert(workoutSessionsTable)
    .values({
      userId,
      name,
      date: today,
      status: "in_progress",
      startedAt: new Date(),
      templateId: typeof templateId === "number" ? templateId : null,
    })
    .returning();
  res.status(201).json(session);
});

/**
 * GET /workout/sessions
 * List recent sessions for the authenticated user.
 * Query: ?status=in_progress|completed|abandoned  ?limit=20
 */
router.get("/workout/sessions", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const limit = Math.min(
    parseInt((req.query.limit as string | undefined) ?? "20", 10) || 20,
    100,
  );

  const sessions = await db
    .select()
    .from(workoutSessionsTable)
    .where(
      and(
        eq(workoutSessionsTable.userId, userId),
        status ? eq(workoutSessionsTable.status, status) : undefined,
      ),
    )
    .orderBy(desc(workoutSessionsTable.startedAt))
    .limit(limit);

  res.json(sessions);
});

/**
 * GET /workout/sessions/:id
 * Get a session with its set logs included.
 */
router.get("/workout/sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const id = parseIntParam(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }

  const [session] = await db
    .select()
    .from(workoutSessionsTable)
    .where(and(eq(workoutSessionsTable.id, id), eq(workoutSessionsTable.userId, userId)));
  if (!session) { res.status(404).json({ error: "Not found" }); return; }

  const sets = await db
    .select()
    .from(workoutSetLogsTable)
    .where(eq(workoutSetLogsTable.sessionId, id))
    .orderBy(workoutSetLogsTable.loggedAt);

  res.json({ ...session, sets });
});

/**
 * PATCH /workout/sessions/:id
 * Update mutable session fields (name, status, notes, effort, duration).
 */
router.patch("/workout/sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const id = parseIntParam(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }

  const { name, status, notes, perceivedEffort, durationSec } = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  if (perceivedEffort !== undefined) updates.perceivedEffort = perceivedEffort;
  if (durationSec !== undefined) updates.durationSec = durationSec;

  const [session] = await db
    .update(workoutSessionsTable)
    .set(updates)
    .where(and(eq(workoutSessionsTable.id, id), eq(workoutSessionsTable.userId, userId)))
    .returning();
  if (!session) { res.status(404).json({ error: "Not found" }); return; }
  res.json(session);
});

// ─── Sets ─────────────────────────────────────────────────────────────────────

/**
 * GET /workout/sessions/:id/sets
 * All set logs for a session, ordered by time logged.
 */
router.get("/workout/sessions/:id/sets", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const sessionId = parseIntParam(req.params.id);
  if (sessionId === null) { res.status(400).json({ error: "Invalid id" }); return; }

  const [session] = await db
    .select({ id: workoutSessionsTable.id })
    .from(workoutSessionsTable)
    .where(and(eq(workoutSessionsTable.id, sessionId), eq(workoutSessionsTable.userId, userId)));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  const sets = await db
    .select()
    .from(workoutSetLogsTable)
    .where(eq(workoutSetLogsTable.sessionId, sessionId))
    .orderBy(workoutSetLogsTable.loggedAt);
  res.json(sets);
});

/**
 * POST /workout/sessions/:id/sets
 * Log a new set within a session.
 */
router.post("/workout/sessions/:id/sets", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const sessionId = parseIntParam(req.params.id);
  if (sessionId === null) { res.status(400).json({ error: "Invalid id" }); return; }

  // Verify ownership
  const [session] = await db
    .select({ id: workoutSessionsTable.id })
    .from(workoutSessionsTable)
    .where(and(eq(workoutSessionsTable.id, sessionId), eq(workoutSessionsTable.userId, userId)));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  const { exerciseId, setNumber, weightKg, reps, durationSec, distanceM, rpe, isWarmup, notes } =
    req.body as Record<string, unknown>;

  if (!exerciseId || typeof exerciseId !== "number") {
    res.status(400).json({ error: "exerciseId is required" });
    return;
  }

  const [setLog] = await db
    .insert(workoutSetLogsTable)
    .values({
      sessionId,
      exerciseId,
      setNumber: typeof setNumber === "number" ? setNumber : 1,
      weightKg: typeof weightKg === "number" ? weightKg : null,
      reps: typeof reps === "number" ? reps : null,
      durationSec: typeof durationSec === "number" ? durationSec : null,
      distanceM: typeof distanceM === "number" ? distanceM : null,
      rpe: typeof rpe === "number" ? rpe : null,
      isWarmup: typeof isWarmup === "boolean" ? isWarmup : false,
      isPersonalBest: false,
      notes: typeof notes === "string" ? notes : null,
    })
    .returning();

  res.status(201).json(setLog);
});

/**
 * DELETE /workout/sessions/:id/sets/:setId
 * Remove a set log from a session (only while session is in_progress).
 */
router.delete(
  "/workout/sessions/:id/sets/:setId",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    const sessionId = parseIntParam(req.params.id);
    const setId = parseIntParam(req.params.setId);
    if (sessionId === null || setId === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [session] = await db
      .select({ id: workoutSessionsTable.id })
      .from(workoutSessionsTable)
      .where(and(eq(workoutSessionsTable.id, sessionId), eq(workoutSessionsTable.userId, userId)));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }

    await db
      .delete(workoutSetLogsTable)
      .where(
        and(
          eq(workoutSetLogsTable.id, setId),
          eq(workoutSetLogsTable.sessionId, sessionId),
        ),
      );
    res.sendStatus(204);
  },
);

// ─── Coaching ─────────────────────────────────────────────────────────────────

/**
 * GET /workout/sessions/:id/coaching
 * Returns a contextual coaching hint (or null) based on the current session
 * and historical performance. Caller should rate-limit — one call per 3+ sets.
 */
router.get("/workout/sessions/:id/coaching", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const sessionId = parseIntParam(req.params.id);
  if (sessionId === null) { res.status(400).json({ error: "Invalid id" }); return; }

  const [session] = await db
    .select({ id: workoutSessionsTable.id })
    .from(workoutSessionsTable)
    .where(and(eq(workoutSessionsTable.id, sessionId), eq(workoutSessionsTable.userId, userId)));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  const hint = await generateWorkoutCoaching(userId, sessionId);
  res.json({ hint });
});

// ─── Complete ─────────────────────────────────────────────────────────────────

/**
 * POST /workout/sessions/:id/complete
 * Finalises the session: marks completed, detects PRs, generates Claude summary,
 * and merges key facts into the user's workout_memory for Vapi context.
 */
router.post("/workout/sessions/:id/complete", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const sessionId = parseIntParam(req.params.id);
  if (sessionId === null) { res.status(400).json({ error: "Invalid id" }); return; }

  const [session] = await db
    .select()
    .from(workoutSessionsTable)
    .where(and(eq(workoutSessionsTable.id, sessionId), eq(workoutSessionsTable.userId, userId)));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  // Idempotent: if already completed return the existing record without re-running
  if (session.status === "completed") {
    res.json({ session, summary: null, prs: [] });
    return;
  }

  const result = await completeWorkoutSession(userId, sessionId);
  res.json(result);
});

// ─── Exercise PR + History ────────────────────────────────────────────────────

/**
 * GET /workout/exercises/:exerciseId/prs
 * All personal records the user holds for a specific exercise.
 */
router.get(
  "/workout/exercises/:exerciseId/prs",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    const exerciseId = parseIntParam(req.params.exerciseId);
    if (exerciseId === null) { res.status(400).json({ error: "Invalid exerciseId" }); return; }

    const prs = await db
      .select()
      .from(workoutPersonalRecordsTable)
      .where(
        and(
          eq(workoutPersonalRecordsTable.userId, userId),
          eq(workoutPersonalRecordsTable.exerciseId, exerciseId),
        ),
      );
    res.json(prs);
  },
);

/**
 * GET /workout/exercises/:exerciseId/history
 * Recent set logs for an exercise across completed sessions, with the session
 * date attached. Useful for exercise pickers and coaching context.
 * Query: ?limit=20
 */
router.get(
  "/workout/exercises/:exerciseId/history",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    const exerciseId = parseIntParam(req.params.exerciseId);
    if (exerciseId === null) { res.status(400).json({ error: "Invalid exerciseId" }); return; }
    const limit =
      Math.min(
        parseInt((req.query.limit as string | undefined) ?? "20", 10) || 20,
        100,
      );

    const sets = await db
      .select({
        id: workoutSetLogsTable.id,
        sessionId: workoutSetLogsTable.sessionId,
        setNumber: workoutSetLogsTable.setNumber,
        weightKg: workoutSetLogsTable.weightKg,
        reps: workoutSetLogsTable.reps,
        durationSec: workoutSetLogsTable.durationSec,
        distanceM: workoutSetLogsTable.distanceM,
        rpe: workoutSetLogsTable.rpe,
        isWarmup: workoutSetLogsTable.isWarmup,
        isPersonalBest: workoutSetLogsTable.isPersonalBest,
        loggedAt: workoutSetLogsTable.loggedAt,
        sessionDate: workoutSessionsTable.date,
        sessionName: workoutSessionsTable.name,
      })
      .from(workoutSetLogsTable)
      .innerJoin(
        workoutSessionsTable,
        eq(workoutSetLogsTable.sessionId, workoutSessionsTable.id),
      )
      .where(
        and(
          eq(workoutSetLogsTable.exerciseId, exerciseId),
          eq(workoutSessionsTable.userId, userId),
          eq(workoutSessionsTable.status, "completed"),
        ),
      )
      .orderBy(desc(workoutSetLogsTable.loggedAt))
      .limit(limit);

    res.json(sets);
  },
);

// ─── Volume Trend ─────────────────────────────────────────────────────────────

/**
 * GET /workout/volume
 * Weekly training volume for the last N weeks (default 13).
 * Returns an array ordered oldest→newest, one entry per week that had at least
 * one completed session. Weeks with no data are excluded.
 * Query: ?weeks=13
 */
router.get("/workout/volume", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const weeks = Math.min(
    parseInt((req.query.weeks as string | undefined) ?? "13", 10) || 13,
    52,
  );

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeks * 7);
  const cutoffStr = cutoff.toISOString().split("T")[0]!;

  const sessions = await db
    .select({ id: workoutSessionsTable.id, date: workoutSessionsTable.date })
    .from(workoutSessionsTable)
    .where(
      and(
        eq(workoutSessionsTable.userId, userId),
        eq(workoutSessionsTable.status, "completed"),
        gte(workoutSessionsTable.date, cutoffStr),
      ),
    );

  if (sessions.length === 0) { res.json([]); return; }

  const sessionIds = sessions.map((s) => s.id);
  const dateById = new Map(sessions.map((s) => [s.id, s.date]));

  const sets = await db
    .select({
      sessionId: workoutSetLogsTable.sessionId,
      weightKg: workoutSetLogsTable.weightKg,
      reps: workoutSetLogsTable.reps,
      isWarmup: workoutSetLogsTable.isWarmup,
    })
    .from(workoutSetLogsTable)
    .where(inArray(workoutSetLogsTable.sessionId, sessionIds));

  // Bucket by ISO week (Mon start)
  interface WeekBucket { label: string; sessions: number; sets: number; tonnageKg: number }
  const weekMap = new Map<string, WeekBucket>();

  for (const set of sets) {
    if (set.isWarmup) continue;
    const date = dateById.get(set.sessionId);
    if (!date) continue;
    const key = isoWeekStart(date);
    if (!weekMap.has(key)) weekMap.set(key, { label: key, sessions: 0, sets: 0, tonnageKg: 0 });
    const bucket = weekMap.get(key)!;
    bucket.sets++;
    if (set.weightKg && set.reps) bucket.tonnageKg += set.weightKg * set.reps;
  }

  // Count sessions per week (separately, to avoid double-counting multi-set sessions)
  const countedSessions = new Set<number>();
  for (const s of sessions) {
    const key = isoWeekStart(s.date);
    if (!weekMap.has(key)) weekMap.set(key, { label: key, sessions: 0, sets: 0, tonnageKg: 0 });
    if (!countedSessions.has(s.id)) {
      weekMap.get(key)!.sessions++;
      countedSessions.add(s.id);
    }
  }

  const result = Array.from(weekMap.values())
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((w) => ({ ...w, tonnageKg: Math.round(w.tonnageKg) }));

  res.json(result);
});

export default router;
