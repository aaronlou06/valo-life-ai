import { and, asc, desc, eq, gte } from "drizzle-orm";
import {
  calendarEventsTable,
  dailyLogsTable,
  db,
  debriefExtractionsTable,
  goalsTable,
  habitsTable,
  insightsTable,
  logEntriesTable,
  moodEntriesTable,
  remindersTable,
  userProfilesTable,
} from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";

function formatCallTime(hhmm: string | null | undefined): string {
  if (!hhmm) return "not set";
  const [h, m] = hhmm.split(":").map(Number);
  const period = (h ?? 0) >= 12 ? "PM" : "AM";
  const hour = (h ?? 0) % 12 || 12;
  return `${hour}:${String(m ?? 0).padStart(2, "0")} ${period}`;
}

function dateAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0]!;
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0]!;
}

function numAvg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function fmtTime(dt: Date | null | undefined): string {
  if (!dt) return "";
  return dt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtReminderSecs(secs: number): string {
  if (secs >= 7 * 86400) return "7 days";
  if (secs >= 5 * 86400) return "5 days";
  if (secs >= 3 * 86400) return "3 days";
  if (secs >= 2 * 86400) return "2 days";
  if (secs >= 86400) return "1 day";
  if (secs >= 12 * 3600) return "12 hours";
  if (secs >= 8 * 3600) return "8 hours";
  if (secs >= 4 * 3600) return "4 hours";
  if (secs >= 2 * 3600) return "2 hours";
  if (secs >= 3600) return "1 hour";
  if (secs >= 1800) return "30 min";
  return "15 min";
}

export function computeReadiness(
  hrv: number | null,
  sleep: number | null,
  rhr: number | null
): "Good" | "Fair" | "Low" | "Unknown" {
  if (hrv == null && sleep == null && rhr == null) return "Unknown";

  let score = 0;
  let factors = 0;

  if (hrv != null) {
    factors++;
    if (hrv >= 50) score += 2;
    else if (hrv >= 35) score += 1;
  }
  if (sleep != null) {
    factors++;
    if (sleep >= 7.5) score += 2;
    else if (sleep >= 6) score += 1;
  }
  if (rhr != null) {
    factors++;
    if (rhr <= 62) score += 2;
    else if (rhr <= 70) score += 1;
  }

  if (factors === 0) return "Unknown";
  const ratio = score / (factors * 2);
  if (ratio >= 0.67) return "Good";
  if (ratio >= 0.34) return "Fair";
  return "Low";
}

function buildContextString(data: Record<string, unknown>): string {
  const lines: string[] = [];

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  lines.push(`USER CONTEXT (Today is ${dateStr}):`);

  const name = (data.user_name as string) || "User";
  const identity = data.user_identity as string | null;
  lines.push(`- Name: ${name}${identity ? ` | Identity: ${identity}` : ""}`);

  const hrv = data.hrv_today as number | null;
  const sleep = data.sleep_hours as number | null;
  const rhr = data.rhr_today as number | null;
  const readiness = data.readiness_label as string;
  const hrv14Avg = data.hrv_avg_14d as number | null;
  const recoveryParts: string[] = [];
  if (hrv != null) {
    recoveryParts.push(hrv14Avg != null ? `HRV ${hrv} ms today, 14-day avg ${hrv14Avg} ms` : `HRV ${hrv} ms`);
  }
  if (sleep != null) recoveryParts.push(`Sleep ${sleep} hrs`);
  if (rhr != null) recoveryParts.push(`Resting HR ${rhr} bpm`);
  lines.push(
    recoveryParts.length > 0
      ? `- Recovery: ${recoveryParts.join(", ")}. Readiness: ${readiness}`
      : `- Recovery: No wearable data yet. Readiness: ${readiness}`
  );

  const steps = data.steps_today as number | null;
  const workoutType = data.workout_type as string | null;
  const workoutDuration = data.workout_duration as number | null;
  const movParts: string[] = [];
  if (steps != null) movParts.push(`${steps.toLocaleString()} steps`);
  if (workoutType) movParts.push(`${workoutType}${workoutDuration ? ` (${workoutDuration} min)` : ""}`);
  lines.push(
    movParts.length > 0
      ? `- Movement: ${movParts.join(", ")}`
      : `- Movement: No movement logged yet`
  );

  const top3 = data.top3_goals as Array<{ title: string; progressPercent: number }> | null;
  if (top3 && top3.length > 0) {
    lines.push(`- Goals: ${top3.map((g) => `${g.title} (${g.progressPercent}%)`).join(", ")}`);
  } else {
    lines.push(`- Goals: No active goals set`);
  }

  const habitsCompleted = data.habits_completed_today as string;
  const habitsPending = data.habits_pending_today as string;
  const habitParts: string[] = [];
  if (habitsCompleted && habitsCompleted !== "none") habitParts.push(`Done: ${habitsCompleted}`);
  if (habitsPending && habitsPending !== "none") habitParts.push(`Pending: ${habitsPending}`);
  if (habitParts.length > 0) lines.push(`- Habits: ${habitParts.join(" | ")}`);

  const habitsOnStreak = data.habits_on_streak as string | null;
  if (habitsOnStreak) lines.push(`- Habits on streak: ${habitsOnStreak}`);

  const calToday = data.calendar_today_str as string | null;
  if (calToday) lines.push(`- Today calendar: ${calToday}`);

  const calTomorrow = data.calendar_tomorrow_str as string | null;
  if (calTomorrow) lines.push(`- Tomorrow calendar: ${calTomorrow}`);

  const entityReminders = data.entity_reminders_str as string | null;
  if (entityReminders) lines.push(`- Active reminders: ${entityReminders}`);

  const motivation = data.user_motivation as string | null;
  if (motivation) {
    lines.push(`- Motivation language (use verbatim when encouraging): "${motivation}"`);
  }

  lines.push(`- Diet context: ${data.diet_context as string}`);

  const toAsk = data.uncovered_areas as string | null;
  if (toAsk && toAsk !== "all areas covered") {
    lines.push(`- What to explore: ${toAsk}`);
  }

  const callTime = data.user_call_time as string;
  if (callTime !== "not set") lines.push(`- Preferred call time: ${callTime}`);

  lines.push(
    "\nREMINDER MANAGEMENT INSTRUCTIONS: When the user mentions reminders (e.g. 'remind me 2 days before my dentist', 'turn off reminders for gym', 'what reminders do I have'), use the reminders API. " +
    "To create: POST /api/reminders { type: 'event'|'routine', label, scheduledTime (HH:MM), isActive: true, metadata: { entityId, entityType, remindBeforeSeconds } }. " +
    "To deactivate without deleting (records are preserved and return when re-enabled): PATCH /api/reminders/{id} { isActive: false }. " +
    "To re-enable: PATCH /api/reminders/{id} { isActive: true }. " +
    "To delete permanently: DELETE /api/reminders/{id}. " +
    "After any change, confirm by restating the entity name and the offset in plain language (e.g. 'Done — I have set a reminder 2 days before your dentist appointment').",
  );

  return lines.join("\n");
}

export async function buildVapiContext(userId: string): Promise<Record<string, unknown>> {
  const today = new Date().toISOString().split("T")[0]!;
  const tomorrow = dateOffset(1);
  const d14 = dateAgo(14);
  const d30 = dateAgo(30);

  const [
    todayLogRows,
    logs30,
    logs14,
    todayMoods,
    moods14,
    habits,
    goals,
    profileRows,
    calendarToday,
    calendarTomorrow,
    latestInsight,
    todayLogEntries,
    entityReminderRows,
    recentDebriefs,
  ] = await Promise.all([
    db
      .select()
      .from(dailyLogsTable)
      .where(and(eq(dailyLogsTable.userId, userId), eq(dailyLogsTable.date, today)))
      .limit(1),

    db
      .select()
      .from(dailyLogsTable)
      .where(and(eq(dailyLogsTable.userId, userId), gte(dailyLogsTable.date, d30)))
      .orderBy(desc(dailyLogsTable.date)),

    db
      .select()
      .from(dailyLogsTable)
      .where(and(eq(dailyLogsTable.userId, userId), gte(dailyLogsTable.date, d14)))
      .orderBy(desc(dailyLogsTable.date)),

    db
      .select()
      .from(moodEntriesTable)
      .where(and(eq(moodEntriesTable.userId, userId), eq(moodEntriesTable.date, today)))
      .orderBy(asc(moodEntriesTable.createdAt)),

    db
      .select()
      .from(moodEntriesTable)
      .where(and(eq(moodEntriesTable.userId, userId), gte(moodEntriesTable.date, d14)))
      .orderBy(desc(moodEntriesTable.createdAt)),

    db.select().from(habitsTable).where(eq(habitsTable.userId, userId)),

    db
      .select()
      .from(goalsTable)
      .where(eq(goalsTable.userId, userId))
      .orderBy(desc(goalsTable.updatedAt)),

    db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, userId))
      .limit(1),

    db
      .select()
      .from(calendarEventsTable)
      .where(and(eq(calendarEventsTable.userId, userId), eq(calendarEventsTable.date, today)))
      .orderBy(asc(calendarEventsTable.startTime)),

    db
      .select()
      .from(calendarEventsTable)
      .where(and(eq(calendarEventsTable.userId, userId), eq(calendarEventsTable.date, tomorrow)))
      .orderBy(asc(calendarEventsTable.startTime)),

    db
      .select()
      .from(insightsTable)
      .where(eq(insightsTable.userId, userId))
      .orderBy(desc(insightsTable.createdAt))
      .limit(1),

    db
      .select()
      .from(logEntriesTable)
      .where(and(eq(logEntriesTable.userId, userId), eq(logEntriesTable.date, today)))
      .orderBy(asc(logEntriesTable.createdAt)),

    db
      .select()
      .from(remindersTable)
      .where(and(eq(remindersTable.userId, userId), eq(remindersTable.isActive, true))),

    db
      .select()
      .from(debriefExtractionsTable)
      .where(eq(debriefExtractionsTable.userId, userId))
      .orderBy(desc(debriefExtractionsTable.createdAt))
      .limit(5),
  ]);

  const log = todayLogRows[0];
  const profile = profileRows[0];
  const lastDebrief = recentDebriefs[0] ?? null;

  // Prefer AI-detected cross-call patterns (written by detectRecurringPatterns
  // after each call-end). Fall back to raw oneStruggle list if not yet computed.
  const storedPatterns = profile?.recurringStruggles
    ? (JSON.parse(profile.recurringStruggles) as string[])
    : null;
  const recentStruggles: string[] =
    storedPatterns ??
    recentDebriefs.filter((d) => d.oneStruggle).map((d) => d.oneStruggle!);

  // ── Entity reminders ─────────────────────────────────────────────────────────
  const activeEntityReminders = entityReminderRows.filter(
    (r) => r.type === "event" || r.type === "routine",
  );
  const reminderByEntity = new Map<string, { label: string; type: string; offsets: string[] }>();
  for (const r of activeEntityReminders) {
    const m = r.metadata as { entityId?: string; remindBeforeSeconds?: number } | null;
    const entityId = m?.entityId ?? String(r.id);
    const key = `${r.type}:${entityId}`;
    if (!reminderByEntity.has(key)) {
      reminderByEntity.set(key, { label: r.label, type: r.type, offsets: [] });
    }
    reminderByEntity.get(key)!.offsets.push(fmtReminderSecs(m?.remindBeforeSeconds ?? 0));
  }
  const entity_reminders_str =
    reminderByEntity.size > 0
      ? Array.from(reminderByEntity.values())
          .map((e) => `"${e.label}" (${e.type}): ${e.offsets.join(", ")} before`)
          .join("; ")
      : null;

  // ── 30-day averages ──────────────────────────────────────────────────────
  const sleep_avg_30d = numAvg(logs30.filter((l) => l.sleepHours != null).map((l) => l.sleepHours!));
  const hrv_avg_30d = numAvg(logs30.filter((l) => l.hrv != null).map((l) => l.hrv!));
  const rhr_avg_30d = numAvg(logs30.filter((l) => l.restingHeartRate != null).map((l) => l.restingHeartRate!));

  // ── 14-day averages ──────────────────────────────────────────────────────
  const sleep_avg_14d = numAvg(logs14.filter((l) => l.sleepHours != null).map((l) => l.sleepHours!));
  const hrv_avg_14d = numAvg(logs14.filter((l) => l.hrv != null).map((l) => l.hrv!));
  const mood_avg_14d = numAvg(moods14.map((m) => m.score));
  const daysWithWorkout14 = logs14.filter((l) => l.workoutType != null).length;
  const workout_consistency_14d = Math.round((daysWithWorkout14 / 14) * 100);

  // ── Today's mood ─────────────────────────────────────────────────────────
  const mood_checkins_today =
    todayMoods.length > 0
      ? todayMoods
          .map((m) => {
            const t = new Date(m.createdAt).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            });
            return `${t}: ${m.score}/10${m.note ? ` — ${m.note}` : ""}`;
          })
          .join("; ")
      : "none";

  // ── Habits ───────────────────────────────────────────────────────────────
  const habits_summary =
    habits.length > 0
      ? habits.map((h) => `${h.name} (${h.streak}d streak, ${h.completedToday ? "done" : "pending"})`).join("; ")
      : "none";
  const habits_completed_today =
    habits.filter((h) => h.completedToday).map((h) => `${h.name} (${h.streak}d streak)`).join(", ") || "none";
  const habits_pending_today =
    habits.filter((h) => !h.completedToday).map((h) => h.name).join(", ") || "none";

  // ── Goals — top 3 by most recently updated ───────────────────────────────
  const topGoal = goals[0];
  const top3Goals = goals.slice(0, 3).map((g) => ({
    title: g.title,
    progressPercent: g.progressPercent,
  }));
  const goals_summary =
    goals.length > 0 ? goals.map((g) => `${g.title} (${g.progressPercent}%)`).join("; ") : "none";

  // ── Calendar (today) ─────────────────────────────────────────────────────
  const meeting_count = calendarToday.length;
  let workday_hours = 0;
  let calendar_stress = "no";
  if (calendarToday.length > 0) {
    const first = calendarToday[0]!;
    const last = calendarToday[calendarToday.length - 1]!;
    if (first.startTime && last.endTime) {
      workday_hours =
        Math.round(((last.endTime.getTime() - first.startTime.getTime()) / 3_600_000) * 10) / 10;
    }
    if (meeting_count > 5 || workday_hours > 10) calendar_stress = "yes";
  }

  const calendar_today_str =
    calendarToday.length > 0
      ? calendarToday.map((e) => `${e.title}${e.startTime ? ` at ${fmtTime(e.startTime)}` : ""}`).join(", ") +
        ` [${calendarToday.length} event${calendarToday.length !== 1 ? "s" : ""}]`
      : null;

  const calendar_tomorrow_str =
    calendarTomorrow.length > 0
      ? calendarTomorrow
          .slice(0, 3)
          .map((e) => `${e.title}${e.startTime ? ` at ${fmtTime(e.startTime)}` : ""}`)
          .join(", ")
      : null;

  // ── Focus sessions ───────────────────────────────────────────────────────
  const focusEntries = todayLogEntries.filter((l) => l.type === "focus");
  const focus_sessions_count = log?.focusSessionsCount ?? focusEntries.length;
  const focus_sessions_total_minutes =
    log?.focusSessionsTotalMinutes ??
    focusEntries.reduce((sum, l) => sum + (parseInt(l.value ?? "0") || 0), 0);

  // ── Derived context fields ────────────────────────────────────────────────
  const readiness_label = computeReadiness(
    log?.hrv ?? null,
    log?.sleepHours ?? null,
    log?.restingHeartRate ?? null
  );

  const NO_DIET_VALUES = new Set([
    "", "none", "no specific plan", "no specific diet", "not specified", "n/a", "other",
  ]);
  const diet_context =
    profile?.dietType && !NO_DIET_VALUES.has(profile.dietType.toLowerCase())
      ? `User follows ${profile.dietType} diet`
      : "No specific diet";

  const uncoveredAreas: string[] = [];
  if (!log?.sleepHours) uncoveredAreas.push("sleep quality");
  if (!log?.workoutType) uncoveredAreas.push("movement/workout");
  if (todayMoods.length === 0) uncoveredAreas.push("mood and energy");
  if (!log?.waterOz) uncoveredAreas.push("hydration");
  if (!log?.mealsCount) uncoveredAreas.push("nutrition");
  if (habits_pending_today !== "none") uncoveredAreas.push(`pending habits (${habits_pending_today})`);
  const uncovered_areas = uncoveredAreas.length > 0 ? uncoveredAreas.join(", ") : "all areas covered";

  const latest_pattern = latestInsight[0]?.content ?? null;

  const data: Record<string, unknown> = {
    // ── Identity ─────────────────────────────────────────────────────────
    user_id: userId,
    user_name: (profile?.name ?? "").split(" ")[0] || "friend",
    user_identity: profile?.userIdentity ?? null,
    user_priorities: profile?.userPriorities ?? null,
    user_wants_more: profile?.userWantsMore ?? null,
    user_wants_less: profile?.userWantsLess ?? null,
    user_motivation: profile?.userMotivation ?? null,
    user_first_goal: goals[0]?.title ?? "not set yet",
    user_call_time: formatCallTime(profile?.preferredCallTime),
    first_call_completed: profile?.firstCallCompleted ?? false,
    date_today: today,

    // ── Wearables (today) ────────────────────────────────────────────────
    sleep_hours: log?.sleepHours ?? null,
    sleep_score: log?.sleepScore ?? null,
    hrv_today: log?.hrv ?? null,
    rhr_today: log?.restingHeartRate ?? null,
    steps_today: log?.steps ?? null,
    active_calories: log?.activeCalories ?? null,
    workout_logged: log?.workoutType != null ? "yes" : "no",
    workout_type: log?.workoutType ?? null,
    workout_duration: log?.workoutDuration ?? null,
    workout_hr_peak: log?.workoutHrPeak ?? null,
    recovery_score: log?.recoveryScore ?? null,
    stress_score: log?.stressScore ?? null,
    readiness_score: log?.readinessScore ?? null,
    readiness_label,

    // ── 30-day rolling averages ──────────────────────────────────────────
    sleep_avg_30d: sleep_avg_30d != null ? +sleep_avg_30d.toFixed(1) : null,
    hrv_avg: hrv_avg_30d != null ? Math.round(hrv_avg_30d) : null,
    rhr_avg: rhr_avg_30d != null ? Math.round(rhr_avg_30d) : null,

    // ── 14-day rolling averages ──────────────────────────────────────────
    sleep_avg_14d: sleep_avg_14d != null ? +sleep_avg_14d.toFixed(1) : null,
    hrv_avg_14d: hrv_avg_14d != null ? Math.round(hrv_avg_14d) : null,
    mood_avg_14d: mood_avg_14d != null ? +mood_avg_14d.toFixed(1) : null,
    workout_consistency_14d,

    // ── Lifestyle logs (today) ───────────────────────────────────────────
    mood_checkins_today,
    water_oz: log?.waterOz ?? null,
    meals_count: log?.mealsCount ?? null,
    morning_routine_completed:
      log?.morningRoutineCompleted != null ? (log.morningRoutineCompleted ? "yes" : "no") : null,
    sunlight_logged: log?.sunlightLogged != null ? (log.sunlightLogged ? "yes" : "no") : null,
    meditation_logged: log?.meditationLogged != null ? (log.meditationLogged ? "yes" : "no") : null,
    focus_sessions_count,
    focus_sessions_total_minutes,

    // ── Goals ────────────────────────────────────────────────────────────
    top_goal: topGoal?.title ?? null,
    top_goal_progress: topGoal?.progressPercent ?? null,
    goals_summary,
    top3_goals: top3Goals,

    // ── Habits ───────────────────────────────────────────────────────────
    habits_summary,
    habits_completed_today,
    habits_pending_today,
    habits_on_streak:
      habits.filter((h) => h.streak > 0).map((h) => `${h.name} (${h.streak} days)`).join(", ") || null,

    // ── Calendar ─────────────────────────────────────────────────────────
    meeting_count,
    workday_hours,
    calendar_stress,
    calendar_today_str,
    calendar_tomorrow_str,

    // ── Today's mood summary ─────────────────────────────────────────────
    mood_avg_today:
      todayMoods.length > 0
        ? +(todayMoods.reduce((s, m) => s + m.score, 0) / todayMoods.length).toFixed(1)
        : null,
    mood_count_today: todayMoods.length,

    // ── Diet / context ───────────────────────────────────────────────────
    diet_context,
    uncovered_areas,

    // ── AI insight ───────────────────────────────────────────────────────
    latest_pattern,

    // ── Entity reminders ─────────────────────────────────────────────────
    entity_reminders_str,

    // ── Last call (most recent debrief extraction) ────────────────────────
    last_call_date: lastDebrief?.date ?? null,
    last_call_emotional_tone: lastDebrief
      ? [lastDebrief.primaryEmotion, lastDebrief.energyLevel].filter(Boolean).join(", ") || null
      : null,
    last_call_unresolved_threads: lastDebrief?.oneStruggle ? [lastDebrief.oneStruggle] : [],
    last_call_commitments: lastDebrief?.tomorrowIntention ? [lastDebrief.tomorrowIntention] : [],
    recent_struggles: recentStruggles,
  };

  // context_string is built last — it references the fields above
  data.context_string = buildContextString(data);

  return data;
}

