/**
 * Seed an existing test account with realistic, varied, multi-week fake data.
 *
 * Resolves an EXISTING user (never creates one), scopes every write to that
 * user, and supports an idempotent wipe-and-reseed. Re-running cleanly removes
 * the rows this script previously seeded for the target user and re-inserts.
 * No other user's data is ever touched, and nothing is wiped globally.
 *
 * Usage (pnpm only):
 *   pnpm --filter @workspace/scripts run seed:test-account
 *   pnpm --filter @workspace/scripts run seed:test-account -- --email someone@example.com --weeks 12
 *   pnpm --filter @workspace/scripts run seed:test-account -- --user-id 42
 *   pnpm --filter @workspace/scripts run seed:test-account:reset            (wipe only)
 *
 * Parameters (CLI flag or env var):
 *   --email     / SEED_EMAIL     target user email   (default aaronlou06@gmail.com)
 *   --user-id   / SEED_USER_ID   target user id      (overrides --email)
 *   --weeks     / SEED_WEEKS     weeks of history    (default 12)
 *   --reset-only                 wipe seeded data and exit (no re-insert)
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import {
  db,
  pool,
  usersTable,
  userProfilesTable,
  dailyLogsTable,
  debriefExtractionsTable,
  transcriptsTable,
  voiceDebriefsTable,
  insightsTable,
  habitsTable,
  verificationEventsTable,
  goalsTable,
  calendarEventsTable,
  exercisesTable,
  workoutSessionsTable,
  workoutSetLogsTable,
  workoutPersonalRecordsTable,
  workoutSummariesTable,
} from "@workspace/db";

// ── Marker ───────────────────────────────────────────────────────────────────
// Embedded in the `notes` field of tables that have one (calendar_events, goals)
// so the reset deletes ONLY rows this script created, leaving any real rows
// (e.g. synced Google Calendar events) untouched.
const SEED_MARKER = "[seed:test-account]";
const SEED_HABIT_NAMES = ["Morning meditation", "Read 20 minutes"];

// ── Args ───────────────────────────────────────────────────────────────────
function getArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return undefined;
}
const hasFlag = (flag: string) => process.argv.includes(flag);

const TARGET_EMAIL = getArg("--email") ?? process.env.SEED_EMAIL ?? "aaronlou06@gmail.com";
const TARGET_USER_ID = getArg("--user-id") ?? process.env.SEED_USER_ID;
const WEEKS = Number(getArg("--weeks") ?? process.env.SEED_WEEKS ?? "12");
const RESET_ONLY = hasFlag("--reset-only");

// ── Deterministic RNG (mulberry32) ───────────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260620);
const rand = (min: number, max: number) => min + rng() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));
const pick = <T>(arr: T[]): T => arr[randInt(0, arr.length - 1)]!;
const chance = (p: number) => rng() < p;
const round = (n: number, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

// ── Date helpers (local) ──────────────────────────────────────────────────────
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function atTime(d: Date, hour: number, min = 0): Date {
  const x = new Date(d);
  x.setHours(hour, min, 0, 0);
  return x;
}

// ── Content pools ─────────────────────────────────────────────────────────────
const EMOTIONS = ["calm", "focused", "tired", "anxious", "content", "energized", "frustrated", "hopeful", "grateful", "restless"];
const WORK_QUALITY = ["rough", "moderate", "productive", "great"];
const WORK_STRESS = ["low", "moderate", "high"];
const RELATIONSHIP_Q = ["strained", "neutral", "good", "great"];
const ENERGY_LEVEL = ["low", "moderate", "high"];
const WORKOUT_FELT = ["terrible", "hard", "okay", "good", "great"];
const NUTRITION_Q = ["poor", "moderate", "clean"];

// Recurring stressor themes — intentionally repeated across the range so the
// pattern detector and weekly recap have real material to surface.
const RECURRING_STRESSORS = [
  "Pressure from the product launch deadline",
  "Couldn't fall asleep, mind racing about work",
  "Tension with my co-founder about priorities",
];
const ONEOFF_STRESSORS = [
  "Skipped lunch and crashed in the afternoon",
  "Long commute ate into my evening",
  "Felt scattered jumping between too many tasks",
  "A tough call with a client drained me",
  "Money worries crept in tonight",
];
const WINS = [
  "Shipped the feature I'd been stuck on",
  "Had a real conversation with my partner over dinner",
  "Hit a new squat PR at the gym",
  "Said no to a meeting and protected deep work",
  "Cooked a proper meal instead of ordering in",
  "Went for a walk and cleared my head",
  "Closed out my inbox before 6pm",
  "Helped a teammate unblock their work",
];
const INTENTIONS = [
  "Start the day with the hardest task first",
  "Get to bed before 11pm",
  "Take a real lunch break away from the desk",
  "Call my mom",
  "Do the workout even if it's short",
  "Review the launch plan with the team",
  "Drink more water tomorrow",
];
const VALO_OBS = [
  "You light up when you protect time for deep work — that pattern keeps paying off.",
  "Sleep keeps showing up as the lever for your next day. Worth guarding.",
  "Your best days pair a workout with one meaningful conversation.",
  "The launch stress is real, but you handled it without losing your footing today.",
  "You're more grounded when you eat properly — your energy tracks it closely.",
  "Connection seems to recharge you more than rest alone does.",
];

function buildTranscript(day: {
  mood: number;
  win: string;
  struggle: string;
  intention: string;
  emotion: string;
}): string {
  const turns: Array<{ role: "assistant" | "user"; text: string }> = [
    { role: "assistant", text: "Hey, good to catch you. How did today land for you, on a scale of one to ten?" },
    { role: "user", text: `I'd say about a ${day.mood}. Feeling pretty ${day.emotion} honestly.` },
    { role: "assistant", text: "Got it. What's one thing that went well?" },
    { role: "user", text: day.win + "." },
    { role: "assistant", text: "Nice. And what weighed on you today?" },
    { role: "user", text: day.struggle + "." },
    { role: "assistant", text: "Thanks for being honest about that. What do you want tomorrow to look like?" },
    { role: "user", text: day.intention + "." },
    { role: "assistant", text: "Love it. I'll check in with you then." },
  ];
  return turns.map((t) => `${t.role === "assistant" ? "Valo" : "User"}: ${t.text}`).join("\n");
}

// ── Exercise plan ─────────────────────────────────────────────────────────────
// Big lifts that progress over the range to produce believable end-of-range PRs.
type LiftPlan = { slug: string; startKg: number; perWeekKg: number; reps: number; sets: number; isBig: boolean };
const PUSH: LiftPlan[] = [
  { slug: "Barbell_Bench_Press_-_Medium_Grip", startKg: 60, perWeekKg: 1.25, reps: 5, sets: 4, isBig: true },
  { slug: "Standing_Military_Press", startKg: 38, perWeekKg: 0.75, reps: 6, sets: 3, isBig: true },
];
const PULL: LiftPlan[] = [
  { slug: "Barbell_Deadlift", startKg: 100, perWeekKg: 2.5, reps: 4, sets: 3, isBig: true },
  { slug: "Bent_Over_Barbell_Row", startKg: 55, perWeekKg: 1.0, reps: 8, sets: 3, isBig: true },
  { slug: "Wide-Grip_Lat_Pulldown", startKg: 48, perWeekKg: 1.0, reps: 10, sets: 3, isBig: false },
];
const LEGS: LiftPlan[] = [
  { slug: "Barbell_Squat", startKg: 80, perWeekKg: 2.0, reps: 5, sets: 4, isBig: true },
  { slug: "Romanian_Deadlift", startKg: 65, perWeekKg: 1.25, reps: 8, sets: 3, isBig: false },
];
const SPLIT: Array<{ name: string; lifts: LiftPlan[] }> = [
  { name: "Push Day", lifts: PUSH },
  { name: "Pull Day", lifts: PULL },
  { name: "Leg Day", lifts: LEGS },
];
const epley = (kg: number, reps: number) => kg * (1 + reps / 30);

// ── Reset (scoped to one user) ────────────────────────────────────────────────
async function resetForUser(userId: string, startISO: string) {
  // Date-window deletion for date-keyed content tables. The window starts at
  // `startISO` (a fixed ~53-week lookback, NOT the current --weeks window) so a
  // later run with a smaller --weeks still cleans up rows from a prior larger
  // seed — keeping wipe-and-reseed clean across parameter changes while staying
  // bounded (never older than ~1 year). workout_set_logs and workout_summaries
  // cascade from workout_sessions. PRs are re-derived so deleted by userId.
  await db.delete(dailyLogsTable).where(and(eq(dailyLogsTable.userId, userId), gte(dailyLogsTable.date, startISO)));
  await db.delete(debriefExtractionsTable).where(and(eq(debriefExtractionsTable.userId, userId), gte(debriefExtractionsTable.date, startISO)));
  await db.delete(transcriptsTable).where(and(eq(transcriptsTable.userId, userId), gte(transcriptsTable.date, startISO)));
  await db.delete(voiceDebriefsTable).where(and(eq(voiceDebriefsTable.userId, userId), gte(voiceDebriefsTable.callDate, startISO)));
  await db.delete(insightsTable).where(and(eq(insightsTable.userId, userId), gte(insightsTable.date, startISO)));
  await db.delete(verificationEventsTable).where(and(eq(verificationEventsTable.userId, userId), gte(verificationEventsTable.occurrenceDate, startISO)));

  // Marker-based deletion so real/synced rows survive.
  await db.delete(calendarEventsTable).where(and(eq(calendarEventsTable.userId, userId), eq(calendarEventsTable.notes, SEED_MARKER)));
  await db.delete(goalsTable).where(and(eq(goalsTable.userId, userId), eq(goalsTable.notes, SEED_MARKER)));

  // Entity tables.
  await db.delete(workoutPersonalRecordsTable).where(eq(workoutPersonalRecordsTable.userId, userId));
  await db.delete(workoutSessionsTable).where(and(eq(workoutSessionsTable.userId, userId), gte(workoutSessionsTable.date, startISO)));
  await db.delete(habitsTable).where(and(eq(habitsTable.userId, userId), inArray(habitsTable.name, SEED_HABIT_NAMES)));

  console.log(`  reset complete for user ${userId} (window from ${startISO})`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!Number.isFinite(WEEKS) || WEEKS < 1 || WEEKS > 52) {
    throw new Error(`Invalid --weeks value: ${WEEKS}. Expected 1..52.`);
  }

  // Resolve the EXISTING user — never create.
  let userRow: { id: number; email: string } | undefined;
  if (TARGET_USER_ID) {
    const id = Number(TARGET_USER_ID);
    if (!Number.isInteger(id)) throw new Error(`Invalid --user-id: ${TARGET_USER_ID}`);
    const rows = await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, id));
    userRow = rows[0];
  } else {
    const rows = await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable).where(eq(usersTable.email, TARGET_EMAIL));
    userRow = rows[0];
  }
  if (!userRow) {
    throw new Error(
      `Target user not found (${TARGET_USER_ID ? `id=${TARGET_USER_ID}` : `email=${TARGET_EMAIL}`}). ` +
        `This script only seeds an EXISTING account and will not create one.`
    );
  }

  // users.id is a serial integer; every per-user table references it via a TEXT
  // user_id column. Convert here and use the text id everywhere downstream.
  const userId = String(userRow.id);
  console.log(`Target user: ${userRow.email} (id=${userRow.id} -> user_id="${userId}")`);

  // Date range: [start .. today], `WEEKS` full weeks ending today.
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const totalDays = WEEKS * 7;
  const start = addDays(today, -(totalDays - 1));
  const startISO = toISO(start);
  const days: Date[] = [];
  for (let i = 0; i < totalDays; i++) days.push(addDays(start, i));
  console.log(`Range: ${startISO} .. ${toISO(today)} (${totalDays} days, ${WEEKS} weeks)`);

  // Reset over a fixed ~53-week lookback (independent of --weeks) so reseeding
  // with a smaller --weeks still removes rows from any prior larger seed.
  const resetStartISO = toISO(addDays(today, -(53 * 7)));
  console.log(`Resetting previously seeded rows for this user (reset window from ${resetStartISO})...`);
  await resetForUser(userId, resetStartISO);

  if (RESET_ONLY) {
    console.log("--reset-only set: skipping re-insert. Done.");
    await pool.end();
    return;
  }

  // Quiet week: one week (debriefs absent) roughly 5-6 weeks ago. Daily logs
  // still exist that week (mirrors HealthKit auto-sync).
  const quietWeekIndex = Math.max(1, WEEKS - 7);
  const isQuietDay = (dayIndex: number) => Math.floor(dayIndex / 7) === quietWeekIndex;

  // ── Plan workouts first (so daily logs can reflect workout days) ────────────
  const workoutWeekdays = [1, 2, 4, 6]; // Mon, Tue, Thu, Sat
  type PlannedSet = { weightKg: number | null; reps: number | null; durationSec: number | null; isWarmup: boolean; rpe: number | null };
  type PlannedExercise = { slug: string; isBig: boolean; sets: PlannedSet[] };
  type PlannedSession = {
    date: Date;
    name: string;
    exercises: PlannedExercise[];
    durationSec: number;
    effort: number;
    avgHr: number;
    maxHr: number;
    calories: number;
  };
  const sessions: PlannedSession[] = [];
  let splitCursor = 0;
  for (let w = 0; w < WEEKS; w++) {
    const isDeload = w === Math.floor(WEEKS / 2); // one deload week mid-range
    // 3-4 sessions/week, with a bit of variance.
    const sessionDays = chance(0.5) ? workoutWeekdays : workoutWeekdays.slice(0, 3);
    for (const wd of sessionDays) {
      const dayIndex = w * 7 + ((wd - start.getDay() + 7) % 7);
      if (dayIndex >= totalDays) continue;
      const date = days[dayIndex]!;
      if (!date) continue;
      const block = SPLIT[splitCursor % SPLIT.length]!;
      splitCursor++;
      const exercises: PlannedExercise[] = [];
      for (const lift of block.lifts) {
        const progressed = lift.startKg + lift.perWeekKg * w;
        const base = isDeload ? progressed * 0.85 : progressed;
        // round to nearest 1.25kg plate increment
        const top = round(base / 1.25) * 1.25;
        const sets: PlannedSet[] = [];
        // warmup
        sets.push({ weightKg: round((top * 0.5) / 1.25) * 1.25, reps: lift.reps + 4, durationSec: null, isWarmup: true, rpe: null });
        for (let s = 0; s < lift.sets; s++) {
          const reps = lift.reps + (chance(0.3) ? randInt(-1, 1) : 0);
          sets.push({ weightKg: top, reps: Math.max(1, reps), durationSec: null, isWarmup: false, rpe: randInt(6, 9) });
        }
        exercises.push({ slug: lift.slug, isBig: lift.isBig, sets });
      }
      // a finisher: pullups or plank
      if (block.name === "Pull Day") {
        exercises.push({
          slug: "Pullups",
          isBig: false,
          sets: Array.from({ length: 3 }, () => ({ weightKg: null, reps: randInt(5, 11), durationSec: null, isWarmup: false, rpe: randInt(7, 9) })),
        });
      } else if (block.name === "Leg Day") {
        exercises.push({
          slug: "Plank",
          isBig: false,
          sets: Array.from({ length: 3 }, () => ({ weightKg: null, reps: 1, durationSec: randInt(45, 100), isWarmup: false, rpe: randInt(6, 9) })),
        });
      }
      sessions.push({
        date,
        name: block.name,
        exercises,
        durationSec: randInt(2700, 4500),
        effort: randInt(6, 9),
        avgHr: randInt(118, 142),
        maxHr: randInt(160, 186),
        calories: randInt(300, 620),
      });
    }
  }
  const workoutByDate = new Map(sessions.map((s) => [toISO(s.date), s]));

  // ── Build per-day debrief decisions + content ────────────────────────────────
  type DebriefDay = {
    date: string;
    mood: number;
    energy: number;
    emotion: string;
    energyLevel: string;
    workQuality: string;
    workStress: string;
    relationshipQuality: string;
    meaningfulConnection: boolean;
    senseOfPurpose: number;
    motivationLevel: number;
    morningRoutineDone: boolean;
    workoutFelt: string | null;
    nutritionQuality: string;
    win: string;
    struggle: string;
    intention: string;
    wins: string[];
    stressors: string[];
    intentions: string[];
    valoObservation: string;
    flags: string[];
  };
  const debriefs: DebriefDay[] = [];
  days.forEach((d, i) => {
    const iso = toISO(d);
    if (isQuietDay(i)) return; // quiet week: no debriefs
    // ~62% of (non-quiet) days have a debrief, weighted lower on weekends.
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    if (!chance(isWeekend ? 0.4 : 0.68)) return;

    const mood = randInt(3, 9);
    const lowDay = mood <= 4;
    const stressors: string[] = [];
    // recurring themes appear frequently → detectable patterns
    if (chance(0.55)) stressors.push(pick(RECURRING_STRESSORS));
    if (chance(0.4)) stressors.push(pick(ONEOFF_STRESSORS));
    if (stressors.length === 0) stressors.push(pick(ONEOFF_STRESSORS));
    const wins = [pick(WINS)];
    if (chance(0.4)) wins.push(pick(WINS));
    const intentions = [pick(INTENTIONS)];
    if (chance(0.3)) intentions.push(pick(INTENTIONS));
    const flags: string[] = [];
    if (lowDay) flags.push("low mood");
    if (stressors.some((s) => s.includes("asleep"))) flags.push("sleep concern");
    if (stressors.some((s) => s.includes("co-founder"))) flags.push("relationship tension");

    const hadWorkout = workoutByDate.has(iso);
    debriefs.push({
      date: iso,
      mood,
      energy: Math.min(10, Math.max(1, mood + randInt(-2, 2))),
      emotion: lowDay ? pick(["tired", "anxious", "frustrated", "restless"]) : pick(["calm", "focused", "content", "energized", "grateful", "hopeful"]),
      energyLevel: lowDay ? pick(["low", "moderate"]) : pick(ENERGY_LEVEL),
      workQuality: lowDay ? pick(["rough", "moderate"]) : pick(WORK_QUALITY),
      workStress: lowDay ? pick(["moderate", "high"]) : pick(WORK_STRESS),
      relationshipQuality: pick(RELATIONSHIP_Q),
      meaningfulConnection: chance(0.45),
      senseOfPurpose: Math.min(10, Math.max(1, mood + randInt(-1, 2))),
      motivationLevel: Math.min(10, Math.max(1, mood + randInt(-2, 1))),
      morningRoutineDone: chance(0.6),
      workoutFelt: hadWorkout ? pick(WORKOUT_FELT) : null,
      nutritionQuality: pick(NUTRITION_Q),
      win: wins[0]!,
      struggle: stressors[0]!,
      intention: intentions[0]!,
      wins,
      stressors,
      intentions,
      valoObservation: pick(VALO_OBS),
      flags,
    });
  });
  const debriefByDate = new Map(debriefs.map((d) => [d.date, d]));

  // ── Insert daily logs (with workout + debrief mood mirror) ───────────────────
  const dailyRows = days.map((d, i) => {
    const iso = toISO(d);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const wo = workoutByDate.get(iso);
    const db_ = debriefByDate.get(iso);
    // base variability + occasional low/strong days
    const lowEnergyDay = chance(0.14);
    const strongDay = chance(0.14);
    let steps = randInt(6000, 11000) + (isWeekend ? randInt(-2000, 4000) : 0);
    if (lowEnergyDay) steps = randInt(1800, 4200);
    if (strongDay) steps = randInt(12000, 17000);
    let sleep = round(rand(6.2, 8.2), 1);
    if (lowEnergyDay) sleep = round(rand(4.3, 5.8), 1);
    if (strongDay) sleep = round(rand(7.8, 9.0), 1);
    const rhr = lowEnergyDay ? randInt(58, 66) : strongDay ? randInt(46, 52) : randInt(50, 60);
    const hrv = lowEnergyDay ? randInt(28, 45) : strongDay ? randInt(70, 105) : randInt(45, 80);
    const sleepScore = Math.max(40, Math.min(98, Math.round(sleep * 11 + randInt(-6, 6))));
    const recovery = lowEnergyDay ? randInt(30, 55) : strongDay ? randInt(78, 96) : randInt(55, 82);
    return {
      userId,
      date: iso,
      sleepHours: sleep,
      sleepScore,
      hrv,
      restingHeartRate: rhr,
      steps,
      activeCalories: Math.round(steps * 0.04) + randInt(80, 260),
      respiratoryRate: randInt(13, 17),
      workoutType: wo ? "Strength" : chance(0.12) ? "Cardio" : null,
      workoutDuration: wo ? Math.round(wo.durationSec / 60) : null,
      workoutEffort: wo ? wo.effort : null,
      workoutHrPeak: wo ? wo.maxHr : null,
      recoveryScore: recovery,
      stressScore: lowEnergyDay ? randInt(55, 85) : randInt(20, 55),
      readinessScore: recovery + randInt(-6, 6),
      moodScore: db_ ? db_.mood : null,
      primaryEmotion: db_ ? db_.emotion : null,
      energyLevel: db_ ? db_.energyLevel : null,
      meaningfulConnection: db_ ? db_.meaningfulConnection : null,
      waterOz: chance(0.7) ? randInt(32, 96) : null,
      mealsCount: chance(0.6) ? randInt(2, 4) : null,
      morningRoutineCompleted: chance(0.5),
      sunlightLogged: chance(0.4),
      meditationLogged: chance(0.4),
      focusSessionsCount: chance(0.5) ? randInt(1, 4) : null,
      focusSessionsTotalMinutes: chance(0.5) ? randInt(25, 180) : null,
    };
  });
  await chunkInsert(dailyLogsTable, dailyRows);
  console.log(`  daily_logs: ${dailyRows.length}`);

  // ── Insert debrief records (transcripts, extractions, voice, insights) ───────
  const transcriptRows = debriefs.map((d) => ({ userId, date: d.date, fullText: buildTranscript(d) }));
  await chunkInsert(transcriptsTable, transcriptRows);

  const extractionRows = debriefs.map((d) => ({
    userId,
    date: d.date,
    moodScore: d.mood,
    primaryEmotion: d.emotion,
    energyLevel: d.energyLevel,
    workQuality: d.workQuality,
    workStress: d.workStress,
    meaningfulConnection: d.meaningfulConnection,
    relationshipQuality: d.relationshipQuality,
    senseOfPurpose: d.senseOfPurpose,
    motivationLevel: d.motivationLevel,
    morningRoutineDone: d.morningRoutineDone,
    workoutFelt: d.workoutFelt,
    nutritionQuality: d.nutritionQuality,
    oneWin: d.win,
    oneStruggle: d.struggle,
    tomorrowIntention: d.intention,
    valoObservation: d.valoObservation,
    flags: JSON.stringify(d.flags),
  }));
  await chunkInsert(debriefExtractionsTable, extractionRows);

  const voiceRows = debriefs.map((d) => ({
    userId,
    callDate: d.date,
    transcriptText: buildTranscript(d),
    mood: d.mood,
    energy: d.energy,
    wins: JSON.stringify(d.wins),
    stressors: JSON.stringify(d.stressors),
    intentions: JSON.stringify(d.intentions),
    rawJson: JSON.stringify({
      mood_score: d.mood,
      energy: d.energy,
      wins: d.wins,
      stressors: d.stressors,
      intentions: d.intentions,
      primary_emotion: d.emotion,
      energy_level: d.energyLevel,
      work_quality: d.workQuality,
      work_stress: d.workStress,
      meaningful_connection: d.meaningfulConnection,
      relationship_quality: d.relationshipQuality,
      sense_of_purpose: d.senseOfPurpose,
      motivation_level: d.motivationLevel,
      morning_routine_done: d.morningRoutineDone,
      workout_felt: d.workoutFelt,
      nutrition_quality: d.nutritionQuality,
      one_win: d.win,
      one_struggle: d.struggle,
      tomorrow_intention: d.intention,
      valo_observation: d.valoObservation,
      flags: d.flags,
    }),
  }));
  await chunkInsert(voiceDebriefsTable, voiceRows);

  const insightRows = debriefs.map((d) => ({
    userId,
    date: d.date,
    label: "Debrief insight",
    content: d.valoObservation,
    followUpQuestion: `Tomorrow you wanted to: ${d.intention}`,
  }));
  await chunkInsert(insightsTable, insightRows);
  console.log(`  debriefs: ${debriefs.length} (transcripts + extractions + voice_debriefs + insights)`);

  // ── Insert workouts + set logs + summaries, derive PRs ──────────────────────
  const usedSlugs = Array.from(new Set(sessions.flatMap((s) => s.exercises.map((e) => e.slug))));
  const exRows = await db
    .select({ id: exercisesTable.id, slug: exercisesTable.slug })
    .from(exercisesTable)
    .where(inArray(exercisesTable.slug, usedSlugs));
  const exIdBySlug = new Map(exRows.map((r) => [r.slug!, r.id]));
  const missing = usedSlugs.filter((s) => !exIdBySlug.has(s));
  if (missing.length) console.warn(`  WARNING: missing exercises (skipped): ${missing.join(", ")}`);

  type PrBest = { exerciseId: number; e1rm: number; weightKg: number; reps: number; sessionId: number; achievedAt: Date };
  const prBest = new Map<number, PrBest>();
  let sessionCount = 0;
  let setCount = 0;
  let pbMarks = 0;

  // chronological so PRs accrue forward
  const sortedSessions = [...sessions].sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const s of sortedSessions) {
    const startedAt = atTime(s.date, randInt(6, 19), pick([0, 15, 30, 45]));
    const completedAt = new Date(startedAt.getTime() + s.durationSec * 1000);
    const [inserted] = await db
      .insert(workoutSessionsTable)
      .values({
        userId,
        date: toISO(s.date),
        name: s.name,
        status: "completed",
        startedAt,
        completedAt,
        durationSec: s.durationSec,
        perceivedEffort: s.effort,
        notes: SEED_MARKER,
        avgHr: s.avgHr,
        maxHr: s.maxHr,
        timeInZone: { z1: randInt(120, 400), z2: randInt(300, 900), z3: randInt(120, 600), z4: randInt(0, 240) },
        caloriesKcal: s.calories,
      })
      .returning({ id: workoutSessionsTable.id });
    const sessionId = inserted!.id;
    sessionCount++;

    const setRows: Array<typeof workoutSetLogsTable.$inferInsert> = [];
    for (const ex of s.exercises) {
      const exId = exIdBySlug.get(ex.slug);
      if (!exId) continue;
      let setNum = 0;
      for (const st of ex.sets) {
        setNum++;
        let isPB = false;
        if (ex.isBig && !st.isWarmup && st.weightKg && st.reps) {
          const e1rm = epley(st.weightKg, st.reps);
          const prev = prBest.get(exId);
          if (!prev || e1rm > prev.e1rm) {
            isPB = true;
            pbMarks++;
            prBest.set(exId, { exerciseId: exId, e1rm, weightKg: st.weightKg, reps: st.reps, sessionId, achievedAt: completedAt });
          }
        }
        setRows.push({
          sessionId,
          exerciseId: exId,
          setNumber: setNum,
          weightKg: st.weightKg,
          reps: st.reps,
          durationSec: st.durationSec,
          rpe: st.rpe,
          isWarmup: st.isWarmup,
          isPersonalBest: isPB,
        });
      }
    }
    await chunkInsert(workoutSetLogsTable, setRows);
    setCount += setRows.length;
  }
  console.log(`  workout_sessions: ${sessionCount}, workout_set_logs: ${setCount}, PB sets marked: ${pbMarks}`);

  // Final all-time PRs (one row per big lift).
  const prRows = Array.from(prBest.values()).map((p) => ({
    userId,
    exerciseId: p.exerciseId,
    metricType: "1rm_kg",
    value: round(p.e1rm, 1),
    weightKg: round(p.weightKg, 1),
    reps: p.reps,
    estimatedOneRepMax: round(p.e1rm, 1),
    sessionId: p.sessionId,
    achievedAt: p.achievedAt,
  }));
  if (prRows.length) await chunkInsert(workoutPersonalRecordsTable, prRows);
  console.log(`  workout_personal_records: ${prRows.length}`);

  // Summaries for the most recent ~8 sessions (feeds workout memory display).
  const summaryRows: Array<typeof workoutSummariesTable.$inferInsert> = [];
  const recentSessions = await db
    .select({ id: workoutSessionsTable.id, name: workoutSessionsTable.name, date: workoutSessionsTable.date })
    .from(workoutSessionsTable)
    .where(and(eq(workoutSessionsTable.userId, userId), gte(workoutSessionsTable.date, startISO)))
    .orderBy(sql`${workoutSessionsTable.date} desc`)
    .limit(8);
  for (const rs of recentSessions) {
    summaryRows.push({
      userId,
      sessionId: rs.id,
      summaryText: `${rs.name} on ${rs.date}: solid session, hit all planned sets with good form. Pressing and pulling strength trending up.`,
      keyFacts: { session: rs.name, date: rs.date, trend: "progressing" },
      memoryMergedAt: new Date(),
    });
  }
  if (summaryRows.length) await chunkInsert(workoutSummariesTable, summaryRows);
  console.log(`  workout_summaries: ${summaryRows.length}`);

  // ── Habits + mixed completions ───────────────────────────────────────────────
  // Habit A: daily (scheduled every day). Habit B: weekdays only (Mon-Fri).
  const [habitA] = await db
    .insert(habitsTable)
    .values({ userId, name: SEED_HABIT_NAMES[0]!, category: "mindfulness", type: "good", targetFrequency: 7 })
    .returning({ id: habitsTable.id });
  const [habitB] = await db
    .insert(habitsTable)
    .values({ userId, name: SEED_HABIT_NAMES[1]!, category: "growth", type: "good", targetFrequency: 5 })
    .returning({ id: habitsTable.id });

  const completionRows: Array<typeof verificationEventsTable.$inferInsert> = [];
  // `recordMissed` distinguishes daily habits (per-day occurrences that can be
  // missed) from flexible weekly-target habits, which only ever record the days
  // a run actually happened — they are never marked "missed" per day.
  const buildCompletions = (
    habitId: number,
    scheduledOn: (d: Date) => boolean,
    completeProb: number,
    recordMissed: boolean,
  ) => {
    let lastCompleted: string | null = null;
    let streak = 0;
    let longest = 0;
    let completedToday = false;
    days.forEach((d) => {
      const iso = toISO(d);
      if (!scheduledOn(d)) return; // not scheduled → no row
      const done = chance(completeProb);
      if (done) {
        completionRows.push({
          habitId,
          userId,
          occurrenceDate: iso,
          status: "done",
          provenance: "confirmed",
        });
        lastCompleted = iso;
        streak += 1;
        longest = Math.max(longest, streak);
        if (iso === toISO(today)) completedToday = true;
      } else {
        if (recordMissed) {
          completionRows.push({
            habitId,
            userId,
            occurrenceDate: iso,
            status: "missed",
            provenance: "confirmed",
          });
        }
        streak = 0;
      }
    });
    return { lastCompleted, streak, longest, completedToday };
  };

  const aStats = buildCompletions(habitA!.id, () => true, 0.72, true);
  const bStats = buildCompletions(habitB!.id, (d) => d.getDay() >= 1 && d.getDay() <= 5, 0.6, false);
  await chunkInsert(verificationEventsTable, completionRows);
  await db
    .update(habitsTable)
    .set({ streak: aStats.streak, longestStreak: aStats.longest, lastCompletedDate: aStats.lastCompleted, completedToday: aStats.completedToday })
    .where(eq(habitsTable.id, habitA!.id));
  await db
    .update(habitsTable)
    .set({ streak: bStats.streak, longestStreak: bStats.longest, lastCompletedDate: bStats.lastCompleted, completedToday: bStats.completedToday })
    .where(eq(habitsTable.id, habitB!.id));
  console.log(`  habits: 2, verification_events: ${completionRows.length} (mixed done/missed)`);

  // ── Goals ─────────────────────────────────────────────────────────────────────
  const goalRows = [
    {
      userId,
      title: "Squat 120kg",
      targetDate: toISO(addDays(today, 60)),
      progressPercent: 70,
      category: "fitness",
      goalType: "performance",
      currentValue: 100,
      targetValue: 120,
      unit: "kg",
      direction: "up",
      notes: SEED_MARKER,
    },
    {
      userId,
      title: "Ship the product launch",
      targetDate: toISO(addDays(today, 21)),
      progressPercent: 55,
      category: "work",
      goalType: "milestone",
      milestones: JSON.stringify([
        { id: 1, title: "Finalize spec", completed: true },
        { id: 2, title: "Build core flow", completed: true },
        { id: 3, title: "Beta with 10 users", completed: false },
        { id: 4, title: "Public launch", completed: false },
      ]),
      notes: SEED_MARKER,
    },
    {
      userId,
      title: "Sleep 7+ hours consistently",
      targetDate: toISO(addDays(today, 45)),
      progressPercent: 40,
      category: "health",
      goalType: "consistency",
      currentValue: 4,
      targetValue: 7,
      unit: "nights/week",
      direction: "up",
      notes: SEED_MARKER,
    },
  ];
  await chunkInsert(goalsTable, goalRows);
  console.log(`  goals: ${goalRows.length}`);

  // ── Calendar events ─────────────────────────────────────────────────────────
  const eventTemplates: Array<{ offset: number; title: string; type: string; hour: number; dur: number; location?: string }> = [
    { offset: -40, title: "Quarterly planning", type: "work", hour: 10, dur: 2, location: "Office" },
    { offset: -26, title: "Dentist appointment", type: "appointment", hour: 9, dur: 1, location: "Downtown Dental" },
    { offset: -14, title: "Dinner with Sarah", type: "personal", hour: 19, dur: 2, location: "Bestia" },
    { offset: -7, title: "1:1 with co-founder", type: "work", hour: 15, dur: 1 },
    { offset: -3, title: "Long run", type: "workout", hour: 7, dur: 1, location: "River trail" },
    { offset: 1, title: "Launch review", type: "work", hour: 11, dur: 2, location: "Office" },
    { offset: 2, title: "Therapy", type: "appointment", hour: 17, dur: 1 },
    { offset: 4, title: "Weekend hike", type: "personal", hour: 8, dur: 4, location: "Eaton Canyon" },
    { offset: 9, title: "Flight to NYC", type: "travel", hour: 6, dur: 6, location: "LAX" },
    { offset: 12, title: "Investor coffee", type: "work", hour: 9, dur: 1, location: "Blue Bottle" },
  ];
  const eventRows = eventTemplates.map((e) => {
    const d = addDays(today, e.offset);
    const st = atTime(d, e.hour, 0);
    const en = new Date(st.getTime() + e.dur * 3600 * 1000);
    return {
      userId,
      date: toISO(d),
      title: e.title,
      startTime: st,
      endTime: en,
      location: e.location ?? null,
      type: e.type,
      notes: SEED_MARKER,
      isCompleted: e.offset < 0,
    };
  });
  await chunkInsert(calendarEventsTable, eventRows);
  console.log(`  calendar_events: ${eventRows.length}`);

  // ── Profile / identity (upsert, preserves auth/phone/push fields) ─────────────
  const profileFields = {
    name: "Aaron",
    userIdentity: "Someone who builds with focus and stays grounded — a calm, present founder and a dependable partner.",
    userMotivation: "Building something that genuinely helps people, while staying healthy enough to enjoy it.",
    lifePriorities: JSON.stringify(["Health", "Relationships", "Work & Mission"]),
    userPriorities: JSON.stringify(["Ship the launch", "Sleep & recovery", "Show up for the people I love"]),
    userWantsMore: "Deep work, time outdoors, real conversations",
    userWantsLess: "Doomscrolling, late nights, reactive busywork",
    topGoal: "Ship the product launch without burning out",
    biologicalSex: "male",
    age: 31,
    maxHeartRate: 189,
    weightKg: 82,
    wearableDevice: "Apple Watch",
    workoutDaysPerWeek: 4,
    dietType: "balanced",
    wakeTime: "06:30",
    bedTime: "23:00",
    onboardingCompleted: true,
    firstCallCompleted: true,
  };
  await db
    .insert(userProfilesTable)
    .values({ userId, ...profileFields })
    .onConflictDoUpdate({ target: userProfilesTable.userId, set: profileFields });
  console.log(`  user_profiles: upserted identity/profile fields`);

  console.log("\nSeed complete.");
  console.log("NOTE: no commitments/accountability data was seeded — there is no DB table for it (the Accountability screen uses hardcoded mock data).");
  console.log("NOTE: POST /api/debrief/process only writes today's date, so it was NOT used for historical backfill; debriefs were inserted directly in the pipeline's output shape.");
  await pool.end();
}

// ── Chunked insert helper ─────────────────────────────────────────────────────
async function chunkInsert(table: any, rows: any[], chunk = 200) {
  for (let i = 0; i < rows.length; i += chunk) {
    await db.insert(table).values(rows.slice(i, i + chunk));
  }
}

main().catch(async (err) => {
  console.error("Seed failed:", err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
