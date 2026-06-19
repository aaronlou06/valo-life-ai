import { and, eq, gte, lte, gt } from "drizzle-orm";
import {
  db,
  dailyLogsTable,
  calendarEventsTable,
  insightsPatternsTable,
  proposedActionsTable,
} from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { getActionHandler, rescheduleWorkoutParamsSchema } from "./actions";
import { logger } from "./logger";

/**
 * generateActionProposals — Round 1 of the agentic "Suggest & Act" loop.
 *
 * Runs inside the nightly job (NOT the home-briefing request path) so Home loads
 * stay fast. It reads existing detection signals (fitness consistency + the next
 * 14 days of calendar events), asks Claude to propose at most one concrete
 * workout reschedule into an open slot, then validates and persists valid
 * proposals into `proposed_actions` with a 24h expiry.
 *
 * Guardrails enforced server-side (never trusted to the model):
 *  - target dates must be open weekday slots derived in code
 *  - the workout being moved must be a real workout event owned by the user
 *  - time fields are re-derived from the real calendar event, not the model
 *  - (actionType, targetDate) pairs declined in the last 7 days are excluded
 *  - insertion is idempotent against existing pending, non-expired proposals
 */

const HORIZON_DAYS = 14;
const PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000;
const DECLINE_LOOKBACK_DAYS = 7;
/** Below this 14-day workout consistency we consider the user "behind on fitness". */
const BEHIND_CONSISTENCY_THRESHOLD = 0.6;

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weekdayLabel(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });
}

/**
 * Open weekday dates within the horizon that have no scheduled workout and were
 * not recently declined. Pure + exported for testing.
 */
export function computeOpenWeekdayDates(
  workoutDates: Set<string>,
  declinedDates: Set<string>,
  now: Date,
  horizonDays: number = HORIZON_DAYS,
): string[] {
  const open: string[] = [];
  for (let i = 1; i <= horizonDays; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dow = d.getDay(); // 0=Sun .. 6=Sat
    if (dow === 0 || dow === 6) continue; // weekdays only
    const iso = toISODate(d);
    if (workoutDates.has(iso)) continue;
    if (declinedDates.has(iso)) continue;
    open.push(iso);
  }
  return open;
}

/**
 * Declined `reschedule_workout` target dates still inside the cooldown window.
 * A dismissal suppresses the same target date for `lookbackDays`, anchored on
 * `respondedAt` (when the user acted on the proposal), NOT on `createdAt`. After
 * the window passes the date becomes proposable again. Pure + exported so the
 * two-sided cooldown is unit-testable without a database.
 */
export function computeDeclinedRescheduleDates(
  declinedRows: { actionType: string; parameters: unknown; respondedAt: Date | null }[],
  now: Date,
  lookbackDays: number = DECLINE_LOOKBACK_DAYS,
): Set<string> {
  const cutoffMs = now.getTime() - lookbackDays * 24 * 60 * 60 * 1000;
  const dates = new Set<string>();
  for (const row of declinedRows) {
    if (row.actionType !== "reschedule_workout") continue;
    if (!row.respondedAt || row.respondedAt.getTime() < cutoffMs) continue;
    const p = row.parameters as { targetDate?: unknown } | null;
    const td = typeof p?.targetDate === "string" ? p.targetDate : null;
    if (td) dates.add(td);
  }
  return dates;
}

interface RawProposal {
  action_type?: unknown;
  parameters?: unknown;
  rationale?: unknown;
  life_area?: unknown;
  confidence?: unknown;
}

/**
 * Parse Claude's JSON response into a proposals array. Tolerates markdown fences
 * and leading preamble. Returns [] on any error (malformed output is discarded).
 * Pure + exported for testing.
 */
export function parseProposalsJson(text: string): RawProposal[] {
  try {
    let t = text.trim();
    const fence = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
    if (fence?.[1]) t = fence[1].trim();
    const objStart = t.indexOf("{");
    if (objStart > 0) t = t.slice(objStart);
    const parsed = JSON.parse(t) as { proposals?: unknown };
    if (!parsed || !Array.isArray(parsed.proposals)) return [];
    return parsed.proposals as RawProposal[];
  } catch {
    return [];
  }
}

/** Transpose the clock time of an ISO timestamp onto a new YYYY-MM-DD date. */
function transposeToDate(originalIso: string | null, targetDate: string): string | null {
  if (!originalIso) return null;
  const orig = new Date(originalIso);
  if (isNaN(orig.getTime())) return null;
  const [y, m, d] = targetDate.split("-").map(Number);
  const out = new Date(orig);
  out.setFullYear(y!, (m ?? 1) - 1, d ?? 1);
  return out.toISOString();
}

