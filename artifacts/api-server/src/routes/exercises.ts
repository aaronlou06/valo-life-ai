import { Router, type IRouter } from "express";
import { and, eq, ilike, isNull, or } from "drizzle-orm";
import { db, exercisesTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

/**
 * List exercises available to the authenticated user.
 *
 * Returns system exercises plus the user's own exercises. Archived exercises
 * are excluded by default so exercise pickers stay clean.
 *
 * Query params:
 *   includeArchived=true  — include the user's own archived exercises
 *   search=<string>       — case-insensitive name search
 *   category=<string>     — exact category filter
 */
router.get("/exercises", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const includeArchived = req.query.includeArchived === "true";
  const search =
    typeof req.query.search === "string" ? req.query.search.trim() : "";
  const category =
    typeof req.query.category === "string" ? req.query.category.trim() : "";

  // An exercise is visible if it is a system exercise OR owned by this user.
  const ownership = or(
    and(isNull(exercisesTable.userId), eq(exercisesTable.isSystem, true)),
    eq(exercisesTable.userId, userId),
  );
  // Default: hide archived exercises. With includeArchived the user can see
  // their own archived exercises (useful for management UI later).
  const archiveFilter = includeArchived
    ? undefined
    : eq(exercisesTable.isArchived, false);
  const searchFilter = search
    ? ilike(exercisesTable.name, `%${search}%`)
    : undefined;
  const categoryFilter = category
    ? eq(exercisesTable.category, category)
    : undefined;

  const exercises = await db
    .select()
    .from(exercisesTable)
    .where(and(ownership, archiveFilter, searchFilter, categoryFilter))
    .orderBy(exercisesTable.name);

  res.json(exercises);
});

/**
 * Archive a user-owned exercise.
 *
 * System exercises are shared across all users and cannot be archived via this
 * endpoint — they are never removed from the picker. Only exercises where
 * userId matches the authenticated user are affected.
 *
 * An exercise referenced by logged sets (RESTRICT FK) can safely be archived
 * because no rows are deleted. Historical set logs retain the exerciseId and
 * are unaffected.
 */
router.post("/exercises/:id/archive", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId!, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [exercise] = await db
    .update(exercisesTable)
    .set({ isArchived: true, archivedAt: new Date() })
    .where(and(eq(exercisesTable.id, id), eq(exercisesTable.userId, userId)))
    .returning();

  if (!exercise) {
    res.status(404).json({ error: "Exercise not found or not owned by you" });
    return;
  }
  res.json(exercise);
});

/**
 * Unarchive a user-owned exercise, restoring it to exercise pickers.
 */
router.post("/exercises/:id/unarchive", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId!, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [exercise] = await db
    .update(exercisesTable)
    .set({ isArchived: false, archivedAt: null })
    .where(and(eq(exercisesTable.id, id), eq(exercisesTable.userId, userId)))
    .returning();

  if (!exercise) {
    res.status(404).json({ error: "Exercise not found or not owned by you" });
    return;
  }
  res.json(exercise);
});

export default router;
