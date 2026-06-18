import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  db,
  calendarEventsTable,
  dailyLogsTable,
  debriefExtractionsTable,
  goalsTable,
  habitCompletionsTable,
  habitsTable,
  logEntriesTable,
  userProfilesTable,
} from "@workspace/db";
import { logger } from "./logger";

export interface AskTurn {
  question: string;
  answer: string;
}

export interface AskCitation {
  source: string;
  date: string;
  excerpt: string;
}

export interface AskValoResult {
  answer: string;
  citations: AskCitation[];
}

// How many prior turns to feed back into the model for follow-up resolution.
// Capped so a long session doesn't keep inflating the request every turn.
const MAX_PRIOR_TURNS = 5;

const SYSTEM_PROMPT = `You are Valo, a warm, thoughtful personal life companion. The user is asking a natural-language question about their own life. You will be given a structured block of their own data (debrief reflections from check-in calls, journal entries, goals, habits, calendar events, long-term memory, and health metrics) plus, optionally, the recent back-and-forth of this same conversation so follow-up questions resolve.

Rules:
- Answer ONLY using the data provided. Do not use outside knowledge or assumptions about the user.
- Write in a calm, natural, companion-like voice — clean prose, not a footnoted report. Do not put citation markers inline in the prose.
- If the provided data does not contain an answer to the question, say so plainly (e.g. "I don't have anything logged about that yet") and return an empty citations array. Never infer, guess, or invent a citation to fill the gap. This honesty is the whole point — a fabricated citation is worse than admitting you don't know.
- When you do have supporting data, list the specific entries you drew from in the citations array, each with its source type, its date, and a short excerpt quoting or closely paraphrasing the underlying entry.

Return ONLY valid JSON in exactly this shape, with no markdown fences and no commentary:
{
  "answer": string,
  "citations": [
    { "source": string, "date": string, "excerpt": string }
  ]
}`;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0]!;
}

function isoDaysAhead(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0]!;
}

