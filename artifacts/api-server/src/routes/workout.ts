import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte, inArray, like } from "drizzle-orm";
import {
  db,
  calendarEventsTable,
  exercisesTable,
  userProfilesTable,
  workoutHrSamplesTable,
  workoutPersonalRecordsTable,
  workoutProgramsTable,
  workoutProgramDaysTable,
  workoutSessionsTable,
  workoutSetLogsTable,
  workoutTemplatesTable,
  workoutTemplateExercisesTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { generateWorkoutCoaching } from "../lib/workoutCoaching";
import { completeWorkoutSession } from "../lib/workoutSummary";
import { summarizeHrSamples, estimateMaxHr, type HrSampleInput } from "../lib/workoutHr";
import { parseWorkoutImport } from "../lib/templateImport";

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
  const { name, templateId, date, calendarEventId } = req.body as Record<string, unknown>;
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
      calendarEventId: typeof calendarEventId === "number" ? calendarEventId : null,
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

  if (session.calendarEventId) {
    await db
      .update(calendarEventsTable)
      .set({ isCompleted: true })
      .where(
        and(
          eq(calendarEventsTable.id, session.calendarEventId),
          eq(calendarEventsTable.userId, userId),
        ),
      );
  }

  res.json(result);
});

/**
 * POST /workout/sessions/:id/hr
 * Ingest captured heart-rate samples, compute the session HR summary
 * (avg/max BPM, time-in-zone, estimated calories), and persist it.
 */
router.post("/workout/sessions/:id/hr", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const sessionId = parseIntParam(req.params.id);
  if (sessionId === null) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = req.body as {
    samples?: Array<{ bpm?: unknown; sampledAt?: unknown }>;
    maxHeartRate?: number | null;
  };
  const rawSamples = Array.isArray(body.samples) ? body.samples : [];

  const [session] = await db
    .select()
    .from(workoutSessionsTable)
    .where(and(eq(workoutSessionsTable.id, sessionId), eq(workoutSessionsTable.userId, userId)));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  // Normalise + validate incoming samples.
  const samples: HrSampleInput[] = [];
  for (const s of rawSamples) {
    const bpm = typeof s.bpm === "number" ? Math.round(s.bpm) : NaN;
    const t = typeof s.sampledAt === "string" || typeof s.sampledAt === "number"
      ? new Date(s.sampledAt)
      : null;
    if (!Number.isFinite(bpm) || bpm <= 0 || bpm > 300) continue;
    if (!t || isNaN(t.getTime())) continue;
    samples.push({ bpm, sampledAt: t });
  }

  const [profile] = await db
    .select({
      age: userProfilesTable.age,
      weightKg: userProfilesTable.weightKg,
      biologicalSex: userProfilesTable.biologicalSex,
      maxHeartRate: userProfilesTable.maxHeartRate,
    })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);

  const maxHr =
    (typeof body.maxHeartRate === "number" && body.maxHeartRate > 0 ? body.maxHeartRate : null) ??
    profile?.maxHeartRate ??
    estimateMaxHr(profile?.age ?? null);

  const summary = summarizeHrSamples(samples, maxHr, {
    age: profile?.age ?? null,
    weightKg: profile?.weightKg ?? null,
    biologicalSex: profile?.biologicalSex ?? null,
  });

  if (samples.length > 0) {
    await db.insert(workoutHrSamplesTable).values(
      samples.map((s) => ({ sessionId, bpm: s.bpm, sampledAt: s.sampledAt })),
    );

    await db
      .update(workoutSessionsTable)
      .set({
        avgHr: summary.avgHr,
        maxHr: summary.maxHr,
        timeInZone: summary.timeInZone,
        caloriesKcal: summary.caloriesKcal,
      })
      .where(eq(workoutSessionsTable.id, sessionId));
  }

  res.json(summary);
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

// ─── Templates ────────────────────────────────────────────────────────────────

/**
 * GET /workout/templates
 * List all workout templates owned by the authenticated user.
 */
