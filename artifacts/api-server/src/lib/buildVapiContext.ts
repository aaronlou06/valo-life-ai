import { and, asc, desc, eq, gte } from "drizzle-orm";
import {
  calendarEventsTable,
  dailyLogsTable,
  db,
  goalsTable,
  habitsTable,
  insightsTable,
  logEntriesTable,
  moodEntriesTable,
  userProfilesTable,
} from "@workspace/db";

function dateAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0]!;
}

function numAvg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export async function buildVapiContext(userId: string): Promise<Record<string, unknown>> {
  const today = new Date().toISOString().split("T")[0]!;
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
    latestInsight,
    todayLogEntries,
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

    db.select().from(goalsTable).where(eq(goalsTable.userId, userId)),

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
      .from(insightsTable)
      .where(eq(insightsTable.userId, userId))
      .orderBy(desc(insightsTable.createdAt))
      .limit(1),

    db
      .select()
      .from(logEntriesTable)
      .where(and(eq(logEntriesTable.userId, userId), eq(logEntriesTable.date, today)))
      .orderBy(asc(logEntriesTable.createdAt)),
  ]);

  const log = todayLogRows[0];
  const profile = profileRows[0];

  // ── 30-day averages ──────────────────────────────────────────────────────
  const sleep_avg_30d = numAvg(logs30.filter((l) => l.sleepHours != null).map((l) => l.sleepHours!));
  const hrv_avg_30d = numAvg(logs30.filter((l) => l.hrv != null).map((l) => l.hrv!));
  const rhr_avg_30d = numAvg(logs30.filter((l) => l.restingHeartRate != null).map((l) => l.restingHeartRate!));

  // ── 14-day averages ──────────────────────────────────────────────────────
  const sleep_avg_14d = numAvg(logs14.filter((l) => l.sleepHours != null).map((l) => l.sleepHours!));
  const mood_avg_14d = numAvg(moods14.map((m) => m.score));
  const daysWithWorkout14 = logs14.filter((l) => l.workoutType != null).length;
  const workout_consistency_14d = Math.round((daysWithWorkout14 / 14) * 100);

  // ── Today's mood check-ins ───────────────────────────────────────────────
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
      ? habits
          .map((h) => `${h.name} (${h.streak}d streak, ${h.completedToday ? "done" : "pending"})`)
          .join("; ")
      : "none";
  const habits_completed_today =
    habits
      .filter((h) => h.completedToday)
      .map((h) => `${h.name} (${h.streak}d streak)`)
      .join(", ") || "none";
  const habits_pending_today =
    habits
      .filter((h) => !h.completedToday)
      .map((h) => h.name)
      .join(", ") || "none";

  // ── Goals ────────────────────────────────────────────────────────────────
  const topGoal = goals[0];
  const goals_summary =
    goals.length > 0
      ? goals.map((g) => `${g.title} (${g.progressPercent}%)`).join("; ")
      : "none";

  // ── Calendar ─────────────────────────────────────────────────────────────
  let meeting_count = calendarToday.length;
  let workday_hours = 0;
  let calendar_stress = "no";
  if (calendarToday.length > 0) {
    const first = calendarToday[0]!;
    const last = calendarToday[calendarToday.length - 1]!;
    if (first.startTime && last.endTime) {
      workday_hours =
        Math.round(
          ((last.endTime.getTime() - first.startTime.getTime()) / 3_600_000) * 10
        ) / 10;
    }
    if (meeting_count > 5 || workday_hours > 10) calendar_stress = "yes";
  }

  // ── Latest AI pattern ────────────────────────────────────────────────────
  const latest_pattern = latestInsight[0]?.content ?? null;

  // ── Focus sessions (fall back to log entries if not on daily log) ────────
  const focusEntries = todayLogEntries.filter((l) => l.type === "focus");
  const focus_sessions_count =
    log?.focusSessionsCount ??
    focusEntries.length;
  const focus_sessions_total_minutes =
    log?.focusSessionsTotalMinutes ??
    focusEntries.reduce((sum, l) => sum + (parseInt(l.value ?? "0") || 0), 0);

  return {
    // ── Identity ────────────────────────────────────────────────────────
    user_id: userId,
    user_name: profile?.name ?? "friend",
    user_priorities: profile?.lifePriorities ?? null,
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

    // ── 30-day rolling averages ──────────────────────────────────────────
    sleep_avg_30d: sleep_avg_30d != null ? +sleep_avg_30d.toFixed(1) : null,
    hrv_avg: hrv_avg_30d != null ? Math.round(hrv_avg_30d) : null,
    rhr_avg: rhr_avg_30d != null ? Math.round(rhr_avg_30d) : null,

    // ── 14-day rolling averages ──────────────────────────────────────────
    sleep_avg_14d: sleep_avg_14d != null ? +sleep_avg_14d.toFixed(1) : null,
    mood_avg_14d: mood_avg_14d != null ? +mood_avg_14d.toFixed(1) : null,
    workout_consistency_14d,

    // ── Lifestyle logs (today) ───────────────────────────────────────────
    mood_checkins_today,
    water_oz: log?.waterOz ?? null,
    meals_count: log?.mealsCount ?? null,
    morning_routine_completed:
      log?.morningRoutineCompleted != null
        ? log.morningRoutineCompleted
          ? "yes"
          : "no"
        : null,
    sunlight_logged:
      log?.sunlightLogged != null
        ? log.sunlightLogged
          ? "yes"
          : "no"
        : null,
    meditation_logged:
      log?.meditationLogged != null
        ? log.meditationLogged
          ? "yes"
          : "no"
        : null,
    focus_sessions_count,
    focus_sessions_total_minutes,

    // ── Goals ────────────────────────────────────────────────────────────
    top_goal: topGoal?.title ?? null,
    top_goal_progress: topGoal?.progressPercent ?? null,
    goals_summary,

    // ── Habits ───────────────────────────────────────────────────────────
    habits_summary,
    habits_completed_today,
    habits_pending_today,

    // ── Calendar ─────────────────────────────────────────────────────────
    meeting_count,
    workday_hours,
    calendar_stress,

    // ── Today's mood summary ─────────────────────────────────────────────
    mood_avg_today:
      todayMoods.length > 0
        ? +(todayMoods.reduce((s, m) => s + m.score, 0) / todayMoods.length).toFixed(1)
        : null,
    mood_count_today: todayMoods.length,

    // ── AI insight ───────────────────────────────────────────────────────
    latest_pattern,
  };
}
