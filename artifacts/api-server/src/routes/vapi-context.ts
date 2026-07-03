import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, debriefExtractionsTable, goalsTable, insightsTable, userProfilesTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import {
  buildVapiContext,
  buildVapiSystemPrompt,
  generatePreCallIntelligence,
} from "../lib/buildVapiContext";
import {
  processDebriefTranscript,
  detectRecurringPatterns,
  type TranscriptEntry,
} from "../lib/processDebrief";
import { invalidateFromValoCache } from "../lib/fromValoInsight";

const router: IRouter = Router();

// ── System prompt templates ───────────────────────────────────────────────────
// These are intended for VAPI dashboard configuration. The assistant system
// prompt should end with {{context_string}}, which VAPI interpolates from the
// variableValues passed when the call starts (populated by buildVapiContext).

const SYSTEM_PROMPTS: Record<string, string> = {
  checkin: `You are Valo — a warm, perceptive life coach who always asks one question at a time.
Rules:
1) Ask exactly one question at a time. Do not chain questions.
2) Keep replies to 3 sentences or fewer unless the user asks you to elaborate.
3) Lead with what Valo already knows from the context injected below. Reference their recovery, a calendar event, or a streak naturally rather than asking for information you already have.
4) Mention one thing the user is doing well before asking about a gap.
5) On close, output exactly one SUGGESTED_ACTION line in this format:
   SUGGESTED_ACTION: "<label>" | "<actionType>" | <payload_json>
   Example:
   SUGGESTED_ACTION: "Add 30m focus block tomorrow" | "create_calendar_event" | {"time":"2026-06-03T15:00:00"}
6) If core areas have been covered (recovery, work, relationships, nutrition), offer a soft close: "We've covered the most important parts — want to wrap up or keep going?"
7) Use the user's onboarding motivation text verbatim when encouraging them.

CONTEXT:
{{context_string}}`,

  onboarding: `You are Valo, a warm and genuinely curious AI companion beginning your first conversation with this person. Your goal is to understand them well enough to personalize every future interaction. Cover: what their life priorities are right now, what they want more of, what drains them, what motivates them on hard days, and their most important current goal. Speak conversationally — one question at a time. Do not rush. At the end, confirm their preferred time for evening check-ins and let them know Valo will reach out then. Keep it to 10–12 minutes.

CONTEXT:
{{context_string}}`,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCallTime(hhmm: string | null | undefined): string {
  if (!hhmm) return "not set";
  const [h, m] = hhmm.split(":").map(Number);
  const period = (h ?? 0) >= 12 ? "PM" : "AM";
  const hour = (h ?? 0) % 12 || 12;
  return `${hour}:${String(m ?? 0).padStart(2, "0")} ${period}`;
}

function resolveUserId(req: any): string | null {
  const authUserId = (req as AuthenticatedRequest).userId;
  const rawUserId = Array.isArray(req.params.userId)
    ? req.params.userId[0]
    : req.params.userId;
  if (authUserId !== rawUserId) return null;
  return authUserId;
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleVapiContext(req: any, res: any): Promise<void> {
  const userId = resolveUserId(req);
  if (!userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const context = await buildVapiContext(userId);
    res.json(context);
  } catch (err: any) {
    req.log.error({ err }, "buildVapiContext failed");
    res.status(500).json({ error: "Failed to assemble context" });
  }
}

async function handleFirstCallContext(req: any, res: any): Promise<void> {
  const userId = resolveUserId(req);
  if (!userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const [profileRows, goals] = await Promise.all([
      db
        .select()
        .from(userProfilesTable)
        .where(eq(userProfilesTable.userId, userId))
        .limit(1),
      db
        .select({ title: goalsTable.title })
        .from(goalsTable)
        .where(eq(goalsTable.userId, userId))
        .limit(1),
    ]);

    const profile = profileRows[0];
    const firstName = (profile?.name ?? "").split(" ")[0] || "friend";

    res.json({
      user_name: firstName,
      user_identity: profile?.userIdentity ?? null,
      user_priorities: profile?.userPriorities ?? null,
      user_wants_more: profile?.userWantsMore ?? null,
      user_wants_less: profile?.userWantsLess ?? null,
      user_motivation: profile?.userMotivation ?? null,
      user_first_goal: goals[0]?.title ?? "not set yet",
      user_call_time: formatCallTime(profile?.preferredCallTime),
    });
  } catch (err: any) {
    req.log.error({ err }, "first-call-context failed");
    res.status(500).json({ error: "Failed to assemble first call context" });
  }
}

// Returns the system prompt template for a given assistant type.
// Use this in the VAPI dashboard as the assistant system prompt —
// VAPI will interpolate {{context_string}} from the variableValues
// passed at call-start time.
async function handleSystemPrompt(req: any, res: any): Promise<void> {
  const type = req.params.type as string;
  const prompt = SYSTEM_PROMPTS[type];
  if (!prompt) {
    res.status(404).json({ error: `Unknown assistant type: ${type}` });
    return;
  }
  res.json({ assistantType: type, systemPrompt: prompt });
}

// Mobile-initiated post-call debrief endpoint. Called by useVapiDebrief after
// the call ends, with the accumulated transcript from the VAPI JS SDK.
// The VAPI webhook also processes debrief for outbound (server-initiated) calls,
// so both flows are covered without double-processing.
async function handleVapiDebrief(req: any, res: any): Promise<void> {
  const userId = (req as AuthenticatedRequest).userId;
  const { transcript } = req.body as { transcript: TranscriptEntry[] };

  if (!Array.isArray(transcript)) {
    res.status(400).json({ error: "transcript must be an array" });
    return;
  }

  try {
    const extraction = await processDebriefTranscript(userId, transcript);
    res.status(200).json({ ok: true, extraction });

    // Mirror the outbound (VAPI webhook) post-processing path: detect
    // recurring patterns across recent debriefs and persist them to the
    // profile so {{memory_recurring_struggles}} reflects in-app check-ins the
    // same way it does phone-call debriefs, then invalidate the cached "From
    // Valo" home synthesis so it regenerates from the fresh data.
    await detectRecurringPatterns(userId).catch((err) => {
      req.log.error({ err, userId }, "detectRecurringPatterns failed in vapi/debrief");
    });
    invalidateFromValoCache(userId);
  } catch (err: any) {
    req.log.error({ err, userId }, "vapi/debrief process failed");
    res.status(500).json({ error: "Debrief processing failed" });
  }
}

// Auth-only context endpoint — no userId param; identity comes from the bearer token.
// Returns { context: string } matching the prompt spec format.
async function handleVapiContextAuth(req: any, res: any): Promise<void> {
  const userId = (req as AuthenticatedRequest).userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const data = await buildVapiContext(userId);
    res.json({ context: data.context_string ?? "" });
  } catch (err: any) {
    req.log.error({ err }, "buildVapiContext (auth) failed");
    res.status(500).json({ error: "Failed to assemble context" });
  }
}

// POST /vapi/system-prompt
// Body: { healthData?, basePrompt }
// Returns { systemPrompt } — the basePrompt with all {{placeholder}} values filled in.
// Intended to be called right before initiating a Vapi call; the returned string is
// passed to Vapi as the assistant's system prompt for that session.
async function handleBuildSystemPrompt(req: any, res: any): Promise<void> {
  const userId = (req as AuthenticatedRequest).userId;
  const { healthData, basePrompt } = req.body as {
    healthData?: Record<string, unknown>;
    basePrompt?: string;
  };

  if (!basePrompt) {
    res.status(400).json({ error: "basePrompt is required" });
    return;
  }

  try {
    const context = await buildVapiContext(userId);
    let intelligence = null;
    try {
      intelligence = await generatePreCallIntelligence(context, healthData ?? {});
    } catch {
      // Fail gracefully — intelligence enriches but is not required
    }
    const systemPrompt = buildVapiSystemPrompt(basePrompt, context, intelligence);
    res.json({ systemPrompt });
  } catch (err: any) {
    req.log.error({ err, userId }, "POST /vapi/system-prompt failed");
    res.status(500).json({ error: "Failed to build system prompt" });
  }
}

// GET /api/vapi/intel
// Lightweight read-only endpoint for the Home screen "From Valo" card.
// Reads stored data only — no AI generation triggered.
async function handleVapiIntel(req: any, res: any): Promise<void> {
  const userId = (req as AuthenticatedRequest).userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const [debriefRows, insightRows] = await Promise.all([
      db
        .select({
          oneStruggle: debriefExtractionsTable.oneStruggle,
          tomorrowIntention: debriefExtractionsTable.tomorrowIntention,
          primaryEmotion: debriefExtractionsTable.primaryEmotion,
          energyLevel: debriefExtractionsTable.energyLevel,
          date: debriefExtractionsTable.date,
        })
        .from(debriefExtractionsTable)
        .where(eq(debriefExtractionsTable.userId, userId))
        .orderBy(desc(debriefExtractionsTable.createdAt))
        .limit(1),
      db
        .select({ content: insightsTable.content })
        .from(insightsTable)
        .where(eq(insightsTable.userId, userId))
        .orderBy(desc(insightsTable.createdAt))
        .limit(1),
    ]);

    const debrief = debriefRows[0] ?? null;
    res.json({
      unresolved_thread: debrief?.oneStruggle ?? null,
      commitment: debrief?.tomorrowIntention ?? null,
      emotional_tone: debrief
        ? [debrief.primaryEmotion, debrief.energyLevel].filter(Boolean).join(", ") || null
        : null,
      last_call_date: debrief?.date ?? null,
      pattern_observation: insightRows[0]?.content ?? null,
    });
  } catch (err: any) {
    req.log.error({ err }, "GET /vapi/intel failed");
    res.status(500).json({ error: "Failed to assemble intel" });
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

router.post("/vapi/system-prompt", requireAuth, handleBuildSystemPrompt);
router.get("/vapi/context/:userId", requireAuth, handleVapiContext);
router.post("/vapi/context/:userId", requireAuth, handleVapiContext);
router.get("/vapi/context", requireAuth, handleVapiContextAuth);
router.post("/vapi/context", requireAuth, handleVapiContextAuth);
router.get("/vapi/first-call-context/:userId", requireAuth, handleFirstCallContext);
router.get("/vapi/system-prompt/:type", handleSystemPrompt);
router.post("/vapi/debrief", requireAuth, handleVapiDebrief);
router.get("/vapi/intel", requireAuth, handleVapiIntel);

export default router;