router.get("/workout/templates", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const templates = await db
    .select()
    .from(workoutTemplatesTable)
    .where(eq(workoutTemplatesTable.userId, userId))
    .orderBy(desc(workoutTemplatesTable.createdAt));
  res.json(templates);
});

/**
 * POST /workout/templates
 * Create a new workout template.
 */
router.post("/workout/templates", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { name, category, estimatedDurationMin, notes } = req.body as Record<string, unknown>;
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const [template] = await db
    .insert(workoutTemplatesTable)
    .values({
      userId,
      name: name.trim(),
      category: typeof category === "string" ? category : "strength",
      estimatedDurationMin: typeof estimatedDurationMin === "number" ? estimatedDurationMin : null,
      notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
    })
    .returning();
  res.status(201).json(template);
});

/**
 * POST /workout/templates/import
 * Parse freeform workout text via Claude and return a structured template.
 * NOTE: Registered before /:id routes to avoid routing conflicts.
 */
router.post("/workout/templates/import", requireAuth, async (req, res): Promise<void> => {
  const { text, imageBase64, mimeType } = req.body as Record<string, unknown>;

  if (imageBase64 && typeof imageBase64 === "string") {
    // Image import via Claude vision
    const mime = typeof mimeType === "string" ? mimeType : "image/jpeg";
    try {
      const result = await parseWorkoutImport({ imageBase64, mimeType: mime });
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Image import failed";
      res.status(500).json({ error: msg });
    }
    return;
  }

  if (!text || typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "text or imageBase64 is required" });
    return;
  }
  try {
    const result = await parseWorkoutImport({ text: text.trim() });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Import failed";
    res.status(500).json({ error: msg });
  }
});

/**
 * PATCH /workout/templates/:id
 * Update template metadata (name, category, estimatedDurationMin, notes).
 */
router.patch("/workout/templates/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const templateId = parseIntParam(req.params.id);
  if (templateId === null) { res.status(400).json({ error: "Invalid id" }); return; }

  const { name, category, estimatedDurationMin, notes } = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  if (typeof name === "string" && name.trim()) updates.name = name.trim();
  if (typeof category === "string") updates.category = category;
  if (estimatedDurationMin !== undefined)
    updates.estimatedDurationMin = typeof estimatedDurationMin === "number" ? estimatedDurationMin : null;
  if (notes !== undefined)
    updates.notes = typeof notes === "string" && notes.trim() ? notes.trim() : null;

  const [template] = await db
    .update(workoutTemplatesTable)
    .set(updates)
    .where(and(eq(workoutTemplatesTable.id, templateId), eq(workoutTemplatesTable.userId, userId)))
    .returning();
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }
  res.json(template);
});

/**
 * DELETE /workout/templates/:id
 * Delete a template; exercises cascade via FK.
 */
router.delete("/workout/templates/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const templateId = parseIntParam(req.params.id);
  if (templateId === null) { res.status(400).json({ error: "Invalid id" }); return; }

  const [tpl] = await db
    .select({ id: workoutTemplatesTable.id })
    .from(workoutTemplatesTable)
    .where(and(eq(workoutTemplatesTable.id, templateId), eq(workoutTemplatesTable.userId, userId)));
  if (!tpl) { res.status(404).json({ error: "Template not found" }); return; }

  await db.delete(workoutTemplatesTable).where(eq(workoutTemplatesTable.id, templateId));
  res.sendStatus(204);
});

/**
 * POST /workout/templates/:id/duplicate
 * Clone a template and all its exercise slots. Returns the new template.
 */