function safeJsonArray(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Remove a markdown code fence wherever it appears in the text, returning the
// fenced contents if present, otherwise the original text.
function stripFences(text: string): string {
  const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  return fence?.[1] ? fence[1].trim() : text.trim();
}

// The model frequently wraps the JSON object in conversational prose — a
// preamble before it and/or a trailing sentence after it — especially on
// no-data and follow-up turns. Slicing from the first `{` to the end leaves
// trailing characters that break JSON.parse, so instead we scan for the first
// balanced top-level object and return only that substring.
function extractJsonObject(text: string): string | null {
  const raw = stripFences(text);
  const start = raw.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

async function buildContextBlock(userId: string): Promise<string> {
  const today = new Date().toISOString().split("T")[0]!;
  const since14 = isoDaysAgo(14);
  const since30 = isoDaysAgo(30);
  const calStart = isoDaysAgo(7);
  const calEnd = isoDaysAhead(14);

  const [
    debriefs,
    journal,
    goals,
    habits,
    profileRows,
    logs,
    events,
  ] = await Promise.all([
    db
      .select()
      .from(debriefExtractionsTable)
      .where(eq(debriefExtractionsTable.userId, userId))
      .orderBy(desc(debriefExtractionsTable.date))
      .limit(14),
    db
      .select()
      .from(logEntriesTable)
      .where(eq(logEntriesTable.userId, userId))
      .orderBy(desc(logEntriesTable.date))
      .limit(30),
    db
      .select()
      .from(goalsTable)
      .where(eq(goalsTable.userId, userId))
      .orderBy(desc(goalsTable.updatedAt)),
    db
      .select()
      .from(habitsTable)
      .where(eq(habitsTable.userId, userId)),
    db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, userId))
      .limit(1),
    db
      .select()
      .from(dailyLogsTable)
      .where(eq(dailyLogsTable.userId, userId))
      .orderBy(desc(dailyLogsTable.date))
      .limit(14),
    db
      .select()
      .from(calendarEventsTable)
      .where(
        and(
          eq(calendarEventsTable.userId, userId),
          gte(calendarEventsTable.date, calStart),
          lte(calendarEventsTable.date, calEnd),
        ),
      )
      .orderBy(calendarEventsTable.date),
  ]);

  // Recent habit completions, used to characterise consistency.
  const habitIds = habits.map((h) => h.id);
  const completions =
    habitIds.length > 0
      ? await db
          .select()
          .from(habitCompletionsTable)
          .where(
            and(
              eq(habitCompletionsTable.userId, userId),
              inArray(habitCompletionsTable.habitId, habitIds),
              gte(habitCompletionsTable.completionDate, since14),
            ),
          )
      : [];

  const completionsByHabit = new Map<number, number>();
  for (const c of completions) {
    if (c.completed) {
      completionsByHabit.set(c.habitId, (completionsByHabit.get(c.habitId) ?? 0) + 1);
    }
  }

  const sections: string[] = [];
  sections.push(`Today's date: ${today}`);

  // ── Debrief reflections ──
  if (debriefs.length > 0) {
    const lines = debriefs.map((d) => {
      const parts = [
        d.moodScore != null ? `mood ${d.moodScore}/10` : null,
        d.primaryEmotion ? `feeling ${d.primaryEmotion}` : null,
        d.energyLevel ? `energy ${d.energyLevel}` : null,
        d.oneWin ? `win: ${d.oneWin}` : null,
        d.oneStruggle ? `struggle: ${d.oneStruggle}` : null,
        d.tomorrowIntention ? `intention: ${d.tomorrowIntention}` : null,
        d.workQuality ? `work: ${d.workQuality}` : null,
      ].filter((p): p is string => p !== null);
      const flags = safeJsonArray(d.flags) as string[];
      if (flags.length > 0) parts.push(`flags: ${flags.join(", ")}`);
      return `- ${d.date}: ${parts.join("; ")}`;
    });
    sections.push(`## Check-in debrief reflections (most recent first)\n${lines.join("\n")}`);
  }

  // ── Living Journal ──
  if (journal.length > 0) {
    const lines = journal.map((j) => {
      const body = j.value ? `: ${j.value}` : j.subtitle ? `: ${j.subtitle}` : "";
      return `- ${j.date} [${j.type}] ${j.title}${body}`;
    });
    sections.push(`## Living Journal entries (most recent first)\n${lines.join("\n")}`);
  }

  // ── Goals ──
  if (goals.length > 0) {
    const lines = goals.map((g) => {
      const parts = [`${g.progressPercent}% complete`, `category ${g.category}`];
      if (g.targetDate) parts.push(`target ${g.targetDate}`);
      if (g.currentValue != null && g.targetValue != null) {
        parts.push(`${g.currentValue}/${g.targetValue}${g.unit ? ` ${g.unit}` : ""}`);
      }
      if (g.notes) parts.push(`notes: ${g.notes}`);
      return `- ${g.title} (${parts.join("; ")})`;
    });
    sections.push(`## Goals\n${lines.join("\n")}`);
  }

  // ── Habits ──
  if (habits.length > 0) {
    const lines = habits.map((h) => {
      const recent = completionsByHabit.get(h.id) ?? 0;
      const parts = [
        `${h.type === "bad" ? "reducing" : "building"}`,
        `streak ${h.streak}`,
        `done ${recent}x in last 14d`,
        `target ${h.targetFrequency ?? 7}x/week`,
      ];
      return `- ${h.name} (${parts.join("; ")})`;
    });
    sections.push(`## Habits\n${lines.join("\n")}`);
  }

  // ── Calendar events (past week + next two weeks) ──
  if (events.length > 0) {
    const lines = events.map((e) => {
      const parts = [];
      if (e.startTime) {
        const t = new Date(e.startTime).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });
        parts.push(t);
      }
      if (e.location) parts.push(`at ${e.location}`);
      if (e.isCompleted) parts.push("completed");
      const meta = parts.length > 0 ? ` (${parts.join("; ")})` : "";
      return `- ${e.date}: ${e.title}${meta}`;
    });
    sections.push(`## Calendar events (${calStart} to ${calEnd})\n${lines.join("\n")}`);
  }

  // ── Long-term memory profile ──
  const profile = profileRows[0];
  if (profile) {
    const parts: string[] = [];
    const struggles = safeJsonArray(profile.recurringStruggles) as string[];
    if (struggles.length > 0) parts.push(`Recurring struggles: ${struggles.join("; ")}`);
    if (profile.userIdentity) parts.push(`Identity: ${profile.userIdentity}`);
    if (profile.userPriorities) parts.push(`Priorities: ${profile.userPriorities}`);
    if (profile.userWantsMore) parts.push(`Wants more of: ${profile.userWantsMore}`);
    if (profile.userWantsLess) parts.push(`Wants less of: ${profile.userWantsLess}`);
    if (profile.userMotivation) parts.push(`Motivation: ${profile.userMotivation}`);
    const workoutMem = safeJsonArray(profile.workoutMemory) as string[];
    if (workoutMem.length > 0) parts.push(`Workout memory: ${workoutMem.join("; ")}`);
    if (parts.length > 0) {
      sections.push(`## Long-term memory profile\n${parts.map((p) => `- ${p}`).join("\n")}`);
    }
  }

  // ── Health metrics ──
  if (logs.length > 0) {
    const lines = logs.map((l) => {
      const parts = [
        l.sleepHours != null ? `sleep ${l.sleepHours}h` : null,
        l.restingHeartRate != null ? `RHR ${l.restingHeartRate}` : null,
        l.hrv != null ? `HRV ${l.hrv}` : null,
        l.steps != null ? `${l.steps} steps` : null,
        l.activeCalories != null ? `${l.activeCalories} active cal` : null,
      ].filter((p): p is string => p !== null);
      if (parts.length === 0) return null;
      return `- ${l.date}: ${parts.join("; ")}`;
    });
    const filtered = lines.filter((l): l is string => l !== null);
    if (filtered.length > 0) {
      sections.push(`## Health metrics (most recent first)\n${filtered.join("\n")}`);
    }
  }

  if (sections.length === 1) {
    // Only the date header — the user has effectively no logged data yet.
    sections.push("(No logged data found for this user yet.)");
  }

  return sections.join("\n\n");
}

