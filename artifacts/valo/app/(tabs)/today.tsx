import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useValoAuth } from "@/contexts/AuthContext";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/useColors";
import { useHealthKitSync } from "@/hooks/useHealthKitSync";
import {
  useGetDashboard,
  useListCalendarEvents,
  useListHabits,
  useListGoals,
  useListMoods,
  useListInsights,
} from "@workspace/api-client-react";
import { useTodayCards, type TodayCardResult, type PrimaryAction } from "@/hooks/useTodayCards";
import { trackEvent, initTelemetrySession } from "@/services/telemetry";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INTENTION_KEY = "@valo/tomorrow-intention";

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getTodayISO(): string { return toISODate(new Date()); }

function getTomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toISODate(d);
}

function formatTomorrowLabel(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function formatTime(hhmm: string): string {
  const parts = hhmm.split(":");
  const h = parseInt(parts[0] ?? "20", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// ─── Data-derived logic ───────────────────────────────────────────────────────

type DashData = { sleepHours?: number | null; hrv?: number | null; restingHeartRate?: number | null; steps?: number | null; healthScore: number };
type GoalItem = { id: number; title: string; targetDate?: string | null; progressPercent: number };
type HabitItem = { id: number; name: string; streak: number; completedToday: boolean };

type DynCardData = {
  key: string;
  icon: string;
  label: string;
  body: string;
  progress?: number;
  accent?: boolean;
  primaryAction?: PrimaryAction;
};

function getReadinessConfig(sleep?: number | null, hrv?: number | null) {
  if (sleep == null && hrv == null) {
    return { text: "Connect your wearable to see your readiness.", icon: "zap", good: false };
  }
  const goodSleep = sleep != null && sleep > 7;
  const badSleep = sleep != null && sleep < 6;
  const goodHrv = hrv != null && hrv > 55;
  const badHrv = hrv != null && hrv < 40;
  if (goodSleep || goodHrv) {
    return { text: "Your body is well-recovered today. Make the most of it.", icon: "sun", good: true };
  }
  if (badSleep || badHrv) {
    return { text: "Your recovery is low today. Protect your energy.", icon: "moon", good: false };
  }
  return { text: "Your body is well-recovered today. Make the most of it.", icon: "sun", good: true };
}

function formatSleepSummary(sleep?: number | null, hrv?: number | null): string | null {
  if (sleep == null) return null;
  const h = Math.floor(sleep);
  const m = Math.round((sleep - h) * 60);
  const sleepStr = m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (hrv == null) return `You slept ${sleepStr} last night.`;
  const comp = hrv > 55 ? `${hrv - 50} above average` : hrv < 40 ? `${50 - hrv} below your average` : "around average";
  return `You slept ${sleepStr} last night. HRV ${hrv} — ${comp}.`;
}

function getValoSuggestion(
  tomorrowEvents: { id: number; title: string; type?: string | null }[],
  urgentGoals: GoalItem[],
  habits: HabitItem[] | undefined,
): string {
  if (tomorrowEvents.length >= 4) {
    return "Heavy day tomorrow — protect your morning focus time";
  }
  const hasWorkBlock = tomorrowEvents.some(
    (e) => e.type?.toLowerCase().includes("work") || e.title.toLowerCase().includes("work"),
  );
  if (hasWorkBlock) {
    const n = tomorrowEvents.length;
    return `Work day tomorrow — ${n} ${n === 1 ? "event" : "events"} scheduled`;
  }
  const closestGoal = urgentGoals
    .filter((g) => g.targetDate != null && daysUntil(g.targetDate) >= 0 && daysUntil(g.targetDate) <= 3)
    .sort((a, b) => daysUntil(a.targetDate!) - daysUntil(b.targetDate!))[0];
  if (closestGoal) {
    const days = daysUntil(closestGoal.targetDate!);
    const dayLabel = days === 0 ? "today" : days === 1 ? "1 day left" : `${days} days left`;
    return `${closestGoal.title} deadline is approaching — ${dayLabel}`;
  }
  const missedHabit = habits?.find((h) => !h.completedToday && h.streak === 0);
  if (missedHabit) {
    return `Get back on track with ${missedHabit.name} tomorrow`;
  }
  return "What would make tomorrow a win?";
}

function getFocusSentence(
  goals: GoalItem[] | undefined,
  habits: HabitItem[] | undefined,
  intention: string
): string {
  const urgentGoal = goals?.find(
    (g) => g.targetDate && daysUntil(g.targetDate) >= 0 && daysUntil(g.targetDate) <= 7
  );
  if (urgentGoal) {
    const days = daysUntil(urgentGoal.targetDate!);
    return `Your focus today: push toward ${urgentGoal.title} — ${days} day${days !== 1 ? "s" : ""} left.`;
  }
  const incomplete = habits?.find((h) => !h.completedToday);
  if (incomplete) return `Your focus today: complete ${incomplete.name}.`;
  if (intention.trim()) return `Your focus today: ${intention.trim()}`;
  return "Your focus today: show up fully.";
}

// ─── Time-of-day ─────────────────────────────────────────────────────────────

type TimeOfDay = "morning" | "afternoon" | "evening";

function getTimeOfDay(hour: number, override: "morning" | "evening" | null): TimeOfDay {
  if (override === "morning") return "morning";
  if (override === "evening") return "evening";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

// ─── Dynamic card types & builders ───────────────────────────────────────────

type InsightItem = { id: number; content: string };


function buildRecoveryCard(dash: DashData | undefined): DynCardData {
  if (!dash || (dash.hrv == null && dash.sleepHours == null)) {
    return {
      key: "recovery",
      icon: "link",
      label: "Recovery",
      body: "Connect your wearable to see your recovery score.",
    };
  }
  const { hrv, sleepHours: sleep } = dash;
  let body: string;
  let good = true;
  if (hrv != null && hrv > 55) {
    body = "Strong recovery today — your body is ready.";
  } else if (hrv != null && hrv < 40) {
    body = "Low recovery today — protect your energy.";
    good = false;
  } else if (sleep != null && sleep < 6) {
    body = "You slept under 6 hours — take it easy today.";
    good = false;
  } else {
    body = "Strong recovery today — your body is ready.";
  }
  return {
    key: "recovery",
    icon: good ? "battery-charging" : "battery",
    label: good ? "Strong recovery" : "Low recovery",
    body,
    accent: good,
  };
}

function buildGoalProgressCard(goals: GoalItem[] | undefined): DynCardData {
  if (!goals || goals.length === 0) {
    return {
      key: "goal",
      icon: "target",
      label: "Goal progress",
      body: "Add your first goal to track progress here.",
    };
  }
  const deadlineGoal = goals
    .filter((g) => g.targetDate != null && daysUntil(g.targetDate) >= 0 && daysUntil(g.targetDate) <= 14)
    .sort((a, b) => daysUntil(a.targetDate!) - daysUntil(b.targetDate!))[0];
  const lowestGoal = goals
    .filter((g) => g.progressPercent > 0 && g.progressPercent < 100)
    .sort((a, b) => a.progressPercent - b.progressPercent)[0];
  const goal = deadlineGoal ?? lowestGoal ?? goals[0]!;
  const days = goal.targetDate != null ? daysUntil(goal.targetDate) : null;
  const daysStr = days != null ? ` · ${days} day${days !== 1 ? "s" : ""} left` : "";
  return {
    key: "goal",
    icon: "target",
    label: "Goal progress",
    body: `${goal.title}${daysStr}`,
    progress: goal.progressPercent,
  };
}

function buildStreakCard(habits: HabitItem[] | undefined): DynCardData {
  if (!habits || habits.length === 0) {
    return {
      key: "streak",
      icon: "check-circle",
      label: "Streak",
      body: "Start a streak today — pick a habit and commit.",
    };
  }
  const best = habits.filter((h) => h.streak >= 3).sort((a, b) => b.streak - a.streak)[0];
  if (!best) {
    const top = habits.slice().sort((a, b) => b.streak - a.streak)[0]!;
    return {
      key: "streak",
      icon: "check-circle",
      label: "Streak",
      body: `${top.name} — Start a streak today and commit.`,
    };
  }
  return {
    key: "streak",
    icon: "check-circle",
    label: "Streak",
    body: `${best.name} — ${best.streak} days straight. Keep it going.`,
  };
}

function buildWinCard(habits: HabitItem[] | undefined): DynCardData {
  if (!habits || habits.length === 0) {
    return {
      key: "win",
      icon: "zap",
      label: "Win",
      body: "Complete your habits today to earn a win card.",
    };
  }
  const longStreak = habits.filter((h) => h.streak >= 7).sort((a, b) => b.streak - a.streak)[0];
  if (longStreak) {
    return {
      key: "win",
      icon: "zap",
      label: "On a roll",
      body: `You're on a ${longStreak.streak}-day streak with ${longStreak.name}. Strong work.`,
      accent: true,
    };
  }
  if (habits.every((h) => h.completedToday)) {
    return {
      key: "win",
      icon: "zap",
      label: "All done",
      body: "You've completed all your habits today. Strong work.",
      accent: true,
    };
  }
  return {
    key: "win",
    icon: "zap",
    label: "Win",
    body: "Complete your habits today to earn a win card.",
  };
}

function buildPatternCard(insights: InsightItem[] | undefined): DynCardData {
  const latest = insights?.[0];
  if (!latest?.content) {
    return {
      key: "pattern",
      icon: "activity",
      label: "Pattern",
      body: "Check in daily — Valo will surface patterns here after a few days.",
    };
  }
  return {
    key: "pattern",
    icon: "activity",
    label: "Pattern",
    body: latest.content,
  };
}

function getDynamicCards(
  dash: DashData | undefined,
  goals: GoalItem[] | undefined,
  habits: HabitItem[] | undefined,
  insights: InsightItem[] | undefined,
  timeOfDay: TimeOfDay
): DynCardData[] {
  const builders: Record<string, () => DynCardData> = {
    recovery: () => buildRecoveryCard(dash),
    goal:     () => buildGoalProgressCard(goals),
    streak:   () => buildStreakCard(habits),
    win:      () => buildWinCard(habits),
    pattern:  () => buildPatternCard(insights),
  };
  const priorities: Record<TimeOfDay, string[]> = {
    morning:   ["recovery", "goal", "streak"],
    afternoon: ["pattern", "goal", "win"],
    evening:   ["win", "streak", "pattern"],
  };

  const list = priorities[timeOfDay];
  const result: DynCardData[] = list.map((key) => builders[key]!());

  // Fill any remaining slots (shouldn't occur with 3-item priority lists, but kept as safety net)
  if (result.length < 3) {
    const fallback = ["recovery", "goal", "streak", "win", "pattern"];
    for (const key of fallback) {
      if (result.length >= 3) break;
      if (result.some((c) => c.key === key)) continue;
      result.push(builders[key]!());
    }
  }

  return result;
}

// ─── Server card → DynCard mapper ────────────────────────────────────────────

function formatSleepShort(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function serverCardToDynCard(card: TodayCardResult): DynCardData {
  const d = card.data;
  switch (card.type) {
    case "recovery": {
      const parts: string[] = [];
      if (d.hrv != null) parts.push(`HRV ${d.hrv}`);
      if (d.sleep != null) parts.push(`${formatSleepShort(d.sleep as number)} sleep`);
      if (d.rhr != null) parts.push(`RHR ${d.rhr}`);
      const isLow = d.readiness === "Low";
      const isStrong = d.readiness === "Strong";
      const suffix = isLow ? " — protect your energy." : isStrong ? " — body is ready." : " — looking good.";
      const body = parts.length > 0 ? parts.join(" · ") + suffix : "Connect your wearable to see your recovery.";
      return {
        key: "recovery",
        icon: isLow ? "battery" : "battery-charging",
        label: isLow ? "Low recovery" : isStrong ? "Strong recovery" : "Recovery",
        body,
        accent: isStrong,
      };
    }
    case "goal_deadline": {
      const daysLeft = d.daysLeft as number | null;
      const daysStr = daysLeft != null ? ` · ${daysLeft === 0 ? "due today" : `${daysLeft}d left`}` : "";
      return {
        key: "goal",
        icon: "target",
        label: "Goal deadline",
        body: `${String(d.goalName ?? "Goal")}${daysStr}`,
        progress: d.percent as number | undefined,
        accent: true,
      };
    }
    case "goal_progress": {
      return {
        key: "goal",
        icon: "target",
        label: "Goal progress",
        body: String(d.goalName ?? "Working toward your goals."),
        progress: d.percent as number | undefined,
      };
    }
    case "streak": {
      return {
        key: "streak",
        icon: "check-circle",
        label: "Streak",
        body: `${String(d.habitName ?? "Habit")} — ${String(d.streakDays ?? 1)} days straight. Keep it going.`,
      };
    }
    case "win": {
      return {
        key: "win",
        icon: "zap",
        label: "Yesterday's win",
        body: String(d.text ?? "You showed up."),
        accent: true,
      };
    }
    case "motivation": {
      return {
        key: "motivation",
        icon: "heart",
        label: "What drives you",
        body: String(d.text ?? "Keep going."),
      };
    }
    case "pattern": {
      return {
        key: "pattern",
        icon: "activity",
        label: "Pattern",
        body: String(d.text ?? "Check in daily to see patterns here."),
      };
    }
    default:
      return { key: card.type, icon: "zap", label: "Today", body: "Keep showing up.", primaryAction: card.primaryAction };
  }
}

function serverCardToDynCardWithAction(card: TodayCardResult): DynCardData {
  return { ...serverCardToDynCard(card), primaryAction: card.primaryAction };
}

function getDebriefPrompt(callTime: string | null, todayEventCount: number): string {
  if (todayEventCount > 3) return "Today looked heavy. Let's start there.";
  if (callTime) return `Your check-in is at ${formatTime(callTime)}. Ready when you are.`;
  return "How did today go? Let's talk through it.";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type Colors = ReturnType<typeof useColors>;

function ModeToggle({
  mode,
  onToggle,
  colors,
}: {
  mode: "morning" | "evening";
  onToggle: () => void;
  colors: Colors;
}) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={[styles.modeToggle, { backgroundColor: colors.muted, borderColor: colors.border }]}
      activeOpacity={0.8}
      accessibilityRole="switch"
      accessibilityLabel={`Switch to ${mode === "morning" ? "evening" : "morning"} mode`}
      accessibilityValue={{ text: mode }}
    >
      <View style={[styles.modePill, mode === "morning" && { backgroundColor: colors.card }]}>
        <Feather name="sun" size={11} color={mode === "morning" ? colors.primary : colors.mutedForeground} />
        <Text
          style={[
            styles.modePillText,
            { color: mode === "morning" ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_500Medium" },
          ]}
        >
          Morning
        </Text>
      </View>
      <View style={[styles.modePill, mode === "evening" && { backgroundColor: colors.card }]}>
        <Feather name="moon" size={11} color={mode === "evening" ? colors.primary : colors.mutedForeground} />
        <Text
          style={[
            styles.modePillText,
            { color: mode === "evening" ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_500Medium" },
          ]}
        >
          Evening
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function ReadinessCard({
  readiness,
  hrv,
  sleep,
  rhr,
  colors,
}: {
  readiness: ReturnType<typeof getReadinessConfig>;
  hrv?: number | null;
  sleep?: number | null;
  rhr?: number | null;
  colors: Colors;
}) {
  const hasMetrics = hrv != null || sleep != null || rhr != null;
  return (
    <View
      style={[
        styles.readinessCard,
        {
          backgroundColor: readiness.good ? colors.muted : colors.card,
          borderColor: readiness.good ? colors.primary : colors.border,
          borderWidth: readiness.good ? 1.5 : 1,
        },
      ]}
    >
      <Feather
        name={readiness.icon as any}
        size={22}
        color={readiness.good ? colors.primary : colors.mutedForeground}
        style={{ marginBottom: 10 }}
      />
      <Text
        style={[
          styles.readinessText,
          { color: colors.foreground, fontFamily: "Inter_500Medium" },
        ]}
      >
        {readiness.text}
      </Text>
      {hasMetrics && (
        <View style={styles.metricRow}>
          {hrv != null && (
            <View style={[styles.metricPill, { backgroundColor: colors.background }]}>
              <Text style={[styles.metricValue, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                {hrv}
              </Text>
              <Text style={[styles.metricUnit, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                HRV
              </Text>
            </View>
          )}
          {sleep != null && (
            <View style={[styles.metricPill, { backgroundColor: colors.background }]}>
              <Text style={[styles.metricValue, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                {formatSleepShort(sleep)}
              </Text>
              <Text style={[styles.metricUnit, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Sleep
              </Text>
            </View>
          )}
          {rhr != null && (
            <View style={[styles.metricPill, { backgroundColor: colors.background }]}>
              <Text style={[styles.metricValue, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                {rhr}
              </Text>
              <Text style={[styles.metricUnit, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                RHR
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function CalendarStrip({
  events,
  colors,
  isBusy,
}: {
  events: { id: number; title: string; type?: string | null }[];
  colors: Colors;
  isBusy: boolean;
}) {
  return (
    <View style={styles.calendarBlock}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
        Today
      </Text>
      {isBusy && (
        <View style={[styles.busyFlag, { backgroundColor: colors.muted }]}>
          <Feather name="alert-circle" size={12} color={colors.primary} />
          <Text style={[styles.busyFlagText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
            Heads up — busy block ahead.
          </Text>
        </View>
      )}
      {events.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Nothing scheduled yet
        </Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stripScroll}>
          {events.map((ev) => (
            <View key={ev.id} style={[styles.eventPill, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.eventDot, { backgroundColor: colors.primary }]} />
              <Text
                style={[styles.eventPillText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                numberOfLines={1}
              >
                {ev.title}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function FocusCard({ sentence, colors }: { sentence: string; colors: Colors }) {
  return (
    <View style={[styles.focusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.focusLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
        YOUR FOCUS TODAY
      </Text>
      <Text style={[styles.focusText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
        {sentence}
      </Text>
    </View>
  );
}

function DynCard({ card, colors, onAction }: { card: DynCardData; colors: Colors; onAction?: () => void }) {
  return (
    <View
      style={[
        styles.dynCard,
        {
          backgroundColor: colors.card,
          borderColor: card.accent ? colors.primary : colors.border,
          borderWidth: card.accent ? 1.5 : 1,
        },
      ]}
    >
      <View style={styles.dynCardHeader}>
        <Feather
          name={card.icon as any}
          size={14}
          color={card.accent ? colors.primary : colors.mutedForeground}
        />
        <Text
          style={[
            styles.dynCardLabel,
            { color: card.accent ? colors.primary : colors.mutedForeground, fontFamily: "Inter_500Medium" },
          ]}
        >
          {card.label}
        </Text>
      </View>
      <Text style={[styles.dynCardBody, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
        {card.body}
      </Text>
      {card.progress != null && (
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.max(2, Math.min(100, card.progress))}%` as any, backgroundColor: colors.primary },
            ]}
          />
        </View>
      )}
      {onAction != null && card.primaryAction != null && (
        <TouchableOpacity
          style={[styles.cardCta, { backgroundColor: colors.primary }]}
          onPress={onAction}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={card.primaryAction.label}
        >
          <Text style={[styles.cardCtaText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
            {card.primaryAction.label}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function BonusCard({ card, colors }: { card: TodayCardResult; colors: Colors }) {
  const message = String(card.data.message ?? "");
  return (
    <View style={[styles.bonusCard, { backgroundColor: colors.muted, borderColor: colors.primary }]}>
      <View style={styles.dynCardHeader}>
        <Feather name="award" size={14} color={colors.primary} />
        <Text style={[styles.dynCardLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
          Worth noting
        </Text>
      </View>
      <Text style={[styles.dynCardBody, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
        {message}
      </Text>
    </View>
  );
}

function DebriefCard({
  prompt,
  colors,
  onPress,
}: {
  prompt: string;
  colors: Colors;
  onPress: () => void;
}) {
  return (
    <View style={[styles.debriefCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name="moon" size={28} color={colors.primary} style={{ marginBottom: 14 }} />
      <Text style={[styles.debriefPrompt, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
        {prompt}
      </Text>
      <TouchableOpacity
        style={[styles.checkInBtn, { backgroundColor: colors.primary }]}
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Check in with Valo"
      >
        <Feather name="mic" size={20} color={colors.primaryForeground} />
        <Text style={[styles.checkInBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
          Check in with Valo
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function DayAtAGlance({
  dashboard,
  habits,
  moodCount,
  colors,
}: {
  dashboard: DashData | undefined;
  habits: HabitItem[] | undefined;
  moodCount: number;
  colors: Colors;
}) {
  const completedHabits = habits?.filter((h) => h.completedToday).length ?? 0;
  const totalHabits = habits?.length ?? 0;
  const steps = dashboard?.steps;
  const stepsStr = steps != null ? steps.toLocaleString() : null;

  const rows: { icon: string; label: string; value: string }[] = [
    { icon: "activity", label: "Workout", value: "Not logged" },
    { icon: "wind", label: "Steps", value: stepsStr ?? "—" },
    { icon: "check-circle", label: "Habits", value: totalHabits > 0 ? `${completedHabits}/${totalHabits} completed` : "—" },
    { icon: "smile", label: "Mood check-ins", value: moodCount > 0 ? `${moodCount} logged` : "None" },
  ];

  return (
    <View style={styles.sectionBlock}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
        Day at a glance
      </Text>
      <View style={[styles.glanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {rows.map((row, idx) => (
          <View
            key={row.label}
            style={[
              styles.glanceRow,
              idx < rows.length - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <View style={styles.glanceLeft}>
              <Feather name={row.icon as any} size={15} color={colors.mutedForeground} />
              <Text style={[styles.glanceLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {row.label}
              </Text>
            </View>
            <Text style={[styles.glanceValue, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
              {row.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function MoodArc({
  moods,
  colors,
  onAdd,
}: {
  moods: { id: number; score: number; note?: string | null }[];
  colors: Colors;
  onAdd: () => void;
}) {
  const DOT_SIZE = 36;

  function dotColor(score: number): string {
    if (score >= 8) return "#7DCB8F";
    if (score >= 5) return colors.primary;
    return "#D4473E";
  }

  if (moods.length === 0) {
    return (
      <TouchableOpacity
        style={[styles.moodPromptCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={onAdd}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Log your mood"
      >
        <Feather name="smile" size={18} color={colors.mutedForeground} />
        <Text style={[styles.moodPromptText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          How are you feeling tonight?
        </Text>
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      </TouchableOpacity>
    );
  }

  const labels = ["Morning", "Afternoon", "Evening"];

  return (
    <View style={styles.sectionBlock}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
        Mood arc
      </Text>
      <View style={[styles.moodArcCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.moodDotsRow}>
          {moods.slice(0, 3).map((m, idx) => (
            <View key={m.id} style={styles.moodDotColumn}>
              <View style={[styles.moodDot, { backgroundColor: dotColor(m.score), width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2 }]}>
                <Text style={[styles.moodDotScore, { color: "#FFFFFF", fontFamily: "Inter_700Bold" }]}>
                  {m.score}
                </Text>
              </View>
              <Text style={[styles.moodDotLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {labels[idx] ?? `#${idx + 1}`}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function TomorrowPrep({
  tomorrowEvents,
  urgentGoals,
  habits,
  intention,
  intentionSaved,
  prominent,
  colors,
  onIntentionChange,
  onIntentionBlur,
  onPlanTomorrow,
}: {
  tomorrowEvents: { id: number; title: string; type?: string | null }[];
  urgentGoals: GoalItem[];
  habits: HabitItem[] | undefined;
  intention: string;
  intentionSaved: boolean;
  prominent: boolean;
  colors: Colors;
  onIntentionChange: (t: string) => void;
  onIntentionBlur: () => void;
  onPlanTomorrow: () => void;
}) {
  return (
    <View style={styles.sectionBlock}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
        Tomorrow
      </Text>
      <View
        style={[
          styles.tomorrowCard,
          {
            backgroundColor: colors.card,
            borderColor: prominent ? colors.accent : colors.border,
            borderWidth: prominent ? 1.5 : 1,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.tomorrowHeader}>
          <View style={styles.tomorrowHeaderLeft}>
            <Feather name="moon" size={14} color={colors.primary} />
            <Text style={[styles.tomorrowTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              Tomorrow
            </Text>
          </View>
          <Text style={[styles.tomorrowDate, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {formatTomorrowLabel()}
          </Text>
        </View>

        <View style={[styles.tomorrowDivider, { backgroundColor: colors.border }]} />

        {/* Events */}
        <View style={styles.tomorrowSection}>
          <View style={styles.tomorrowSubHeader}>
            <Feather name="calendar" size={12} color={colors.mutedForeground} />
            <Text style={[styles.tomorrowSubLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              Scheduled
            </Text>
          </View>
          {tomorrowEvents.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Nothing scheduled yet
            </Text>
          ) : (
            tomorrowEvents.map((ev) => (
              <View key={ev.id} style={styles.tomorrowEventRow}>
                <View style={[styles.eventDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.tomorrowEventText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                  {ev.title}
                </Text>
              </View>
            ))
          )}
        </View>

        {urgentGoals.length > 0 && (
          <>
            <View style={[styles.tomorrowDivider, { backgroundColor: colors.border }]} />
            <View style={styles.tomorrowSection}>
              <View style={styles.tomorrowSubHeader}>
                <Feather name="target" size={12} color={colors.mutedForeground} />
                <Text style={[styles.tomorrowSubLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                  Goals due soon
                </Text>
              </View>
              {urgentGoals.map((g) => {
                const days = g.targetDate ? daysUntil(g.targetDate) : null;
                return (
                  <View key={g.id} style={styles.tomorrowEventRow}>
                    <View style={[styles.eventDot, { backgroundColor: "#5B8CDE" }]} />
                    <Text
                      style={[styles.tomorrowEventText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                      numberOfLines={1}
                    >
                      {g.title}
                    </Text>
                    {days !== null && (
                      <Text style={[styles.daysTag, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                        {days === 0 ? "today" : `${days}d`}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}

        <View style={[styles.tomorrowDivider, { backgroundColor: colors.border }]} />

        {/* Intention */}
        <View style={styles.tomorrowSection}>
          <Text style={[styles.valoSuggestLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            VALO SUGGESTS
          </Text>
          <View style={[styles.valoSuggestCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Feather name="zap" size={12} color={colors.primary} style={{ marginTop: 1 }} />
            <Text style={[styles.valoSuggestText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {getValoSuggestion(tomorrowEvents, urgentGoals, habits)}
            </Text>
          </View>
          <View style={[styles.tomorrowSubHeader, { marginTop: 4 }]}>
            <Feather name="edit-3" size={12} color={colors.mutedForeground} />
            <Text style={[styles.tomorrowSubLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              Add your own note
            </Text>
            {intentionSaved && (
              <Text style={[styles.savedTag, { color: colors.primary, fontFamily: "Inter_400Regular" }]}>
                Saved
              </Text>
            )}
          </View>
          <TextInput
            value={intention}
            onChangeText={onIntentionChange}
            onBlur={onIntentionBlur}
            placeholder="Optional"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="done"
            style={[
              styles.intentionInput,
              {
                color: colors.foreground,
                borderColor: colors.border,
                backgroundColor: colors.background,
                fontFamily: "Inter_400Regular",
              },
            ]}
          />
        </View>

        <View style={[styles.tomorrowDivider, { backgroundColor: colors.border }]} />

        <TouchableOpacity
          style={[styles.planBtn, { borderColor: colors.primary }]}
          onPress={onPlanTomorrow}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Plan tomorrow with Valo"
        >
          <Feather name="mic" size={15} color={colors.primary} />
          <Text style={[styles.planBtnText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
            Plan tomorrow with Valo
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function TodayScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { name, getToken, userId } = useValoAuth();
  const router = useRouter();

  const { data: dashboard, isLoading, refetch, isRefetching } = useGetDashboard();
  const { data: habits } = useListHabits();
  const { data: goals } = useListGoals();
  const { data: calendarEvents } = useListCalendarEvents();
  const { data: moods } = useListMoods();
  const { data: insights } = useListInsights();
  const { isSyncing: isHealthSyncing, syncNow } = useHealthKitSync();
  const { serverCards, bonusCard: serverBonusCard, hasError, refetchCards } = useTodayCards();

  useFocusEffect(
    useCallback(() => {
      const mode = new Date().getHours() < 18 ? "morning" : "evening";
      const sid = initTelemetrySession(userId ?? null, getToken);
      sessionIdRef.current = sid;
      startTimestampRef.current = Date.now();
      hasTrackedFirstActionRef.current = false;
      trackEvent("today.screen_view", { mode, sessionId: sid });
    }, [userId, getToken]),
  );

  const trackFirstAction = useCallback(() => {
    if (hasTrackedFirstActionRef.current) return;
    hasTrackedFirstActionRef.current = true;
    const ms = Date.now() - startTimestampRef.current;
    trackEvent("today.time_to_first_action", { ms, sessionId: sessionIdRef.current });
  }, []);

  const handleCardAction = useCallback(
    (action: PrimaryAction) => {
      trackFirstAction();
      trackEvent("today.card_action_click", {
        sessionId: sessionIdRef.current,
        cardType: action.actionType,
        actionLabel: action.label,
        actionType: action.actionType,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      switch (action.actionType) {
        case "start_checkin":
        case "open_voice":
          trackEvent("checkin.start_from_today", {
            sessionId: sessionIdRef.current,
            triggerCardType: action.actionType,
          });
          router.push("/(tabs)/checkin");
          break;
        case "open_goals":
        case "open_habits":
        case "open_insights":
          router.push("/(tabs)/goals_insights");
          break;
        case "open_log":
        default:
          break;
      }
    },
    [router, trackFirstAction],
  );

  const [modeOverride, setModeOverride] = useState<"morning" | "evening" | null>(null);
  const [intention, setIntention] = useState("");
  const [intentionSaved, setIntentionSaved] = useState(false);
  const [callTime, setCallTime] = useState<string | null>(null);
  const wasSyncing = useRef(false);
  const sessionIdRef = useRef<string>("");
  const startTimestampRef = useRef<number>(0);
  const hasTrackedFirstActionRef = useRef<boolean>(false);

  const hour = new Date().getHours();
  const isMorning = modeOverride != null ? modeOverride === "morning" : hour < 18;
  const currentMode: "morning" | "evening" = isMorning ? "morning" : "evening";

  const todayISO = getTodayISO();
  const tomorrowISO = getTomorrowISO();

  const todayEvents = calendarEvents?.filter((e) => e.date === todayISO) ?? [];
  const tomorrowEvents = calendarEvents?.filter((e) => e.date === tomorrowISO) ?? [];

  const maxDateISO = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return toISODate(d);
  })();
  const upcomingGoogleEvents = (calendarEvents ?? [])
    .filter((e) => e.type === "google" && e.date > todayISO && e.date <= maxDateISO)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  const todayMoods = moods?.filter((m) => m.date === todayISO) ?? [];
  const urgentGoals =
    goals?.filter(
      (g) => g.targetDate && daysUntil(g.targetDate) >= 0 && daysUntil(g.targetDate) <= 7
    ) ?? [];

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const tabBarH = Platform.OS === "web" ? 84 : 83;

  useEffect(() => {
    AsyncStorage.getItem(`@valo/tomorrow-note-${tomorrowISO}`)
      .then((v) => { if (v) setIntention(v); })
      .catch(() => {});
    void loadCallTime();
  }, []);

  // Re-sync health data every time the Today tab comes into focus.
  useFocusEffect(
    useCallback(() => {
      void syncNow();
    }, [syncNow])
  );

  // When a sync completes (isSyncing flips true → false), invalidate the
  // dashboard cache so the Today screen shows the freshly-written data.
  useEffect(() => {
    if (wasSyncing.current && !isHealthSyncing) {
      void refetch();
    }
    wasSyncing.current = isHealthSyncing;
  }, [isHealthSyncing, refetch]);

  async function loadCallTime() {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`${getApiBase()}/api/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const s = await res.json();
        if (s.preferredCallTime) setCallTime(s.preferredCallTime);
      }
    } catch {}
  }

  async function handleIntentionBlur() {
    try {
      await AsyncStorage.setItem(`@valo/tomorrow-note-${tomorrowISO}`, intention);
      setIntentionSaved(true);
      setTimeout(() => setIntentionSaved(false), 2000);
    } catch {}
  }

  const timeOfDay = getTimeOfDay(hour, modeOverride);

  const readiness = getReadinessConfig(dashboard?.sleepHours, dashboard?.hrv);
  const sleepSummary = formatSleepSummary(dashboard?.sleepHours, dashboard?.hrv);
  const focusSentence = getFocusSentence(goals, habits, intention);
  const dynamicCards =
    serverCards.length > 0
      ? serverCards.slice(0, 3).map(serverCardToDynCardWithAction)
      : getDynamicCards(dashboard, goals, habits, insights as InsightItem[] | undefined, timeOfDay);
  const debriefPrompt = getDebriefPrompt(callTime, todayEvents.length);

  const goToCheckIn = () => {
    trackFirstAction();
    trackEvent("checkin.start_from_today", { sessionId: sessionIdRef.current });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/(tabs)/checkin");
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: topPad + 16,
        paddingBottom: bottomPad + tabBarH + 16,
        paddingHorizontal: 20,
      }}
      refreshControl={
        <RefreshControl refreshing={!!isRefetching} onRefresh={refetch} tintColor={colors.primary} />
      }
    >
      {/* ── Wordmark ───────────────────────────────────────────────────────── */}
      <Image
        source={require("@/assets/images/logo-wordmark.png")}
        style={{ height: 36, width: 237, marginBottom: 12 }}
        resizeMode="contain"
        tintColor={colors.foreground}
      />

      {/* ── Greeting row ───────────────────────────────────────────────────── */}
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.dateLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {todayLabel()}
          </Text>
          <Text style={[styles.greetingText, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {greeting(hour)}{name ? `, ${name}` : ""}.
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(tabs)/profile");
          }}
          style={[styles.gearBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <Feather name="settings" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* ── HealthKit sync indicator ────────────────────────────────────────── */}
      {isHealthSyncing && Platform.OS === "ios" && (
        <View style={styles.healthSyncRow}>
          <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 6 }} />
          <Text style={[styles.healthSyncText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Syncing health data
          </Text>
        </View>
      )}

      {/* ── Dev mode toggle ─────────────────────────────────────────────────── */}
      <View style={styles.toggleRow}>
        <ModeToggle
          mode={currentMode}
          onToggle={() =>
            setModeOverride((prev) => {
              if (prev === null) return isMorning ? "evening" : "morning";
              return prev === "morning" ? "evening" : "morning";
            })
          }
          colors={colors}
        />
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
      ) : isMorning ? (
        /* ════════════════════════════════════════════════════════════════════
           MORNING MODE
        ════════════════════════════════════════════════════════════════════ */
        <>
          {/* 1. Readiness card */}
          <ReadinessCard
            readiness={readiness}
            hrv={dashboard?.hrv}
            sleep={dashboard?.sleepHours}
            rhr={(dashboard as any)?.restingHeartRate}
            colors={colors}
          />

          {/* 2. Sleep summary */}
          {sleepSummary ? (
            <Text
              style={[styles.sleepSummary, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
            >
              {sleepSummary}
            </Text>
          ) : null}

          {/* 3. Today's calendar strip */}
          <CalendarStrip
            events={todayEvents}
            colors={colors}
            isBusy={todayEvents.length > 3}
          />

          {/* 3b. Upcoming Google Calendar events (next 7 days, not today) */}
          {upcomingGoogleEvents.length > 0 && (
            <View style={[styles.calendarBlock, { marginTop: -4 }]}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                Coming from Google Calendar
              </Text>
              {upcomingGoogleEvents.map((ev) => {
                const [, m, d] = ev.date.split("-").map(Number);
                const dateLabel = new Date(Number(ev.date.split("-")[0]), (m ?? 1) - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                return (
                  <View key={ev.id} style={[styles.eventPill, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 6, paddingVertical: 9, paddingHorizontal: 12 }]}>
                    <View style={[styles.eventDot, { backgroundColor: "#4285F4" }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.eventPillText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]} numberOfLines={1}>
                        {ev.title}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 1 }}>
                        {dateLabel}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* 4. Focus card */}
          <FocusCard sentence={focusSentence} colors={colors} />

          {/* 5. Dynamic cards */}
          {dynamicCards.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text
                style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}
              >
                Valo's picks
              </Text>
              {dynamicCards.map((card) => (
                <DynCard
                  key={card.key}
                  card={card}
                  colors={colors}
                  onAction={card.primaryAction ? () => handleCardAction(card.primaryAction!) : undefined}
                />
              ))}
              {serverBonusCard != null && (
                <BonusCard card={serverBonusCard} colors={colors} />
              )}
              {hasError && serverCards.length === 0 && (
                <TouchableOpacity
                  style={[styles.retryRow, { borderColor: colors.border }]}
                  onPress={() => void refetchCards()}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh cards"
                >
                  <Feather name="refresh-cw" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.retryText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    Refresh cards
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* 6. Check-in button */}
          <TouchableOpacity
            style={[styles.checkInBtn, { backgroundColor: colors.primary }]}
            onPress={goToCheckIn}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Start morning check-in"
          >
            <Feather name="sun" size={19} color={colors.primaryForeground} />
            <Text
              style={[styles.checkInBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}
            >
              Start morning check-in
            </Text>
          </TouchableOpacity>

          {/* 7. Tomorrow prep (compact) */}
          <TomorrowPrep
            tomorrowEvents={tomorrowEvents}
            urgentGoals={urgentGoals}
            habits={habits as HabitItem[] | undefined}
            intention={intention}
            intentionSaved={intentionSaved}
            prominent={false}
            colors={colors}
            onIntentionChange={setIntention}
            onIntentionBlur={handleIntentionBlur}
            onPlanTomorrow={goToCheckIn}
          />
        </>
      ) : (
        /* ════════════════════════════════════════════════════════════════════
           EVENING MODE
        ════════════════════════════════════════════════════════════════════ */
        <>
          {/* 1. Debrief card (most prominent) */}
          <DebriefCard prompt={debriefPrompt} colors={colors} onPress={goToCheckIn} />

          {/* 2. Day at a glance */}
          <DayAtAGlance
            dashboard={dashboard}
            habits={habits}
            moodCount={todayMoods.length}
            colors={colors}
          />

          {/* 3. Mood arc */}
          <View style={styles.sectionBlock}>
            <Text
              style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}
            >
              Mood
            </Text>
            <MoodArc moods={todayMoods} colors={colors} onAdd={goToCheckIn} />
          </View>

          {/* 4. Dynamic cards */}
          {dynamicCards.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text
                style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}
              >
                Valo's picks
              </Text>
              {dynamicCards.map((card) => (
                <DynCard
                  key={card.key}
                  card={card}
                  colors={colors}
                  onAction={card.primaryAction ? () => handleCardAction(card.primaryAction!) : undefined}
                />
              ))}
              {serverBonusCard != null && (
                <BonusCard card={serverBonusCard} colors={colors} />
              )}
              {hasError && serverCards.length === 0 && (
                <TouchableOpacity
                  style={[styles.retryRow, { borderColor: colors.border }]}
                  onPress={() => void refetchCards()}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh cards"
                >
                  <Feather name="refresh-cw" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.retryText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    Refresh cards
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* 5. Tomorrow prep (prominent in evening) */}
          <TomorrowPrep
            tomorrowEvents={tomorrowEvents}
            urgentGoals={urgentGoals}
            habits={habits as HabitItem[] | undefined}
            intention={intention}
            intentionSaved={intentionSaved}
            prominent
            colors={colors}
            onIntentionChange={setIntention}
            onIntentionBlur={handleIntentionBlur}
            onPlanTomorrow={goToCheckIn}
          />
        </>
      )}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  dateLabel: { fontSize: 13, marginBottom: 4 },
  greetingText: { fontSize: 26, lineHeight: 32 },
  gearBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  // HealthKit sync indicator
  healthSyncRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  healthSyncText: {
    fontSize: 12,
  },
  // Mode toggle
  toggleRow: {
    alignItems: "flex-start",
    marginBottom: 20,
  },
  modeToggle: {
    flexDirection: "row",
    borderRadius: 100,
    borderWidth: 1,
    padding: 3,
    gap: 2,
  },
  modePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
  },
  modePillText: { fontSize: 12 },
  // Section layout
  sectionBlock: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  emptyText: { fontSize: 14 },
  // Readiness card
  readinessCard: {
    borderRadius: 16,
    padding: 22,
    marginBottom: 12,
    alignItems: "flex-start",
  },
  readinessText: { fontSize: 17, lineHeight: 26 },
  sleepSummary: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  // Calendar strip
  calendarBlock: { marginBottom: 20 },
  busyFlag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 100,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  busyFlagText: { fontSize: 12 },
  stripScroll: { gap: 8, paddingBottom: 4 },
  eventPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 100,
    borderWidth: 1,
    maxWidth: 200,
  },
  eventDot: { width: 6, height: 6, borderRadius: 3 },
  eventPillText: { fontSize: 13 },
  // Focus card
  focusCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    marginBottom: 20,
    gap: 8,
  },
  focusLabel: { fontSize: 11, letterSpacing: 0.8 },
  focusText: { fontSize: 16, lineHeight: 24 },
  // Dynamic cards
  dynCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    gap: 6,
  },
  dynCardHeader: { flexDirection: "row", alignItems: "center", gap: 7 },
  dynCardLabel: { fontSize: 12, letterSpacing: 0.3 },
  dynCardBody: { fontSize: 15, lineHeight: 22 },
  progressTrack: { height: 4, borderRadius: 2, overflow: "hidden", marginTop: 6 },
  progressFill: { height: 4, borderRadius: 2 },
  cardCta: {
    marginTop: 12,
    paddingVertical: 10,
    minHeight: 44,
    borderRadius: 8,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  cardCtaText: { fontSize: 14 },
  retryRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    marginTop: 4,
  },
  retryText: { fontSize: 13 },
  // Check-in button
  checkInBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 54,
    borderRadius: 14,
    marginBottom: 24,
  },
  checkInBtnText: { fontSize: 16 },
  // Debrief card (evening)
  debriefCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    marginBottom: 20,
    alignItems: "flex-start",
    gap: 0,
  },
  debriefPrompt: {
    fontSize: 20,
    lineHeight: 29,
    marginBottom: 22,
  },
  // Day at a glance
  glanceCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  glanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  glanceLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  glanceLabel: { fontSize: 14 },
  glanceValue: { fontSize: 14 },
  // Mood arc
  moodPromptCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  moodPromptText: { flex: 1, fontSize: 15 },
  moodArcCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
  },
  moodDotsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  moodDotColumn: { alignItems: "center", gap: 8 },
  moodDot: { justifyContent: "center", alignItems: "center" },
  moodDotScore: { fontSize: 14 },
  moodDotLabel: { fontSize: 11 },
  // Tomorrow prep
  tomorrowCard: {
    borderRadius: 16,
    overflow: "hidden",
  },
  tomorrowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  tomorrowHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  tomorrowTitle: { fontSize: 15 },
  tomorrowDate: { fontSize: 13 },
  tomorrowDivider: { height: StyleSheet.hairlineWidth },
  tomorrowSection: { padding: 16, gap: 10 },
  tomorrowSubHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  tomorrowSubLabel: { fontSize: 11, letterSpacing: 0.4, flex: 1 },
  tomorrowEventRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  tomorrowEventText: { fontSize: 14, flex: 1 },
  daysTag: { fontSize: 12 },
  valoSuggestLabel: { fontSize: 10, letterSpacing: 0.6 },
  valoSuggestCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  valoSuggestText: { fontSize: 13, fontStyle: "italic", flex: 1, lineHeight: 18 },
  intentionInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  savedTag: { fontSize: 12 },
  planBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    height: 48,
    borderWidth: 1.5,
    margin: 16,
    marginTop: 0,
    borderRadius: 14,
  },
  planBtnText: { fontSize: 15 },
  bonusCard: {
    borderRadius: 14,
    padding: 16,
    marginTop: 4,
    borderWidth: 1.5,
    gap: 6,
  },
  metricRow: {
    flexDirection: "row" as const,
    gap: 8,
    marginTop: 14,
    flexWrap: "wrap" as const,
  },
  metricPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center" as const,
    minWidth: 60,
  },
  metricValue: { fontSize: 16 },
  metricUnit: { fontSize: 11, letterSpacing: 0.4, marginTop: 2 },
});
