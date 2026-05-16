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
} from "@workspace/api-client-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INTENTION_KEY = "@valo/tomorrow-intention";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function getDebriefConfig(hour: number): { label: string; icon: string } {
  if (hour < 12) return { label: "Start morning check-in", icon: "sun" };
  if (hour < 18) return { label: "Check in with Valo", icon: "mic" };
  return { label: "Start evening debrief", icon: "moon" };
}

function getTomorrowDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

function getTomorrowISO(): string {
  const d = getTomorrowDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTomorrowLabel(): string {
  return getTomorrowDate().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Shared sub-components ────────────────────────────────────────────────────

interface MetricTileProps {
  label: string;
  value: string | null;
  unit?: string;
  icon: string;
  onLogIt: () => void;
}

function MetricTile({ label, value, unit, icon, onLogIt }: MetricTileProps) {
  const colors = useColors();
  return (
    <View style={[styles.metricTile, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name={icon as any} size={16} color={colors.primary} style={{ marginBottom: 8 }} />
      <Text style={[styles.metricLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>{label}</Text>
      {value !== null ? (
        <Text style={[styles.metricValue, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {value}
          <Text style={[styles.metricUnit, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {unit ? ` ${unit}` : ""}
          </Text>
        </Text>
      ) : (
        <View style={{ alignItems: "center" }}>
          <Text style={[styles.metricDash, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>—</Text>
          <TouchableOpacity onPress={onLogIt}>
            <Text style={[styles.logItText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>Log it</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

interface PillarCardProps {
  title: string;
  score: number;
  status: string;
  color: string;
}

function PillarCard({ title, score, status, color }: PillarCardProps) {
  const colors = useColors();
  return (
    <View style={[styles.pillarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.pillarHeader}>
        <Text style={[styles.pillarTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{title}</Text>
        <Text style={[styles.pillarScore, { color, fontFamily: "Inter_700Bold" }]}>{score}/10</Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
        <View style={[styles.progressFill, { backgroundColor: color, width: `${(score / 10) * 100}%` }]} />
      </View>
      <Text style={[styles.pillarStatus, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{status}</Text>
    </View>
  );
}

// ─── Morning snapshot ─────────────────────────────────────────────────────────

function MorningSnapshot({
  dashboard,
  topHabitName,
  name,
}: {
  dashboard: { sleepHours?: number | null; hrv?: number | null; healthScore?: number | null } | undefined;
  topHabitName: string | null;
  name: string | null;
}) {
  const colors = useColors();

  const snapshotItems: { label: string; value: string; icon: string }[] = [];
  if (dashboard?.sleepHours != null) {
    snapshotItems.push({ label: "Sleep", value: `${dashboard.sleepHours} hrs`, icon: "moon" });
  }
  if (dashboard?.hrv != null) {
    snapshotItems.push({ label: "HRV", value: `${dashboard.hrv} ms`, icon: "heart" });
  }
  if (dashboard?.healthScore != null) {
    snapshotItems.push({ label: "Health score", value: `${dashboard.healthScore}/10`, icon: "activity" });
  }

  if (snapshotItems.length === 0 && !topHabitName) return null;

  return (
    <View style={styles.sectionBlock}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
        Your morning snapshot
      </Text>
      <View style={[styles.snapshotCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {snapshotItems.length > 0 && (
          <View style={styles.snapshotMetrics}>
            {snapshotItems.map((item) => (
              <View key={item.label} style={[styles.snapshotMetricItem, { borderColor: colors.border }]}>
                <Feather name={item.icon as any} size={14} color={colors.primary} />
                <Text style={[styles.snapshotMetricLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {item.label}
                </Text>
                <Text style={[styles.snapshotMetricValue, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                  {item.value}
                </Text>
              </View>
            ))}
          </View>
        )}

        {topHabitName && (
          <View style={[styles.snapshotHabitRow, { borderTopColor: colors.border, borderTopWidth: snapshotItems.length > 0 ? StyleSheet.hairlineWidth : 0 }]}>
            <View style={[styles.habitDot, { backgroundColor: colors.primary }]} />
            <Text style={[styles.snapshotHabitText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
              {"Top habit today: "}
              <Text style={{ fontFamily: "Inter_600SemiBold" }}>{topHabitName}</Text>
            </Text>
          </View>
        )}

        <Text style={[styles.morningMotivation, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {`Make today count${name ? `, ${name}` : ""}.`}
        </Text>
      </View>
    </View>
  );
}

// ─── Tomorrow prep ────────────────────────────────────────────────────────────

function TomorrowPrep({
  tomorrowEvents,
  urgentGoals,
  intention,
  intentionSaved,
  onIntentionChange,
  onIntentionBlur,
  onPlanTomorrow,
  onAddToCalendar,
}: {
  tomorrowEvents: { id: number; title: string; type?: string | null }[];
  urgentGoals: { id: number; title: string; targetDate?: string | null }[];
  intention: string;
  intentionSaved: boolean;
  onIntentionChange: (text: string) => void;
  onIntentionBlur: () => void;
  onPlanTomorrow: () => void;
  onAddToCalendar: () => void;
}) {
  const colors = useColors();

  return (
    <View style={styles.sectionBlock}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
        Tomorrow
      </Text>
      <View style={[styles.tomorrowCard, { backgroundColor: colors.card, borderColor: colors.accent }]}>

        {/* Header */}
        <View style={styles.tomorrowHeader}>
          <View style={styles.tomorrowHeaderLeft}>
            <Feather name="moon" size={16} color={colors.primary} />
            <Text style={[styles.tomorrowTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              Tomorrow
            </Text>
          </View>
          <Text style={[styles.tomorrowDate, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {formatTomorrowLabel()}
          </Text>
        </View>

        <View style={[styles.tomorrowDivider, { backgroundColor: colors.border }]} />

        {/* Calendar events */}
        <View style={styles.tomorrowSubSection}>
          <View style={styles.tomorrowSubHeader}>
            <Feather name="calendar" size={13} color={colors.mutedForeground} />
            <Text style={[styles.tomorrowSubLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              Scheduled
            </Text>
            <TouchableOpacity onPress={onAddToCalendar} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.addCalendarLink, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
                + Add
              </Text>
            </TouchableOpacity>
          </View>
          {tomorrowEvents.length === 0 ? (
            <Text style={[styles.tomorrowEmpty, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Nothing scheduled yet
            </Text>
          ) : (
            tomorrowEvents.map((ev) => (
              <View key={ev.id} style={styles.eventRow}>
                <View style={[styles.eventDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.eventTitle, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                  {ev.title}
                </Text>
                {ev.type ? (
                  <Text style={[styles.eventType, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    {ev.type}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </View>

        {/* Urgent goals */}
        {urgentGoals.length > 0 && (
          <>
            <View style={[styles.tomorrowDivider, { backgroundColor: colors.border }]} />
            <View style={styles.tomorrowSubSection}>
              <View style={styles.tomorrowSubHeader}>
                <Feather name="target" size={13} color={colors.mutedForeground} />
                <Text style={[styles.tomorrowSubLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                  Goals due soon
                </Text>
              </View>
              {urgentGoals.map((goal) => {
                const days = goal.targetDate ? daysUntil(goal.targetDate) : null;
                return (
                  <View key={goal.id} style={styles.urgentGoalRow}>
                    <View style={[styles.eventDot, { backgroundColor: "#5B8CDE" }]} />
                    <Text
                      style={[styles.urgentGoalTitle, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                      numberOfLines={1}
                    >
                      {goal.title}
                    </Text>
                    {days !== null && (
                      <View style={[styles.daysBadge, { backgroundColor: days <= 1 ? "#FEE2E2" : colors.muted }]}>
                        <Text
                          style={[
                            styles.daysText,
                            {
                              color: days <= 1 ? "#D4473E" : colors.mutedForeground,
                              fontFamily: "Inter_500Medium",
                            },
                          ]}
                        >
                          {days === 0 ? "Today" : days === 1 ? "1 day left" : `${days} days left`}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}

        <View style={[styles.tomorrowDivider, { backgroundColor: colors.border }]} />

        {/* Intention */}
        <View style={styles.tomorrowSubSection}>
          <View style={styles.tomorrowSubHeader}>
            <Feather name="edit-3" size={13} color={colors.mutedForeground} />
            <Text style={[styles.tomorrowSubLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              Intention
            </Text>
            {intentionSaved && (
              <Text style={[styles.savedBadge, { color: colors.primary, fontFamily: "Inter_400Regular" }]}>
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

        {/* Plan tomorrow button */}
        <TouchableOpacity
          style={[styles.planBtn, { borderColor: colors.primary }]}
          onPress={onPlanTomorrow}
          activeOpacity={0.8}
        >
          <Feather name="mic" size={16} color={colors.primary} />
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
  const { name } = useValoAuth();
  const router = useRouter();

  const { data: dashboard, isLoading, refetch, isRefetching } = useGetDashboard();
  const { data: habits } = useListHabits();
  const { data: goals } = useListGoals();
  const { data: calendarEvents } = useListCalendarEvents();

  const [intention, setIntention] = useState("");
  const [intentionSaved, setIntentionSaved] = useState(false);

  const hour = new Date().getHours();
  const isMorning = hour < 12;
  const debriefConfig = getDebriefConfig(hour);
  const tomorrowISO = getTomorrowISO();

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const tabBarH = Platform.OS === "web" ? 84 : 83;

  // Load tomorrow's intention from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(INTENTION_KEY)
      .then((val) => { if (val) setIntention(val); })
      .catch(() => {});
  }, []);

  const goToLog = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(tabs)/log");
  };

  async function handleIntentionBlur() {
    try {
      await AsyncStorage.setItem(INTENTION_KEY, intention);
      setIntentionSaved(true);
      setTimeout(() => setIntentionSaved(false), 2000);
    } catch {}
  }

  // Filter calendar events to tomorrow only
  const tomorrowEvents = calendarEvents?.filter((e) => e.date === tomorrowISO) ?? [];

  // Goals due within the next 7 days
  const urgentGoals =
    goals?.filter((g) => {
      if (!g.targetDate) return false;
      const days = daysUntil(g.targetDate);
      return days >= 0 && days <= 7;
    }) ?? [];

  // Top incomplete habit for morning snapshot
  const topHabit = habits?.find((h) => !h.completedToday) ?? null;

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
      {/* ── Greeting ──────────────────────────────────────────────────────── */}
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.greeting, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {todayLabel()}
          </Text>
          <Text style={[styles.greetingName, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {greeting()}{name ? `, ${name}` : ""}.
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

      {/* ── Check-in button (time-aware) ───────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.debriefBtn, { backgroundColor: colors.primary }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push("/(tabs)/checkin");
        }}
      >
        <Feather name={debriefConfig.icon as any} size={20} color={colors.primaryForeground} />
        <Text style={[styles.debriefBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
          {debriefConfig.label}
        </Text>
      </TouchableOpacity>

      {/* ── Morning snapshot (before noon only) ───────────────────────────── */}
      {isMorning && !isLoading && (
        <MorningSnapshot
          dashboard={dashboard}
          topHabitName={topHabit?.name ?? null}
          name={name}
        />
      )}

      {/* ── Main data sections ─────────────────────────────────────────────── */}
      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            Today's metrics
          </Text>
          <View style={styles.metricsRow}>
            <MetricTile
              label="Sleep"
              value={dashboard?.sleepHours != null ? String(dashboard.sleepHours) : null}
              unit="hrs"
              icon="moon"
              onLogIt={goToLog}
            />
            <MetricTile
              label="HRV"
              value={dashboard?.hrv != null ? String(dashboard.hrv) : null}
              unit="ms"
              icon="heart"
              onLogIt={goToLog}
            />
            <MetricTile
              label="Steps"
              value={
                dashboard?.steps != null
                  ? dashboard.steps >= 1000
                    ? `${(dashboard.steps / 1000).toFixed(1)}k`
                    : String(dashboard.steps)
                  : null
              }
              icon="activity"
              onLogIt={goToLog}
            />
            <MetricTile
              label="RHR"
              value={dashboard?.restingHeartRate != null ? String(dashboard.restingHeartRate) : null}
              unit="bpm"
              icon="radio"
              onLogIt={goToLog}
            />
          </View>

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            Pillar scores
          </Text>
          <PillarCard
            title="Health"
            score={dashboard?.healthScore ?? 0}
            status={dashboard?.healthStatus ?? "No data yet"}
            color={colors.primary}
          />
          <PillarCard
            title="Work & Mission"
            score={dashboard?.workScore ?? 0}
            status={dashboard?.workStatus ?? "No data yet"}
            color="#5B8CDE"
          />
          <PillarCard
            title="Relationships"
            score={dashboard?.relationshipScore ?? 0}
            status={dashboard?.relationshipStatus ?? "No data yet"}
            color="#7DCB8F"
          />

          {/* ── Tomorrow prep ────────────────────────────────────────────── */}
          <TomorrowPrep
            tomorrowEvents={tomorrowEvents}
            urgentGoals={urgentGoals}
            intention={intention}
            intentionSaved={intentionSaved}
            onIntentionChange={setIntention}
            onIntentionBlur={handleIntentionBlur}
            onPlanTomorrow={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push("/(tabs)/checkin");
            }}
            onAddToCalendar={() => {
              router.push("/(tabs)/calendar" as any);
            }}
          />
        </>
      )}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 28 },
  gearBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
  },
  greeting: { fontSize: 14, marginBottom: 4 },
  greetingName: { fontSize: 28, lineHeight: 34 },
  sectionLabel: {
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 12,
    marginTop: 4,
  },
  metricsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  metricTile: { flex: 1, minWidth: "44%", padding: 16, borderRadius: 14, borderWidth: 1, alignItems: "center" },
  metricLabel: { fontSize: 12, marginBottom: 4 },
  metricValue: { fontSize: 22, marginTop: 2 },
  metricUnit: { fontSize: 13 },
  metricDash: { fontSize: 22, marginTop: 2, marginBottom: 2 },
  logItText: { fontSize: 12, marginTop: 2 },
  pillarCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 12 },
  pillarHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  pillarTitle: { fontSize: 15 },
  pillarScore: { fontSize: 15 },
  progressTrack: { height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 8 },
  progressFill: { height: 6, borderRadius: 3 },
  pillarStatus: { fontSize: 13 },
  debriefBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 54,
    borderRadius: 14,
    marginTop: 12,
    marginBottom: 28,
  },
  debriefBtnText: { fontSize: 16 },
  // Section block wrapper
  sectionBlock: {
    marginBottom: 8,
  },
  // Morning snapshot
  snapshotCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 24,
  },
  snapshotMetrics: {
    flexDirection: "row",
  },
  snapshotMetricItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
    gap: 4,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  snapshotMetricLabel: { fontSize: 11 },
  snapshotMetricValue: { fontSize: 15 },
  snapshotHabitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  habitDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  snapshotHabitText: { fontSize: 14, flex: 1 },
  morningMotivation: {
    fontSize: 13,
    fontStyle: "italic",
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
  },
  // Tomorrow prep
  tomorrowCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: "hidden",
    marginBottom: 16,
  },
  tomorrowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  tomorrowHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tomorrowTitle: { fontSize: 16 },
  tomorrowDate: { fontSize: 13 },
  tomorrowDivider: { height: StyleSheet.hairlineWidth },
  tomorrowSubSection: {
    padding: 16,
    gap: 10,
  },
  tomorrowSubHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tomorrowSubLabel: {
    fontSize: 12,
    letterSpacing: 0.4,
    flex: 1,
  },
  addCalendarLink: { fontSize: 13 },
  tomorrowEmpty: { fontSize: 14 },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  eventDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  eventTitle: { fontSize: 14, flex: 1 },
  eventType: { fontSize: 12 },
  urgentGoalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  urgentGoalTitle: { fontSize: 14, flex: 1 },
  daysBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 100,
  },
  daysText: { fontSize: 11 },
  intentionInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 72,
    textAlignVertical: "top",
  },
  savedBadge: { fontSize: 12 },
  planBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 50,
    borderWidth: 1.5,
    margin: 16,
    marginTop: 0,
    borderRadius: 14,
  },
  planBtnText: { fontSize: 15 },
});