router.post("/workout/templates/:id/duplicate", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const templateId = parseIntParam(req.params.id);
  if (templateId === null) { res.status(400).json({ error: "Invalid id" }); return; }

  const [source] = await db
    .select()
    .from(workoutTemplatesTable)
    .where(and(eq(workoutTemplatesTable.id, templateId), eq(workoutTemplatesTable.userId, userId)));
  if (!source) { res.status(404).json({ error: "Template not found" }); return; }

  const [newTemplate] = await db
    .insert(workoutTemplatesTable)
    .values({
      userId,
      name: `${source.name} (copy)`,
      category: source.category,
      estimatedDurationMin: source.estimatedDurationMin,
      notes: source.notes,
    })
    .returning();

  const slots = await db
    .select()
    .from(workoutTemplateExercisesTable)
    .where(eq(workoutTemplateExercisesTable.templateId, templateId))
    .orderBy(asc(workoutTemplateExercisesTable.orderIndex));

  if (slots.length > 0) {
    await db.insert(workoutTemplateExercisesTable).values(
      slots.map(({ id: _id, templateId: _tid, ...rest }) => ({
        ...rest,
        templateId: newTemplate!.id,
      })),
    );
  }

  res.status(201).json(newTemplate);
});

/**
 * POST /workout/templates/:id/exercises
 * Add an exercise slot to a template.
 */
router.post("/workout/templates/:id/exercises", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const templateId = parseIntParam(req.params.id);
  if (templateId === null) { res.status(400).json({ error: "Invalid id" }); return; }

  const [tpl] = await db
    .select({ id: workoutTemplatesTable.id })
    .from(workoutTemplatesTable)
    .where(and(eq(workoutTemplatesTable.id, templateId), eq(workoutTemplatesTable.userId, userId)));
  if (!tpl) { res.status(404).json({ error: "Template not found" }); return; }

  const {
    exerciseId, orderIndex, prescribedSets, prescribedReps, prescribedWeightKg,
    prescribedDurationSec, prescribedDistanceM, restSec, supersetGroupId, notes,
  } = req.body as Record<string, unknown>;

  if (!exerciseId || typeof exerciseId !== "number") {
    res.status(400).json({ error: "exerciseId is required" });
    return;
  }

  const [slot] = await db
    .insert(workoutTemplateExercisesTable)
    .values({
      templateId,
      exerciseId,
      orderIndex: typeof orderIndex === "number" ? orderIndex : 0,
      prescribedSets: typeof prescribedSets === "number" ? prescribedSets : null,
      prescribedReps: typeof prescribedReps === "number" ? prescribedReps : null,
      prescribedWeightKg: typeof prescribedWeightKg === "number" ? prescribedWeightKg : null,
      prescribedDurationSec: typeof prescribedDurationSec === "number" ? prescribedDurationSec : null,
      prescribedDistanceM: typeof prescribedDistanceM === "number" ? prescribedDistanceM : null,
      restSec: typeof restSec === "number" ? restSec : 90,
      supersetGroupId: typeof supersetGroupId === "number" ? supersetGroupId : null,
      notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
    })
    .returning();
  res.status(201).json(slot);
});

/**
 * PUT /workout/templates/:id/exercises/order
 * Batch-update orderIndex for exercise slots.
 * Body: { slots: Array<{ id: number; orderIndex: number }> }
 * NOTE: Registered before /:id/exercises/:slotId to avoid conflicts.
 */
router.put(
  "/workout/templates/:id/exercises/order",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    const templateId = parseIntParam(req.params.id);
    if (templateId === null) { res.status(400).json({ error: "Invalid id" }); return; }

    const [tpl] = await db
      .select({ id: workoutTemplatesTable.id })
      .from(workoutTemplatesTable)
      .where(and(eq(workoutTemplatesTable.id, templateId), eq(workoutTemplatesTable.userId, userId)));
    if (!tpl) { res.status(404).json({ error: "Template not found" }); return; }

    const { slots } = req.body as { slots?: Array<{ id: number; orderIndex: number }> };
    if (!Array.isArray(slots)) { res.status(400).json({ error: "slots array is required" }); return; }

    await Promise.all(
      slots.map(({ id, orderIndex }) =>
        db
          .update(workoutTemplateExercisesTable)
          .set({ orderIndex })
          .where(
            and(
              eq(workoutTemplateExercisesTable.id, id),
              eq(workoutTemplateExercisesTable.templateId, templateId),
            ),
          ),
      ),
    );
    res.sendStatus(204);
  },
);

