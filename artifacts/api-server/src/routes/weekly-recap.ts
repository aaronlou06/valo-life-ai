import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, userProfilesTable, weeklyRecapsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { getDateInTimezone } from "./dashboard";
import { buildWeeklyAggregate, generateWeeklyRecap } from "../lib/weeklyRecap";

const router: IRouter = Router();

/**
 * Given today's YYYY-MM-DD, returns the most recently completed
 * Mon–Sun week as { weekStart, weekEnd }. If today is Sunday, that
 * Sunday's week (the one ending today) is used.
 */
function lastCompletedWeek(today: string): { weekStart: string; weekEnd: string } {
  const d = new Date(today + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0 = Sun, 1 = Mon
  // Days since the most recent Sunday (inclusive of today if Sunday).
  const daysSinceSunday = dow; // Sun=0, Mon=1, ... Sat=6
  const end = new Date(d);
  end.setUTCDate(d.getUTCDate() - daysSinceSunday); // most recent Sunday (today if Sunday)
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 6); // Monday of that week
  const fmt = (x: Date): string => x.toISOString().split("T")[0]!;
  return { weekStart: fmt(start), weekEnd: fmt(end) };
}

// POST /weekly-recap/trigger — on-demand generation for the calling user.
router.post("/weekly-recap/trigger", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;

  const [profile] = await db
    .select({ callTimezone: userProfilesTable.callTimezone })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);

  const tz = profile?.callTimezone ?? "America/New_York";
  const today = getDateInTimezone(tz);
  const { weekStart, weekEnd } = lastCompletedWeek(today);

  try {
    const aggregate = await buildWeeklyAggregate(userId, weekStart, weekEnd);
    const recap = await generateWeeklyRecap(userId, aggregate);
    // TODO: wire weekly recap push notification
    res.status(200).json(recap);
  } catch (err) {
    req.log.error({ err }, "triggerWeeklyRecap failed");
    res.status(500).json({ error: "Weekly recap generation failed" });
  }
});

// GET /weekly-recap/latest — most recent ready recap.
router.get("/weekly-recap/latest", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const [row] = await db
    .select()
    .from(weeklyRecapsTable)
    .where(and(eq(weeklyRecapsTable.userId, userId), eq(weeklyRecapsTable.status, "ready")))
    .orderBy(desc(weeklyRecapsTable.weekStart))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "No ready recap found" });
    return;
  }
  res.status(200).json(row);
});

// GET /weekly-recap/history — recap stubs ordered by weekStart desc.
// Registered before /:id so the literal "history" is not swallowed by the param matcher.
router.get("/weekly-recap/history", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const rows = await db
    .select({
      id: weeklyRecapsTable.id,
      weekStart: weeklyRecapsTable.weekStart,
      weekEnd: weeklyRecapsTable.weekEnd,
      headline: weeklyRecapsTable.headline,
      isQuietWeek: weeklyRecapsTable.isQuietWeek,
      status: weeklyRecapsTable.status,
    })
    .from(weeklyRecapsTable)
    .where(and(eq(weeklyRecapsTable.userId, userId), eq(weeklyRecapsTable.status, "ready")))
    .orderBy(desc(weeklyRecapsTable.weekStart));

  res.status(200).json(rows);
});

// GET /weekly-recap/:id — full recap, ownership-checked.
router.get("/weekly-recap/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(idParam ?? "", 10);
  if (isNaN(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [row] = await db
    .select()
    .from(weeklyRecapsTable)
    .where(eq(weeklyRecapsTable.id, id))
    .limit(1);

  if (!row || row.userId !== userId) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(200).json(row);
});

export default router;