export async function generateActionProposals(userId: string): Promise<number> {
  const now = new Date();
  const today = toISODate(now);
  const horizonEnd = new Date(now);
  horizonEnd.setDate(horizonEnd.getDate() + HORIZON_DAYS);
  const horizonEndISO = toISODate(horizonEnd);

  // ── Context assembly ──────────────────────────────────────────────────────
  const d14 = new Date(now);
  d14.setDate(d14.getDate() - 14);
  const d14ISO = toISODate(d14);
  const declineCutoff = new Date(now.getTime() - DECLINE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [logs14, upcomingEvents, fitnessPatterns, declinedRows, pendingRows] = await Promise.all([
    db
      .select()
      .from(dailyLogsTable)
      .where(and(eq(dailyLogsTable.userId, userId), gte(dailyLogsTable.date, d14ISO))),

    db
      .select()
      .from(calendarEventsTable)
      .where(
        and(
          eq(calendarEventsTable.userId, userId),
          gte(calendarEventsTable.date, today),
          lte(calendarEventsTable.date, horizonEndISO),
        ),
      ),

    db
      .select()
      .from(insightsPatternsTable)
      .where(
        and(
          eq(insightsPatternsTable.userId, userId),
          eq(insightsPatternsTable.isActive, true),
        ),
      ),

    db
      .select()
      .from(proposedActionsTable)
      .where(
        and(
          eq(proposedActionsTable.userId, userId),
          eq(proposedActionsTable.status, "declined"),
          gte(proposedActionsTable.respondedAt, declineCutoff),
        ),
      ),

    db
      .select()
      .from(proposedActionsTable)
      .where(
        and(
          eq(proposedActionsTable.userId, userId),
          eq(proposedActionsTable.status, "pending"),
          gt(proposedActionsTable.expiresAt, now),
        ),
      ),
  ]);

  // Existing scheduled workouts (the only events that can be rescheduled).
  const workoutEvents = upcomingEvents.filter((e) => e.type === "workout");
  if (workoutEvents.length === 0) return 0;

  const workoutDates = new Set(workoutEvents.map((e) => e.date));

  // Declined reschedule target dates within the cooldown window. Derived via a
  // pure helper (anchored on respondedAt) so the two-sided cooldown is testable.
  const declinedDatesForReschedule = computeDeclinedRescheduleDates(declinedRows, now);
  const declinedPairs = new Set(
    Array.from(declinedDatesForReschedule, (d) => `reschedule_workout::${d}`),
  );

  const openDates = computeOpenWeekdayDates(workoutDates, declinedDatesForReschedule, now);
  if (openDates.length === 0) return 0;

  // Fitness consistency over the last 14 days. Only users who are behind on
  // fitness get reschedule proposals — enforced in code, not just the prompt.
  const workoutDays = logs14.filter((l) => l.workoutType != null).length;
  const consistency = workoutDays / 14;
  if (consistency >= BEHIND_CONSISTENCY_THRESHOLD) return 0;

  // Existing pending (actionType, targetDate) pairs for idempotency.
  const pendingPairs = new Set<string>();
  for (const row of pendingRows) {
    const p = row.parameters as { targetDate?: unknown } | null;
    const td = typeof p?.targetDate === "string" ? p.targetDate : null;
    if (td) pendingPairs.add(`${row.actionType}::${td}`);
  }

  // ── Prompt ────────────────────────────────────────────────────────────────
  const supportedTypes = ["reschedule_workout"];

  const workoutLines = workoutEvents
    .map((e) => {
      const t = e.startTime
        ? " at " +
          e.startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
        : " (no set time)";
      return `- id=${e.id} | "${e.title}" | ${e.date} (${weekdayLabel(e.date)})${t}`;
    })
    .join("\n");

  const openLines = openDates.map((d) => `- ${d} (${weekdayLabel(d)})`).join("\n");

  const patternLines = fitnessPatterns
    .filter((p) => p.patternType.includes("workout"))
    .map((p) => `- ${p.description}`)
    .join("\n");

  const declinedLines =
    declinedDatesForReschedule.size > 0
      ? Array.from(declinedDatesForReschedule).map((d) => `- ${d}`).join("\n")
      : "- (none)";

  const prompt = `You are Valo's action proposal engine. Propose AT MOST ONE workout reschedule that would genuinely help this user stay consistent with fitness. Be conservative: if nothing clearly helps, return an empty list.

FITNESS SIGNAL:
- Workout consistency (last 14 days): ${Math.round(consistency * 100)}% (${workoutDays} of 14 days had a workout)
${patternLines || "- (no workout patterns detected)"}

SCHEDULED WORKOUTS (next ${HORIZON_DAYS} days) — you may move exactly ONE of these:
${workoutLines}

OPEN WEEKDAY SLOTS — a workout may ONLY be moved to one of these dates:
${openLines}

RECENTLY DECLINED target dates (never propose these):
${declinedLines}

Return JSON ONLY, no markdown fences and no preamble, in exactly this shape:
{"proposals":[{"action_type":"reschedule_workout","parameters":{"calendarEventId":<id from the scheduled list>,"currentDate":"<that workout's date>","currentStartTime":<the workout's ISO start time or null>,"targetDate":"<one of the open dates>","targetStartTime":<ISO or null>,"targetEndTime":<ISO or null>},"rationale":"<one grounded sentence>","life_area":"fitness","confidence":<number 0..1>}]}

Rules:
- Only propose if the user is behind on fitness (consistency below ${Math.round(BEHIND_CONSISTENCY_THRESHOLD * 100)}%).
- Only use action_type values from this list: ${supportedTypes.join(", ")}.
- calendarEventId MUST be one of the scheduled workout ids above.
- targetDate MUST be exactly one of the open weekday slots above.
- If you picked this open slot specifically because the user recently declined a different date (see RECENTLY DECLINED above), you MAY acknowledge that adaptation in ONE warm sentence within the rationale (e.g. "Since you passed on Thursday, I found Friday open instead"). Include this only when it is genuinely true — never invent a declined date or mention this when no relevant date was declined.
- If nothing is worth proposing, return {"proposals":[]}.`;

  let rawText: string;
  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });
    const block = message.content[0];
    if (!block || block.type !== "text") return 0;
    rawText = block.text;
  } catch (err) {
    logger.error({ err, userId }, "generateActionProposals: Claude call failed");
    return 0;
  }

  const raw = parseProposalsJson(rawText);
  if (raw.length === 0) return 0;

  const eventById = new Map(workoutEvents.map((e) => [e.id, e]));
  const openSet = new Set(openDates);

  let inserted = 0;
  const batchPairs = new Set<string>();

  for (const item of raw) {
    if (item.action_type !== "reschedule_workout") continue;
    if (!getActionHandler("reschedule_workout")) continue;

    const params = item.parameters as { calendarEventId?: unknown; targetDate?: unknown } | null;
    const eventId = typeof params?.calendarEventId === "number" ? params.calendarEventId : null;
    const targetDate = typeof params?.targetDate === "string" ? params.targetDate : null;
    if (eventId == null || targetDate == null) continue;

    // Server-side guards: real owned workout + genuinely open, non-declined slot.
    const event = eventById.get(eventId);
    if (!event) continue;
    if (!openSet.has(targetDate)) continue;
    const pairKey = `reschedule_workout::${targetDate}`;
    if (declinedPairs.has(pairKey)) continue;
    if (pendingPairs.has(pairKey) || batchPairs.has(pairKey)) continue;

    // Authoritative time fields derived from the real event (not the model).
    const currentStartTime = event.startTime ? event.startTime.toISOString() : null;
    const currentEndTime = event.endTime ? event.endTime.toISOString() : null;
    const targetStartTime = transposeToDate(currentStartTime, targetDate);
    const targetEndTime = transposeToDate(currentEndTime, targetDate);

    const candidateParams = {
      calendarEventId: eventId,
      title: event.title,
      currentDate: event.date,
      currentStartTime,
      targetDate,
      targetStartTime,
      targetEndTime,
    };

    const validated = rescheduleWorkoutParamsSchema.safeParse(candidateParams);
    if (!validated.success) continue;

    const rationale =
      typeof item.rationale === "string" && item.rationale.trim().length > 0
        ? item.rationale.trim()
        : `Move "${event.title}" to ${weekdayLabel(targetDate)} to help you stay consistent.`;
    const lifeArea = typeof item.life_area === "string" ? item.life_area : "fitness";
    const confidence =
      typeof item.confidence === "number" && isFinite(item.confidence)
        ? Math.max(0, Math.min(1, item.confidence))
        : null;

    try {
      await db.insert(proposedActionsTable).values({
        userId,
        actionType: "reschedule_workout",
        parameters: validated.data,
        rationale,
        lifeArea,
        confidence,
        status: "pending",
        expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MS),
      });
      batchPairs.add(pairKey);
      inserted++;
      break; // cap at exactly one proposal per run
    } catch (err) {
      logger.error({ err, userId }, "generateActionProposals: insert failed");
    }
  }

  if (inserted > 0) logger.info({ userId, inserted }, "Action proposals generated");
  return inserted;
}