/**
 * PATCH /workout/templates/:id/exercises/:slotId
 * Update an exercise slot's targets, notes, or superset group.
 */
router.patch(
  "/workout/templates/:id/exercises/:slotId",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    const templateId = parseIntParam(req.params.id);
    const slotId = parseIntParam(req.params.slotId);
    if (templateId === null || slotId === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [tpl] = await db
      .select({ id: workoutTemplatesTable.id })
      .from(workoutTemplatesTable)
      .where(and(eq(workoutTemplatesTable.id, templateId), eq(workoutTemplatesTable.userId, userId)));
    if (!tpl) { res.status(404).json({ error: "Template not found" }); return; }

    const {
      prescribedSets, prescribedReps, prescribedWeightKg, prescribedDurationSec,
      prescribedDistanceM, restSec, supersetGroupId, notes, orderIndex,
    } = req.body as Record<string, unknown>;

    const updates: Record<string, unknown> = {};
    if (prescribedSets !== undefined) updates.prescribedSets = typeof prescribedSets === "number" ? prescribedSets : null;
    if (prescribedReps !== undefined) updates.prescribedReps = typeof prescribedReps === "number" ? prescribedReps : null;
    if (prescribedWeightKg !== undefined) updates.prescribedWeightKg = typeof prescribedWeightKg === "number" ? prescribedWeightKg : null;
    if (prescribedDurationSec !== undefined) updates.prescribedDurationSec = typeof prescribedDurationSec === "number" ? prescribedDurationSec : null;
    if (prescribedDistanceM !== undefined) updates.prescribedDistanceM = typeof prescribedDistanceM === "number" ? prescribedDistanceM : null;
    if (restSec !== undefined) updates.restSec = typeof restSec === "number" ? restSec : 90;
    if (supersetGroupId !== undefined) updates.supersetGroupId = typeof supersetGroupId === "number" ? supersetGroupId : null;
    if (notes !== undefined) updates.notes = typeof notes === "string" && notes.trim() ? notes.trim() : null;
    if (orderIndex !== undefined) updates.orderIndex = typeof orderIndex === "number" ? orderIndex : 0;

    const [slot] = await db
      .update(workoutTemplateExercisesTable)
      .set(updates)
      .where(
        and(
          eq(workoutTemplateExercisesTable.id, slotId),
          eq(workoutTemplateExercisesTable.templateId, templateId),
        ),
      )
      .returning();
    if (!slot) { res.status(404).json({ error: "Slot not found" }); return; }
    res.json(slot);
  },
);

/**
 * DELETE /workout/templates/:id/exercises/:slotId
 * Remove an exercise slot from a template.
 */
router.delete(
  "/workout/templates/:id/exercises/:slotId",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    const templateId = parseIntParam(req.params.id);
    const slotId = parseIntParam(req.params.slotId);
    if (templateId === null || slotId === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [tpl] = await db
      .select({ id: workoutTemplatesTable.id })
      .from(workoutTemplatesTable)
      .where(and(eq(workoutTemplatesTable.id, templateId), eq(workoutTemplatesTable.userId, userId)));
    if (!tpl) { res.status(404).json({ error: "Template not found" }); return; }

    await db
      .delete(workoutTemplateExercisesTable)
      .where(
        and(
          eq(workoutTemplateExercisesTable.id, slotId),
          eq(workoutTemplateExercisesTable.templateId, templateId),
        ),
      );
    res.sendStatus(204);
  },
);

// ─── Programs ─────────────────────────────────────────────────────────────────

/**
 * GET /workout/programs
 * List all programs for the user.
 */
router.get("/workout/programs", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const programs = await db
    .select()
    .from(workoutProgramsTable)
    .where(eq(workoutProgramsTable.userId, userId))
    .orderBy(desc(workoutProgramsTable.createdAt));
  res.json(programs);
});

