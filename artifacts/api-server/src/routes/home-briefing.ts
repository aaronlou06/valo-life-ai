import { Router, type IRouter } from "express";
import { eq, and, desc, gte } from "drizzle-orm";
import {
  db,
  userProfilesTable,
  dailyLogsTable,
  calendarEventsTable,
  habitsTable,
  insightsTable,
  debriefExtractionsTable,
  personalDatesTable,
  goalsTable,
  googleTokensTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().split("T")[0]!;
}

function getTimeOfDay(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function eventStartMinutes(startTime: Date | null | undefined): number | null {
  if (!startTime) return null;
  return startTime.getHours() * 60 + startTime.getMinutes();
}

function formatEventTime(startTime: Date | null | undefined): string | null {
  if (!startTime) return null;
  return startTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function daysUntilDate(month: number, day: number): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const thisYear = now.getFullYear();
  const candidate = new Date(thisYear, month - 1, day);
  candidate.setHours(0, 0, 0, 0);
  if (candidate.getTime() < now.getTime()) {
    const next = new Date(thisYear + 1, month - 1, day);
    next.setHours(0, 0, 0, 0);
    return Math.round((next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }
  return Math.round((candidate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function computeReadinessLabel(
  hrv: number | null,
  sleep: number | null,
  rhr: number | null,
): "Good" | "Fair" | "Low" {
  let score = 0;
  let factors = 0;
  if (hrv != null) { factors++; if (hrv >= 50) score += 2; else if (hrv >= 35) score += 1; }
  if (sleep != null) { factors++; if (sleep >= 7.5) score += 2; else if (sleep >= 6) score += 1; }
  if (rhr != null) { factors++; if (rhr <= 62) score += 2; else if (rhr <= 70) score += 1; }
  if (factors === 0) return "Low";
  const ratio = score / (factors * 2);
  if (ratio >= 0.67) return "Good";
  if (ratio >= 0.34) return "Fair";
  return "Low";
}

// ── Types ─────────────────────────────────────────────────────────────────────

type CardAccent = "sage" | "amber" | "rose" | "terracotta" | "good" | "fair" | "low" | "muted";
type CardType = "event" | "readiness" | "habits" | "countdown" | "connect_calendar" | "add_habits";

interface ScoredCard {
  type: CardType;
  title: string;
  subtitle: string;
  accent: CardAccent;
  action: string;
  score: number;
}

interface BriefingCard {
  type: CardType;
  title: string;
  subtitle: string;
  accent: CardAccent;
  action: string;
}

interface FromValo {
  kind: "unresolved_thread" | "pattern_observation" | "commitment" | "emotional_baseline";
  text: string;
  cta_label?: string;
  cta_action?: string;
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.get("/home-briefing", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const tod = getTimeOfDay();
  const today = todayISO();
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();

  try {
    const [
      profileRows,
      todayLog,
      calendarEvents,
      habits,
      debriefRows,
      insightRows,
      personalDates,
      goals,
      googleTokenRows,
    ] = await Promise.all([
      db.select({ name: userProfilesTable.name })
        .from(userProfilesTable)
        .where(eq(userProfilesTable.userId, userId))
        .limit(1),

      db.select()
        .from(dailyLogsTable)
        .where(and(eq(dailyLogsTable.userId, userId), eq(dailyLogsTable.date, today)))
        .limit(1)
        .then((rows) => rows[0] ?? null),

      db.select()
        .from(calendarEventsTable)
        .where(and(eq(calendarEventsTable.userId, userId), gte(calendarEventsTable.date, today)))
        .orderBy(calendarEventsTable.date),

      db.select()
        .from(habitsTable)
        .where(eq(habitsTable.userId, userId)),

      db.select({
        oneStruggle: debriefExtractionsTable.oneStruggle,
        tomorrowIntention: debriefExtractionsTable.tomorrowIntention,
        primaryEmotion: debriefExtractionsTable.primaryEmotion,
        energyLevel: debriefExtractionsTable.energyLevel,
      })
        .from(debriefExtractionsTable)
        .where(eq(debriefExtractionsTable.userId, userId))
        .orderBy(desc(debriefExtractionsTable.createdAt))
        .limit(1),

      db.select({ content: insightsTable.content })
        .from(insightsTable)
        .where(eq(insightsTable.userId, userId))
        .orderBy(desc(insightsTable.createdAt))
        .limit(1),

      db.select()
        .from(personalDatesTable)
        .where(eq(personalDatesTable.userId, userId)),

      db.select({ title: goalsTable.title, targetDate: goalsTable.targetDate })
        .from(goalsTable)
        .where(eq(goalsTable.userId, userId)),

      db.select({ id: googleTokensTable.id })
        .from(googleTokensTable)
        .where(eq(googleTokensTable.userId, userId))
        .limit(1),
    ]);

    // ── Derived state ─────────────────────────────────────────────────────────

    const profile = profileRows[0];
    const firstName = (profile?.name ?? "").split(" ")[0] || "there";
    const hasGoogleToken = googleTokenRows.length > 0;
    const calendarConnected = hasGoogleToken || calendarEvents.length > 0;
    const wearableConnected = !!(todayLog?.hrv || todayLog?.sleepHours || todayLog?.restingHeartRate);
    const debrief = debriefRows[0] ?? null;
    const insight = insightRows[0] ?? null;
    const hasIntelligence = !!(debrief || insight);

    // ── From Valo ─────────────────────────────────────────────────────────────

    let fromValo: FromValo | null = null;

    if (debrief?.oneStruggle) {
      fromValo = {
        kind: "unresolved_thread",
        text: debrief.oneStruggle,
        cta_label: "Talk about it",
        cta_action: "open_checkin",
      };
    } else if (insight?.content) {
      fromValo = {
        kind: "pattern_observation",
        text: insight.content,
        cta_label: "Explore this",
        cta_action: "open_checkin",
      };
    } else if (debrief?.tomorrowIntention) {
      fromValo = {
        kind: "commitment",
        text: `You set an intention: "${debrief.tomorrowIntention}" — how are you tracking?`,
        cta_label: "Reflect on it",
        cta_action: "open_checkin",
      };
    } else if (debrief?.primaryEmotion) {
      const tone = [debrief.primaryEmotion, debrief.energyLevel].filter(Boolean).join(", ");
      fromValo = {
        kind: "emotional_baseline",
        text: `Your last check-in had a ${tone} tone. Worth checking in again today?`,
        cta_label: "Check in",
        cta_action: "open_checkin",
      };
    }

    // ── Card candidates ───────────────────────────────────────────────────────

    const candidates: ScoredCard[] = [];

    // 1. Event card (or connect-calendar empty state)
    if (!calendarConnected) {
      candidates.push({
        type: "connect_calendar",
        title: "Connect your calendar",
        subtitle: "See your schedule at a glance",
        accent: "sage",
        action: "connect_calendar",
        score: 5,
      });
    } else {
      const todayEvs = calendarEvents
        .filter((ev) => ev.date === today && ev.startTime != null)
        .map((ev) => ({ ...ev, startMins: eventStartMinutes(ev.startTime) }))
        .filter((ev) => ev.startMins != null)
        .sort((a, b) => (a.startMins ?? 0) - (b.startMins ?? 0));

      let nextEvent: typeof todayEvs[number] | null = null;
      let minutesAway: number | null = null;
      for (const ev of todayEvs) {
        const diff = (ev.startMins ?? 0) - nowMins;
        if (diff > -15) {
          nextEvent = ev;
          minutesAway = Math.max(0, diff);
          break;
        }
      }

      if (nextEvent) {
        let score = 0;
        if (minutesAway != null) {
          if (minutesAway < 60) score += 40;
          else if (minutesAway < 180) score += 26;
          else score += 12;
        } else {
          score += 10;
        }
        if (tod === "afternoon") score += 12;
        if (tod === "morning") score += 8;

        const timeLabel = formatEventTime(nextEvent.startTime);
        const countdownText =
          minutesAway != null
            ? minutesAway === 0
              ? "starting now"
              : minutesAway < 60
              ? `in ${minutesAway} min`
              : minutesAway < 120
              ? "in about an hour"
              : null
            : null;

        candidates.push({
          type: "event",
          title: nextEvent.title,
          subtitle: timeLabel
            ? `At ${timeLabel}${countdownText ? ` · ${countdownText}` : ""}`
            : "Up next on your calendar",
          accent: "sage",
          action: "open_plan",
          score,
        });
      }
    }

    // 2. Readiness card (only when wearable data exists)
    if (wearableConnected) {
      const label = computeReadinessLabel(
        todayLog?.hrv ?? null,
        todayLog?.sleepHours ?? null,
        todayLog?.restingHeartRate ?? null,
      );
      let score = 0;
      if (tod === "morning") score += 22;
      if (label === "Low") score += 28;
      else if (label === "Fair") score += 10;
      if (todayLog?.hrv != null && todayLog.hrv < 30) score += 18;
      if (todayLog?.sleepHours != null && todayLog.sleepHours < 6) score += 22;

      const subtitle =
        label === "Good"
          ? "Recovery is solid — you're set for the day."
          : label === "Fair"
          ? todayLog?.sleepHours != null && todayLog.sleepHours < 6
            ? `Sleep was short (${todayLog.sleepHours}h) — take it steady.`
            : todayLog?.hrv != null
            ? `HRV at ${todayLog.hrv} ms — pace yourself today.`
            : "Recovery is moderate — pace yourself."
          : todayLog?.sleepHours != null && todayLog.sleepHours < 5
          ? `Only ${todayLog.sleepHours}h sleep — protect your energy.`
          : todayLog?.hrv != null
          ? `HRV dipped to ${todayLog.hrv} ms — keep it manageable.`
          : "Recovery is low — keep things manageable.";

      const accent: CardAccent =
        label === "Good" ? "good" : label === "Fair" ? "fair" : "low";

      candidates.push({
        type: "readiness",
        title: `Readiness · ${label}`,
        subtitle,
        accent,
        action: "open_health",
        score,
      });
    }

    // 3. Habits card (or add-habits empty state)
    const pendingHabits = habits.filter((h) => !h.completedToday);
    const streakAtRisk = pendingHabits.filter((h) => h.streak > 0);

    if (habits.length === 0) {
      candidates.push({
        type: "add_habits",
        title: "Add your first habit",
        subtitle: "Build consistency with daily habits",
        accent: "amber",
        action: "open_plan",
        score: 4,
      });
    } else if (pendingHabits.length > 0) {
      let score = 0;
      if (tod === "morning") score += 18;
      if (tod === "afternoon") score += 22;
      if (tod === "evening") score += 10;
      if (streakAtRisk.length > 0) score += 24;
      if (pendingHabits.length === 1) score += 5;

      const subtitle =
        streakAtRisk.length > 0
          ? `${streakAtRisk[0]!.name}${streakAtRisk.length > 1 ? ` +${streakAtRisk.length - 1} more` : ""} — streak at risk`
          : `${pendingHabits.length} of ${habits.length} remaining today`;

      candidates.push({
        type: "habits",
        title: "Habits",
        subtitle,
        accent: streakAtRisk.length > 0 ? "terracotta" : "amber",
        action: "open_plan",
        score,
      });
    }

    // 4. Countdown card (personal dates or goal deadlines within 14 days)
    let soonest: { name: string; daysAway: number; label: string | null } | null = null;

    for (const pd of personalDates) {
      const days = daysUntilDate(pd.month, pd.day);
      if (days <= 14 && (soonest == null || days < soonest.daysAway)) {
        soonest = { name: pd.name, daysAway: days, label: pd.label ?? null };
      }
    }

    for (const g of goals) {
      if (!g.targetDate) continue;
      const d = new Date(g.targetDate);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      d.setHours(0, 0, 0, 0);
      const days = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (days >= 0 && days <= 14 && (soonest == null || days < soonest.daysAway)) {
        soonest = { name: g.title, daysAway: days, label: "deadline" };
      }
    }

    if (soonest) {
      const daysText =
        soonest.daysAway === 0
          ? "Today"
          : soonest.daysAway === 1
          ? "Tomorrow"
          : `${soonest.daysAway} days away`;
      const subtitle = soonest.label
        ? `${soonest.label} · ${daysText}`
        : daysText;
      candidates.push({
        type: "countdown",
        title: soonest.name,
        subtitle,
        accent: "rose",
        action: "open_plan",
        score: 30 - soonest.daysAway,
      });
    }

    // ── Sort and cap at 4 ─────────────────────────────────────────────────────

    candidates.sort((a, b) => b.score - a.score);
    const cards: BriefingCard[] = candidates
      .slice(0, 4)
      .map(({ score: _score, ...rest }) => rest);

    res.json({
      time_of_day: tod,
      greeting_name: firstName,
      from_valo: fromValo,
      cards,
      states: {
        calendar_connected: calendarConnected,
        wearable_connected: wearableConnected,
        has_intelligence: hasIntelligence,
      },
    });
  } catch (err: any) {
    req.log.error({ err }, "GET /home-briefing failed");
    res.status(500).json({ error: "Failed to assemble home briefing" });
  }
});

export default router;