export async function answerUserQuestion(
  userId: string,
  question: string,
  priorTurns: AskTurn[] = [],
): Promise<AskValoResult> {
  const context = await buildContextBlock(userId);

  const recentTurns = priorTurns.slice(-MAX_PRIOR_TURNS);
  const conversation =
    recentTurns.length > 0
      ? `\n\nEARLIER IN THIS CONVERSATION (for resolving follow-ups):\n${recentTurns
          .map((t) => `Q: ${t.question}\nA: ${t.answer}`)
          .join("\n\n")}`
      : "";

  const userContent = `THE USER'S DATA:\n${context}${conversation}\n\nCURRENT QUESTION:\n${question}`;

  // Only a genuine upstream/network failure should bubble up as an error. The
  // model's formatting quirks (prose around the JSON, trailing commentary) are
  // recovered below rather than surfaced as a 500.
  let rawText = "";
  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });
    const block = message.content[0];
    rawText = block && block.type === "text" ? block.text : "";
  } catch (err) {
    logger.error({ err, userId }, "answerUserQuestion: Claude call failed");
    throw err;
  }

  let answer = "";
  let citations: AskCitation[] = [];

  const jsonStr = extractJsonObject(rawText);
  if (jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr) as {
        answer?: unknown;
        citations?: unknown;
      };
      if (typeof parsed.answer === "string") answer = parsed.answer;
      citations = Array.isArray(parsed.citations)
        ? parsed.citations
            .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
            .map((c) => ({
              source: typeof c.source === "string" ? c.source : "",
              date: typeof c.date === "string" ? c.date : "",
              excerpt: typeof c.excerpt === "string" ? c.excerpt : "",
            }))
            .filter((c) => c.source !== "" || c.excerpt !== "")
        : [];
    } catch (err) {
      logger.warn(
        { err, userId },
        "answerUserQuestion: JSON parse failed, falling back to prose",
      );
    }
  }

  // Fallback: the model answered in plain prose (no parseable JSON object).
  // Use that prose as the answer with no citations — this is the honest
  // no-data path rendering cleanly rather than erroring.
  if (!answer) {
    const prose = stripFences(rawText).trim();
    answer =
      prose ||
      "I'm having trouble pulling that together right now. Try asking again in a moment.";
    citations = [];
  }

  return { answer, citations };
}