/**
 * POST /workout/programs
 */
router.post("/workout/programs", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { name, totalWeeks, notes } = req.body as Record<string, unknown>;
  if (!name || typeof name !== "string") { res.status(400).json({ error: "name is required" }); return; }
  const [prog] = await db
    .insert(workoutProgramsTable)
    .values({ userId, name, totalWeeks: typeof totalWeeks === "number" ? totalWeeks : 1, notes: typeof notes === "string" ? notes : null })
    .returning();
  res.status(201).json(prog);
});

/**
 * PATCH /workout/programs/:id
 */
router.patch("/workout/programs/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const id = parseIntParam(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
  const { name, totalWeeks, notes } = req.body as Record<string, unknown>;
  const [prog] = await db.select().from(workoutProgramsTable)
    .where(and(eq(workoutProgramsTable.id, id), eq(workoutProgramsTable.userId, userId)));
  if (!prog) { res.status(404).json({ error: "Not found" }); return; }
  const updates: Record<string, unknown> = {};
  if (typeof name === "string") updates.name = name;
  if (typeof totalWeeks === "number") updates.totalWeeks = totalWeeks;
  if (notes !== undefined) updates.notes = notes === null ? null : String(notes);
  const [updated] = await db.update(workoutProgramsTable).set(updates).where(eq(workoutProgramsTable.id, id)).returning();
  res.json(updated);
});

/**
 * DELETE /workout/programs/:id
 */
router.delete("/workout/programs/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const id = parseIntParam(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
  const [prog] = await db.select().from(workoutProgramsTable)
    .where(and(eq(workoutProgramsTable.id, id), eq(workoutProgramsTable.userId, userId)));
  if (!prog) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(calendarEventsTable).where(
    and(
      eq(calendarEventsTable.userId, userId),
      eq(calendarEventsTable.type, "workout"),
      like(calendarEventsTable.notes!, `%"programId":${id}%`),
    ),
  );
  await db.delete(workoutProgramsTable).where(eq(workoutProgramsTable.id, id));
  res.sendStatus(204);
});

/**
 * GET /workout/programs/:id/days
 * Returns program metadata + days with joined template name.
 */
router.get("/workout/programs/:id/days", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const id = parseIntParam(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
  const [prog] = await db.select().from(workoutProgramsTable)
    .where(and(eq(workoutProgramsTable.id, id), eq(workoutProgramsTable.userId, userId)));
  if (!prog) { res.status(404).json({ error: "Not found" }); return; }
  const days = await db
    .select({
      id: workoutProgramDaysTable.id,
      weekNumber: workoutProgramDaysTable.weekNumber,
      dayOfWeek: workoutProgramDaysTable.dayOfWeek,
      templateId: workoutProgramDaysTable.templateId,
      templateName: workoutTemplatesTable.name,
      notes: workoutProgramDaysTable.notes,
    })
    .from(workoutProgramDaysTable)
    .leftJoin(workoutTemplatesTable, eq(workoutProgramDaysTable.templateId, workoutTemplatesTable.id))
    .where(eq(workoutProgramDaysTable.programId, id))
    .orderBy(asc(workoutProgramDaysTable.weekNumber), asc(workoutProgramDaysTable.dayOfWeek));
  res.json({ program: prog, days });
});

/**
 * PUT /workout/programs/:id/days
 * Replace the full schedule for a program.
 */
