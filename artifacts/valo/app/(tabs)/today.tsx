import React, { useState, useEffect } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useValoAuth } from "@/contexts/AuthContext";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/useColors";
import {
  useGetDashboard,
  useListCalendarEvents,
  useListHabits,
  useListGoals,
  useListMoods,
} from "@workspace/api-client-react";

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

type DashData = { sleepHours?: number | null; hrv?: number | null; steps?: number | null; healthScore: number };
type GoalItem = { id: number; title: string; targetDate?: string | null; progressPercent: number };
type HabitItem = { id: number; name: string; streak: number; completedToday: boolean };

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

interface DynCardData {
  key: string;
  icon: string;
  label: string;
  body: string;
  accent?: boolean;
}

function getDynamicCards(
  dash: DashData | undefined,
  goals: GoalItem[] | undefined,
  habits: HabitItem[] | undefined,
  isEvening: boolean
): DynCardData[] {
  const cards: DynCardData[] = [];

  if (!isEvening && dash) {
    const goodRecovery = (dash.hrv ?? 0) > 55 || (dash.sleepHours ?? 0) > 7;
    const hasRecoveryData = dash.hrv != null || dash.sleepHours != null;
    if (hasRecoveryData) {
      cards.push({
        key: "recovery",
        icon: goodRecovery ? "battery-charging" : "battery",
        label: goodRecovery ? "Strong recovery" : "Low recovery",
        body: goodRecovery
          ? "Strong recovery today — your body is ready."
          : "Low recovery today — consider lighter effort.",
        accent: goodRecovery,
      });
    }
  }

  const goalDue = goals
    ?.filter((g) => g.targetDate && daysUntil(g.targetDate) >= 0 && daysUntil(g.targetDate) <= 14)
    .sort((a, b) => daysUntil(a.targetDate!) - daysUntil(b.targetDate!))[0];
  if (goalDue) {
    const days = daysUntil(goalDue.targetDate!);
    cards.push({
      key: "goal",
      icon: "target",
      label: "Goal progress",
      body: `${goalDue.title} — ${goalDue.progressPercent}% complete. ${days} day${days !== 1 ? "s" : ""} left.`,
    });
  }

  const bestStreak = habits
    ?.filter((h) => h.streak > 1)
    .sort((a, b) => b.streak - a.streak)[0];
  if (bestStreak) {
    if (bestStreak.streak > 3) {
      cards.push({
        key: "win",
        icon: "zap",
        label: "On a roll",
        body: `You're on a ${bestStreak.streak}-day streak with ${bestStreak.name}. Strong work.`,
        accent: true,
      });
    } else {
      cards.push({
        key: "streak",
        icon: "check-circle",
        label: "Streak",
        body: `${bestStreak.name} — ${bestStreak.streak} days straight. Keep it going.`,
      });
    }
  }

  return cards.slice(0, isEvening ? 2 : 3);
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
  colors,
}: {
  readiness: ReturnType<typeof getReadinessConfig>;
  colors: Colors;
}) {
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

function DynCard({ card, colors }: { card: DynCardData; colors: Colors }) {
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
      >
        <Feather name="moon" size={18} color={colors.primaryForeground} />
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
          <View style={styles.tomorrowSubHeader}>
            <Feather name="edit-3" size={12} color={colors.mutedForeground} />
            <Text style={[styles.tomorrowSubLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              Intention
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
            placeholder="Set your intention for tomorrow..."
            placeholderTextColor={colors.mutedForeground}
            multiline
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
  const { name, getToken } = useValoAuth();
  const router = useRouter();

  const { data: dashboard, isLoading, refetch, isRefetching } = useGetDashboard();
  const { data: habits } = useListHabits();
  const { data: goals } = useListGoals();
  const { data: calendarEvents } = useListCalendarEvents();
  const { data: moods } = useListMoods();

  const [modeOverride, setModeOverride] = useState<"morning" | "evening" | null>(null);
  const [intention, setIntention] = useState("");
  const [intentionSaved, setIntentionSaved] = useState(false);
  const [callTime, setCallTime] = useState<string | null>(null);

  const hour = new Date().getHours();
  const isMorning = modeOverride != null ? modeOverride === "morning" : hour < 18;
  const currentMode: "morning" | "evening" = isMorning ? "morning" : "evening";

  const todayISO = getTodayISO();
  const tomorrowISO = getTomorrowISO();

  const todayEvents = calendarEvents?.filter((e) => e.date === todayISO) ?? [];
  const tomorrowEvents = calendarEvents?.filter((e) => e.date === tomorrowISO) ?? [];
  const todayMoods = moods?.filter((m) => m.date === todayISO) ?? [];
  const urgentGoals =
    goals?.filter(
      (g) => g.targetDate && daysUntil(g.targetDate) >= 0 && daysUntil(g.targetDate) <= 7
    ) ?? [];

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const tabBarH = Platform.OS === "web" ? 84 : 83;

  useEffect(() => {
    AsyncStorage.getItem(INTENTION_KEY)
      .then((v) => { if (v) setIntention(v); })
      .catch(() => {});
    void loadCallTime();
  }, []);

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
      await AsyncStorage.setItem(INTENTION_KEY, intention);
      setIntentionSaved(true);
      setTimeout(() => setIntentionSaved(false), 2000);
    } catch {}
  }

  const readiness = getReadinessConfig(dashboard?.sleepHours, dashboard?.hrv);
  const sleepSummary = formatSleepSummary(dashboard?.sleepHours, dashboard?.hrv);
  const focusSentence = getFocusSentence(goals, habits, intention);
  const dynamicCards = getDynamicCards(dashboard, goals, habits, !isMorning);
  const debriefPrompt = getDebriefPrompt(callTime, todayEvents.length);

  const goToCheckIn = () => {
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
        >
          <Feather name="settings" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

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
          <ReadinessCard readiness={readiness} colors={colors} />

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
                <DynCard key={card.key} card={card} colors={colors} />
              ))}
            </View>
          )}

          {/* 6. Check-in button */}
          <TouchableOpacity
            style={[styles.checkInBtn, { backgroundColor: colors.primary }]}
            onPress={goToCheckIn}
            activeOpacity={0.85}
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
                <DynCard key={card.key} card={card} colors={colors} />
              ))}
            </View>
          )}

          {/* 5. Tomorrow prep (prominent in evening) */}
          <TomorrowPrep
            tomorrowEvents={tomorrowEvents}
            urgentGoals={urgentGoals}
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
  // Check-in button
  checkInBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 56,
    borderRadius: 16,
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
  intentionInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 68,
    textAlignVertical: "top",
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
});