// ── Pre-call intelligence ─────────────────────────────────────────────────────

export interface PreCallIntelligence {
  pattern_observation: string;
  unresolved_thread: string;
  suggested_question: string;
  emotional_baseline: string;
  data_anomaly: string | null;
}

export async function generatePreCallIntelligence(
  context: Record<string, unknown>,
  healthData: Record<string, unknown> = {}
): Promise<PreCallIntelligence | null> {
  const lastCallDate = context.last_call_date as string | null;
  const lastCallTone = context.last_call_emotional_tone as string | null;
  const lastStruggle = (context.last_call_unresolved_threads as string[])[0] ?? "none";

  const summaryLines = [
    `User: ${context.user_name}`,
    `Goals: ${context.goals_summary}`,
    `Recovery: HRV ${context.hrv_today ?? "N/A"}, Sleep ${context.sleep_hours ?? "N/A"} hrs, RHR ${context.rhr_today ?? "N/A"}`,
    `14-day mood avg: ${context.mood_avg_14d ?? "N/A"}, HRV avg: ${context.hrv_avg_14d ?? "N/A"}`,
    `Workout consistency (14d): ${context.workout_consistency_14d}%`,
    `Habits: ${context.habits_summary}`,
    `Last call (${lastCallDate ?? "N/A"}): tone "${lastCallTone ?? "N/A"}", open struggle: "${lastStruggle}"`,
    `Recent pattern: ${context.latest_pattern ?? "none"}`,
    Object.keys(healthData).length > 0 ? `Health data: ${JSON.stringify(healthData)}` : null,
  ].filter((l): l is string => l !== null);

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: `You are generating pre-call intelligence for Valo, a personal AI life companion. Surface non-obvious insights so Valo opens with genuine wisdom, not just data readback.

Rules:
- pattern_observation: something the user probably has not consciously connected themselves
- unresolved_thread: the most emotionally significant open item
- suggested_question: specific, not generic — feels like it comes from someone paying close attention
- emotional_baseline: read between the lines — what is the real trend
- data_anomaly: only populate if something is genuinely unusual vs history, otherwise null

USER DATA:
${summaryLines.join("\n")}

Return ONLY valid JSON with no markdown:
{
  "pattern_observation": "...",
  "unresolved_thread": "...",
  "suggested_question": "...",
  "emotional_baseline": "...",
  "data_anomaly": "..." or null
}`,
        },
      ],
    });

    const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    const clean = text.replace(/```(?:json)?\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(clean) as PreCallIntelligence;
  } catch {
    return null;
  }
}

// ── System prompt builder ─────────────────────────────────────────────────────

function numberedList(items: string[]): string {
  if (items.length === 0) return "None recorded yet";
  return items.map((item, i) => `${i + 1}. ${item}`).join("\n");
}

export function buildVapiSystemPrompt(
  basePrompt: string,
  context: Record<string, unknown>,
  intelligence: PreCallIntelligence | null
): string {
  const recentStruggles = (context.recent_struggles as string[] | undefined) ?? [];
  const userPriorities = context.user_priorities as string | null;
  const userWantsMore = context.user_wants_more as string | null;
  const userIdentity = context.user_identity as string | null;
  const userMotivation = context.user_motivation as string | null;
  const dietContext = context.diet_context as string | null;
  const goalsSummary = context.goals_summary as string | null;
  const moodAvg14d = context.mood_avg_14d as number | null;
  const lastCallTone = context.last_call_emotional_tone as string | null;
  const lastCallDate = context.last_call_date as string | null;
  const lastCallUnresolved = (context.last_call_unresolved_threads as string[] | undefined) ?? [];
  const lastCallCommitments = (context.last_call_commitments as string[] | undefined) ?? [];

  const thingsTheMatter = [userPriorities, userWantsMore]
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  const emotionalPatterns = [
    moodAvg14d != null ? `14-day mood avg ${moodAvg14d}/10` : null,
    lastCallTone,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);

  const personalDetails = [userIdentity, dietContext, userMotivation]
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  const openCommitments = goalsSummary?.split("; ").filter(Boolean) ?? [];

  const replacements: Record<string, string> = {
    // Memory placeholders
    memory_recurring_struggles: numberedList(recentStruggles),
    memory_things_that_matter: numberedList(thingsTheMatter),
    memory_emotional_patterns: numberedList(emotionalPatterns),
    memory_personal_details: numberedList(personalDetails),
    memory_open_commitments: numberedList(openCommitments),
    // Last-call placeholders
    last_call_date: lastCallDate
      ? new Date(lastCallDate).toLocaleDateString("en-US", {
          weekday: "long", month: "long", day: "numeric",
        })
      : "Not available",
    last_call_emotional_tone: lastCallTone ?? "Not available",
    last_call_unresolved_threads: lastCallDate
      ? numberedList(lastCallUnresolved)
      : "Not available",
    last_call_commitments: lastCallDate
      ? numberedList(lastCallCommitments)
      : "Not available",
    // Intelligence placeholders
    intel_pattern_observation: intelligence?.pattern_observation ?? "Not available",
    intel_unresolved_thread: intelligence?.unresolved_thread ?? "Not available",
    intel_suggested_question: intelligence?.suggested_question ?? "Not available",
    intel_emotional_baseline: intelligence?.emotional_baseline ?? "Not available",
    intel_data_anomaly: intelligence?.data_anomaly ?? "None today",
    // Backward-compatible context_string injection
    context_string: (context.context_string as string | undefined) ?? "",
  };

  return basePrompt.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return key in replacements ? replacements[key]! : `{{${key}}}`;
  });
}