router.put("/workout/programs/:id/days", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const id = parseIntParam(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
  const [prog] = await db.select().from(workoutProgramsTable)
    .where(and(eq(workoutProgramsTable.id, id), eq(workoutProgramsTable.userId, userId)));
  if (!prog) { res.status(404).json({ error: "Not found" }); return; }
  const { days } = req.body as { days: Array<{ weekNumber: number; dayOfWeek: string; templateId?: number | null }> };
  if (!Array.isArray(days)) { res.status(400).json({ error: "days must be an array" }); return; }

  await db.transaction(async (tx) => {
    await tx.delete(workoutProgramDaysTable).where(eq(workoutProgramDaysTable.programId, id));
    if (days.length > 0) {
      await tx.insert(workoutProgramDaysTable).values(
        days.map((d) => ({ programId: id, weekNumber: d.weekNumber, dayOfWeek: d.dayOfWeek, templateId: d.templateId ?? null })),
      );
    }

    if (prog.startDate) {
      await tx.delete(calendarEventsTable).where(
        and(
          eq(calendarEventsTable.userId, userId),
          eq(calendarEventsTable.type, "workout"),
          like(calendarEventsTable.notes!, `%"programId":${id}%`),
        ),
      );

      const templateIds = days.map((d) => d.templateId).filter((t): t is number => t != null);
      const tplRows = templateIds.length > 0
        ? await tx.select({ id: workoutTemplatesTable.id, name: workoutTemplatesTable.name })
            .from(workoutTemplatesTable)
            .where(inArray(workoutTemplatesTable.id, templateIds))
        : [];
      const tplMap = new Map(tplRows.map((t) => [t.id, t.name]));

      const sd = new Date(prog.startDate + "T12:00:00");
      const dow = sd.getDay();
      const daysToMon = dow === 0 ? 1 : (dow === 1 ? 0 : 8 - dow);
      const week1Mon = new Date(sd);
      week1Mon.setDate(sd.getDate() + daysToMon);
      const dayOffsets: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

      const eventsToInsert = days
        .filter((d) => d.templateId != null)
        .map((d) => {
          const weekOffset = (d.weekNumber - 1) * 7;
          const dayOffset = dayOffsets[d.dayOfWeek] ?? 0;
          const eventDate = new Date(week1Mon);
          eventDate.setDate(week1Mon.getDate() + weekOffset + dayOffset);
          const dateStr = eventDate.toISOString().split("T")[0]!;
          const templateName = tplMap.get(d.templateId!) ?? prog.name;
          return {
            userId,
            date: dateStr,
            title: templateName,
            type: "workout",
            notes: JSON.stringify({ programId: id, programName: prog.name, templateId: d.templateId, templateName }),
            recurrenceType: "none",
          };
        });

      if (eventsToInsert.length > 0) {
        await tx.insert(calendarEventsTable).values(eventsToInsert);
      }
    }
  });

  res.sendStatus(204);
});

/**
 * POST /workout/programs/:id/attach
 * Attach to calendar from today (or provided startDate).
 * Generates calendar_events for every workout day in the program.
 */
router.post("/workout/programs/:id/attach", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const id = parseIntParam(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
  const [prog] = await db.select().from(workoutProgramsTable)
    .where(and(eq(workoutProgramsTable.id, id), eq(workoutProgramsTable.userId, userId)));
  if (!prog) { res.status(404).json({ error: "Not found" }); return; }

  const startDateStr = typeof (req.body as Record<string,unknown>).startDate === "string"
    ? (req.body as Record<string,unknown>).startDate as string
    : new Date().toISOString().split("T")[0]!;

  const days = await db
    .select({
      weekNumber: workoutProgramDaysTable.weekNumber,
      dayOfWeek: workoutProgramDaysTable.dayOfWeek,
      templateId: workoutProgramDaysTable.templateId,
      templateName: workoutTemplatesTable.name,
    })
    .from(workoutProgramDaysTable)
    .leftJoin(workoutTemplatesTable, eq(workoutProgramDaysTable.templateId, workoutTemplatesTable.id))
    .where(eq(workoutProgramDaysTable.programId, id));

  // Week 1 Monday = first Monday on or after startDate
  const sd = new Date(startDateStr + "T12:00:00");
  const dow = sd.getDay(); // 0=Sun, 1=Mon
  const daysToMon = dow === 0 ? 1 : (dow === 1 ? 0 : 8 - dow);
  const week1Mon = new Date(sd);
  week1Mon.setDate(sd.getDate() + daysToMon);

  const dayOffsets: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

  // Remove previous events for this program
  await db.delete(calendarEventsTable).where(
    and(
      eq(calendarEventsTable.userId, userId),
      eq(calendarEventsTable.type, "workout"),
      like(calendarEventsTable.notes!, `%"programId":${id}%`),
    ),
  );

  const eventsToInsert = days
    .filter((d) => d.templateId !== null)
    .map((d) => {
      const weekOffset = (d.weekNumber - 1) * 7;
      const dayOffset = dayOffsets[d.dayOfWeek] ?? 0;
      const eventDate = new Date(week1Mon);
      eventDate.setDate(week1Mon.getDate() + weekOffset + dayOffset);
      const dateStr = eventDate.toISOString().split("T")[0]!;
      return {
        userId,
        date: dateStr,
        title: d.templateName ?? prog.name,
        type: "workout",
        notes: JSON.stringify({ programId: id, programName: prog.name, templateId: d.templateId, templateName: d.templateName }),
        recurrenceType: "none",
      };
    });

  if (eventsToInsert.length > 0) {
    await db.insert(calendarEventsTable).values(eventsToInsert);
  }

  const [updated] = await db.update(workoutProgramsTable).set({ startDate: startDateStr })
    .where(eq(workoutProgramsTable.id, id)).returning();
  res.json(updated);
});

/**
 * DELETE /workout/programs/:id/attach
 * Detach: remove generated calendar events and clear startDate.
 */
router.delete("/workout/programs/:id/attach", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const id = parseIntParam(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid id" }); return; }
  const [prog] = await db.select().from(workoutProgramsTable)
    .where(and(eq(workoutProgramsTable.id, id), eq(workoutProgramsTable.userId, userId)));
  if (!prog) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(calendarEventsTable).where(
    and(
      eq(calendarEventsTable.userId, userId),
      eq(calendarEventsTable.type, "workout"),
      like(calendarEventsTable.notes!, `%"programId":${id}%`),
    ),
  );
  const [updated] = await db.update(workoutProgramsTable).set({ startDate: null })
    .where(eq(workoutProgramsTable.id, id)).returning();
  res.json(updated);
});

// ─── Progressive Overload Suggestions ─────────────────────────────────────────

/**
 * GET /workout/exercises/:exerciseId/suggestions
 * Computes next-session targets from the user's logged history for an exercise.
 */
router.get("/workout/exercises/:exerciseId/suggestions", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const exerciseId = parseIntParam(req.params.exerciseId);
  if (exerciseId === null) { res.status(400).json({ error: "Invalid exerciseId" }); return; }

  const rows = await db
    .select({
      sessionId: workoutSessionsTable.id,
      date: workoutSessionsTable.date,
      weightKg: workoutSetLogsTable.weightKg,
      reps: workoutSetLogsTable.reps,
      isWarmup: workoutSetLogsTable.isWarmup,
    })
    .from(workoutSetLogsTable)
    .innerJoin(workoutSessionsTable, eq(workoutSetLogsTable.sessionId, workoutSessionsTable.id))
    .where(
      and(
        eq(workoutSetLogsTable.exerciseId, exerciseId),
        eq(workoutSessionsTable.userId, userId),
        eq(workoutSessionsTable.status, "completed"),
        eq(workoutSetLogsTable.isWarmup, false),
      ),
    )
    .orderBy(desc(workoutSessionsTable.date))
    .limit(60);

  if (rows.length === 0) {
    res.json({ suggestion: null, reason: "no_history" });
    return;
  }

  type SessionData = { date: string; weights: number[]; reps: number[] };
  const sessionMap = new Map<number, SessionData>();
  for (const row of rows) {
    if (!sessionMap.has(row.sessionId)) sessionMap.set(row.sessionId, { date: row.date, weights: [], reps: [] });
    const s = sessionMap.get(row.sessionId)!;
    if (row.weightKg !== null) s.weights.push(row.weightKg);
    if (row.reps !== null) s.reps.push(row.reps);
  }

  const sessions = [...sessionMap.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const last = sessions[0]!;

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  const lastAvgWeight = avg(last.weights);
  const lastAvgReps = last.reps.length > 0 ? Math.round(avg(last.reps)!) : null;

  let trend: "improving" | "maintaining" | "declining" = "maintaining";
  if (sessions.length >= 2) {
    const prev = sessions[1]!;
    const prevAvgWeight = avg(prev.weights);
    const prevAvgReps = prev.reps.length > 0 ? Math.round(avg(prev.reps)!) : null;
    if (lastAvgWeight !== null && prevAvgWeight !== null) {
      trend = lastAvgWeight > prevAvgWeight ? "improving" : lastAvgWeight < prevAvgWeight - 0.5 ? "declining" : "maintaining";
    } else if (lastAvgReps !== null && prevAvgReps !== null) {
      trend = lastAvgReps > prevAvgReps ? "improving" : lastAvgReps < prevAvgReps ? "declining" : "maintaining";
    }
  }

  // Suggest: weight takes priority; if declining, hold current; otherwise +2.5kg
  const suggestedWeightKg = lastAvgWeight !== null
    ? trend === "declining" ? Math.round(lastAvgWeight * 2) / 2 : Math.round((lastAvgWeight + 2.5) * 2) / 2
    : null;
  const suggestedReps = lastAvgReps !== null ? lastAvgReps : null;

  res.json({
    suggestion: {
      suggestedWeightKg,
      suggestedReps,
      lastSessionDate: last.date,
      lastAvgWeightKg: lastAvgWeight !== null ? Math.round(lastAvgWeight * 10) / 10 : null,
      lastAvgReps,
      trend,
      sessionCount: sessions.length,
    },
    reason: "computed",
  });
});

// ─── Template exercises (must remain AFTER /programs routes to avoid :id clash) ──

/**
 * GET /workout/templates/:id/exercises
 * Exercises for a template, joined with full exercise details, ordered by orderIndex.
 */
router.get(
  "/workout/templates/:id/exercises",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    const templateId = parseIntParam(req.params.id);
    if (templateId === null) { res.status(400).json({ error: "Invalid id" }); return; }

    const [template] = await db
      .select({ id: workoutTemplatesTable.id })
      .from(workoutTemplatesTable)
      .where(and(eq(workoutTemplatesTable.id, templateId), eq(workoutTemplatesTable.userId, userId)));
    if (!template) { res.status(404).json({ error: "Template not found" }); return; }

    const exercises = await db
      .select({
        id: workoutTemplateExercisesTable.id,
        exerciseId: workoutTemplateExercisesTable.exerciseId,
        name: exercisesTable.name,
        category: exercisesTable.category,
        trackingType: exercisesTable.trackingType,
        orderIndex: workoutTemplateExercisesTable.orderIndex,
        prescribedSets: workoutTemplateExercisesTable.prescribedSets,
        prescribedReps: workoutTemplateExercisesTable.prescribedReps,
        prescribedWeightKg: workoutTemplateExercisesTable.prescribedWeightKg,
        prescribedDurationSec: workoutTemplateExercisesTable.prescribedDurationSec,
        prescribedDistanceM: workoutTemplateExercisesTable.prescribedDistanceM,
        restSec: workoutTemplateExercisesTable.restSec,
        supersetGroupId: workoutTemplateExercisesTable.supersetGroupId,
        notes: workoutTemplateExercisesTable.notes,
      })
      .from(workoutTemplateExercisesTable)
      .innerJoin(exercisesTable, eq(workoutTemplateExercisesTable.exerciseId, exercisesTable.id))
      .where(eq(workoutTemplateExercisesTable.templateId, templateId))
      .orderBy(workoutTemplateExercisesTable.orderIndex);

    res.json(exercises);
  },
);

export default router;
