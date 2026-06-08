import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListInsights,
  useListMoods,
  useGetDashboard,
  useListDailyLogHistory,
  useRefreshInsights,
  getListInsightsQueryKey,
  getListMoodsQueryKey,
  getGetDashboardQueryKey,
  getListDailyLogHistoryQueryKey,
  type DailyLog,
  type InsightEntry,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { trackEvent } from "@/services/telemetry";
import { getUpcomingHoliday } from "@/constants/federalHolidays";
import { useHolidayRegion } from "@/hooks/useHolidayRegion";
import * as Haptics from "expo-haptics";

// ─── Types ────────────────────────────────────────────────────────────────────

type Colors = ReturnType<typeof useColors>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLast7Dates(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split("T")[0]!;
  });
}

function getLast14Dates(): string[] {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().split("T")[0]!;
  });
}

function shortDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][d.getDay()]!;
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function computeDayHealthScore(log: DailyLog): number | null {
  const parts: number[] = [];
  if (log.sleepHours != null) {
    parts.push(Math.min(10, Math.max(0, ((log.sleepHours - 4) / 4) * 10)));
  }
  if (log.workoutType != null) parts.push(8);
  if (log.steps != null) {
    parts.push(Math.min(10, (log.steps / 10000) * 10));
  }
  if (parts.length === 0) return null;
  return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 10) / 10;
}

// ─── MoodBar ──────────────────────────────────────────────────────────────────

interface MoodBarProps {
  score: number | null;
  day: string;
  colors: Colors;
}

function MoodBar({ score, day, colors }: MoodBarProps) {
  const MAX_H = 60;
  const barH = score != null ? Math.max(4, (score / 10) * MAX_H) : 4;
  const barColor =
    score == null
      ? colors.border
      : score >= 7
      ? "#4CAF50"
      : score >= 4
      ? colors.primary
      : "#EF4444";

  return (
    <View style={styles.barWrapper}>
      <View
        style={[styles.barTrack, { backgroundColor: colors.muted, height: MAX_H }]}
      >
        <View
          style={[
            styles.barFill,
            {
              backgroundColor: barColor,
              height: barH,
              opacity: score != null ? 1 : 0.3,
            },
          ]}
        />
      </View>
      {score != null && (
        <Text style={[styles.barScore, { color: colors.foreground }]}>
          {score}
        </Text>
      )}
      <Text style={[styles.barDay, { color: colors.mutedForeground }]}>{day}</Text>
    </View>
  );
}

// ─── TrendBar (generic mini sparkline bar) ────────────────────────────────────

interface TrendBarsProps {
  values: (number | null)[];
  maxVal?: number;
  barColor: string;
  emptyColor: string;
}

function TrendBars({ values, maxVal, barColor, emptyColor }: TrendBarsProps) {
  const BAR_H = 28;
  const nums = values.filter((v): v is number => v != null);
  const top = maxVal ?? (nums.length > 0 ? Math.max(...nums) : 10);
  const min = nums.length > 0 ? Math.min(...nums) : 0;
  const range = top === min ? top : top - min;

  return (
    <View style={styles.trendBarsRow}>
      {values.map((v, i) => {
        const h =
          v != null ? Math.max(3, Math.round(((v - min) / range) * BAR_H)) : 3;
        return (
          <View
            key={i}
            style={[
              styles.trendBar,
              {
                height: h,
                backgroundColor: v != null ? barColor : emptyColor,
                opacity: i === values.length - 1 ? 1 : 0.6,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

// ─── WeeklySummaryCard ────────────────────────────────────────────────────────

interface WeeklySummaryProps {
  logHistory: DailyLog[];
  moodScores: Map<string, number>;
  colors: Colors;
}

function WeeklySummaryCard({
  logHistory,
  moodScores,
  colors,
}: WeeklySummaryProps) {
  const last7 = getLast7Dates();
  const logsThisWeek = logHistory.filter((l) => last7.includes(l.date));

  const daysLogged = logsThisWeek.length;
  const sleepVals = logsThisWeek
    .map((l) => l.sleepHours)
    .filter((v): v is number => v != null);
  const avgSleep = avg(sleepVals);
  const workoutCount = logsThisWeek.filter((l) => l.workoutType != null).length;
  const moodVals = last7
    .map((d) => moodScores.get(d))
    .filter((v): v is number => v != null);
  const avgMood = avg(moodVals);

  const stats: { label: string; value: string; sub?: string }[] = [
    {
      label: "Days logged",
      value: `${daysLogged}/7`,
    },
    ...(avgMood != null
      ? [
          {
            label: "Avg mood",
            value: avgMood.toFixed(1),
            sub: "/10",
          },
        ]
      : []),
    ...(avgSleep != null
      ? [
          {
            label: "Avg sleep",
            value: avgSleep.toFixed(1),
            sub: "hrs",
          },
        ]
      : []),
    {
      label: "Workouts",
      value: String(workoutCount),
      sub: "this week",
    },
  ];

  return (
    <View
      style={[
        styles.summaryCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.summaryHeader}>
        <Text style={[styles.summaryTitle, { color: colors.foreground }]}>
          This Week
        </Text>
        <Text style={[styles.summaryDate, { color: colors.mutedForeground }]}>
          {shortDate(last7[0]!)} — {shortDate(last7[6]!)}
        </Text>
      </View>
      <View style={styles.summaryStats}>
        {stats.map((s) => (
          <View key={s.label} style={styles.statItem}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 1 }}>
              <Text style={[styles.statValue, { color: colors.primary }]}>
                {s.value}
              </Text>
              {s.sub && (
                <Text
                  style={[styles.statSub, { color: colors.mutedForeground }]}
                >
                  {s.sub}
                </Text>
              )}
            </View>
            <Text
              style={[styles.statLabel, { color: colors.mutedForeground }]}
            >
              {s.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── PillarTrendsSection ──────────────────────────────────────────────────────

interface PillarTrendsProps {
  logHistory: DailyLog[];
  moodScores: Map<string, number>;
  dashboardHealthScore: number | null;
  dashboardWorkScore: number | null;
  dashboardRelScore: number | null;
  dashboardHealthStatus: string | null;
  dashboardWorkStatus: string | null;
  dashboardRelStatus: string | null;
  colors: Colors;
}

function PillarTrendsSection({
  logHistory,
  moodScores,
  dashboardHealthScore,
  dashboardWorkScore,
  dashboardRelScore,
  dashboardHealthStatus,
  dashboardWorkStatus,
  dashboardRelStatus,
  colors,
}: PillarTrendsProps) {
  const last14 = getLast14Dates();
  const logByDate = new Map(logHistory.map((l) => [l.date, l]));

  const healthVals = last14.map((d) => {
    const log = logByDate.get(d);
    return log ? computeDayHealthScore(log) : null;
  });

  const moodVals = last14.map((d) => moodScores.get(d) ?? null);

  const pillars = [
    {
      name: "Health",
      score: dashboardHealthScore,
      status: dashboardHealthStatus,
      values: healthVals,
      color: "#4CAF50",
    },
    {
      name: "Relationships",
      score: dashboardRelScore,
      status: dashboardRelStatus,
      values: moodVals,
      color: "#5B8CDE",
    },
    {
      name: "Work & Mission",
      score: dashboardWorkScore,
      status: dashboardWorkStatus,
      values: null,
      color: colors.primary,
    },
  ];

  return (
    <View style={styles.pillarSection}>
      {pillars.map((p) => (
        <View
          key={p.name}
          style={[
            styles.pillarCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.pillarCardTop}>
            <Text
              style={[styles.pillarName, { color: colors.mutedForeground }]}
            >
              {p.name.toUpperCase()}
            </Text>
            {p.score != null && (
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 1 }}>
                <Text style={[styles.pillarScore, { color: p.color }]}>
                  {p.score}
                </Text>
                <Text
                  style={[styles.pillarScoreMax, { color: colors.mutedForeground }]}
                >
                  /10
                </Text>
              </View>
            )}
          </View>
          {p.status && (
            <Text
              style={[styles.pillarStatus, { color: colors.foreground }]}
            >
              {p.status}
            </Text>
          )}
          {p.values != null ? (
            <View style={{ marginTop: 10 }}>
              <TrendBars
                values={p.values}
                maxVal={10}
                barColor={p.color}
                emptyColor={colors.border}
              />
              <Text
                style={[styles.trendCaption, { color: colors.mutedForeground }]}
              >
                14-day trend
              </Text>
            </View>
          ) : (
            <Text
              style={[styles.trendCaption, { color: colors.mutedForeground, marginTop: 8 }]}
            >
              Based on today's habits
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

// ─── InsightCard ──────────────────────────────────────────────────────────────

interface InsightCardProps {
  insight: InsightEntry;
  colors: Colors;
}

function InsightCard({ insight, colors }: InsightCardProps) {
  return (
    <View
      style={[
        styles.insightCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View
        style={[
          styles.insightBadge,
          { backgroundColor: colors.primary + "22" },
        ]}
      >
        <Text style={[styles.insightLabel, { color: colors.primary }]}>
          {insight.label}
        </Text>
      </View>
      <Text style={[styles.insightContent, { color: colors.foreground }]}>
        {insight.content}
      </Text>
      {insight.followUpQuestion && (
        <View
          style={[
            styles.followUpBox,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          <Feather name="message-circle" size={13} color={colors.mutedForeground} />
          <Text
            style={[styles.followUpText, { color: colors.mutedForeground }]}
          >
            {insight.followUpQuestion}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ colors }: { colors: Colors }) {
  return (
    <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View
        style={[styles.emptyIconBox, { backgroundColor: colors.muted }]}
      >
        <Feather name="bar-chart-2" size={28} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
        Start tracking to see your insights
      </Text>
      <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
        Log your health metrics, mood, and habits from the Check-In tab. Once
        you have a few days of data, personalised insights and trends will
        appear here.
      </Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function InsightsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { region } = useHolidayRegion();
  const [refreshing, setRefreshing] = useState(false);

  const { data: insights = [], isLoading: insightsLoading } = useListInsights();
  const { data: moods = [], isLoading: moodsLoading } = useListMoods();
  const { data: dashboard } = useGetDashboard();
  const { data: logHistory = [], isLoading: historyLoading } =
    useListDailyLogHistory();
  const refreshMutation = useRefreshInsights();

  const loading = insightsLoading || moodsLoading || historyLoading;

  useEffect(() => {
    if (!insightsLoading && insights.length > 0) {
      trackEvent("insight_shown", { count: insights.length });
    }
  }, [insightsLoading, insights.length]);

  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries({ queryKey: getListInsightsQueryKey() });
      qc.invalidateQueries({ queryKey: getListMoodsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      qc.invalidateQueries({ queryKey: getListDailyLogHistoryQueryKey() });
    }, [qc])
  );

  async function handleRefresh() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    try {
      await refreshMutation.mutateAsync();
      await qc.invalidateQueries({ queryKey: getListInsightsQueryKey() });
    } catch {
      Alert.alert("Error", "Could not refresh insights. Please try again.");
    } finally {
      setRefreshing(false);
    }
  }

  // Build mood map and chart data
  const moodScores = new Map(moods.map((m) => [m.date, m.score]));
  const last7Dates = getLast7Dates();
  const moodChartData = last7Dates.map((d) => moodScores.get(d) ?? null);

  // Show content only when there are 3+ days of logged data
  const hasSufficientData = logHistory.length >= 3;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        {/* Header */}
        <View
          style={[styles.header, { borderBottomColor: colors.border }]}
        >
          <View>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>
              Insights
            </Text>
            <Text
              style={[styles.headerSub, { color: colors.mutedForeground }]}
            >
              Patterns in your data
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleRefresh}
            disabled={refreshing || loading}
            style={[
              styles.refreshBtn,
              { backgroundColor: colors.muted, borderColor: colors.border },
            ]}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather name="refresh-cw" size={15} color={colors.primary} />
            )}
            <Text style={[styles.refreshBtnText, { color: colors.primary }]}>
              {refreshing ? "Updating" : "Refresh"}
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text
              style={[styles.loadingText, { color: colors.mutedForeground }]}
            >
              Analysing your data
            </Text>
          </View>
        ) : !hasSufficientData ? (
          <View style={[styles.emptyStateWrap, { paddingHorizontal: 20, paddingTop: 48 }]}>
            <Feather name="bar-chart-2" size={36} color={colors.mutedForeground} style={{ alignSelf: "center", marginBottom: 16 }} />
            <Text style={[styles.emptyStateHeading, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              Not enough data yet
            </Text>
            <Text style={[styles.emptyStateBody, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Keep tracking and your insights will appear here.
            </Text>
          </View>
        ) : (
          <>
            {/* Weekly Summary */}
            <View style={styles.sectionBlock}>
              <WeeklySummaryCard
                logHistory={logHistory}
                moodScores={moodScores}
                colors={colors}
              />
            </View>

            {/* Mood Chart */}
            <View style={[styles.sectionBlock, { paddingTop: 0 }]}>
              <View
                style={[
                  styles.chartCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.chartCardHeader}>
                  <Text
                    style={[
                      styles.chartCardTitle,
                      { color: colors.foreground },
                    ]}
                  >
                    Mood — last 7 days
                  </Text>
                  {moods.length > 0 && (
                    <Text
                      style={[
                        styles.chartCardAvg,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      avg{" "}
                      <Text style={{ color: colors.primary }}>
                        {avg(moods.map((m) => m.score))?.toFixed(1)}
                      </Text>
                      /10
                    </Text>
                  )}
                </View>
                {moods.length === 0 ? (
                  <Text
                    style={[
                      styles.chartEmptyText,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Log your mood from the Check-In tab to see trends here.
                  </Text>
                ) : (
                  <View style={styles.chartRow}>
                    {moodChartData.map((score, i) => (
                      <MoodBar
                        key={i}
                        score={score}
                        day={shortDay(last7Dates[i]!)}
                        colors={colors}
                      />
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* Pillar Trends */}
            {(dashboard != null || logHistory.length > 0) && (
              <View style={styles.sectionBlock}>
                <Text
                  style={[
                    styles.sectionTitle,
                    { color: colors.foreground },
                  ]}
                >
                  Pillar Scores
                </Text>
                <Text
                  style={[
                    styles.sectionSub,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Today's standing across your life pillars
                </Text>
                <PillarTrendsSection
                  logHistory={logHistory}
                  moodScores={moodScores}
                  dashboardHealthScore={dashboard?.healthScore ?? null}
                  dashboardWorkScore={dashboard?.workScore ?? null}
                  dashboardRelScore={dashboard?.relationshipScore ?? null}
                  dashboardHealthStatus={dashboard?.healthStatus ?? null}
                  dashboardWorkStatus={dashboard?.workStatus ?? null}
                  dashboardRelStatus={dashboard?.relationshipStatus ?? null}
                  colors={colors}
                />
              </View>
            )}

            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
            />

            {/* Upcoming Holiday */}
            {(() => {
              const upcoming = getUpcomingHoliday(30, region);
              if (!upcoming) return null;
              const label =
                upcoming.daysAway === 0
                  ? "Today"
                  : upcoming.daysAway === 1
                  ? "Tomorrow"
                  : `In ${upcoming.daysAway} days`;
              const HOLIDAY_COLOR = "#C17B3F";
              const message =
                upcoming.daysAway === 0
                  ? `${upcoming.name} is today — a federal holiday. Take time to rest or connect with those around you.`
                  : `${upcoming.name} is ${label.toLowerCase()} — a good time to plan ahead, schedule recovery, or set intentions for the long weekend.`;
              return (
                <View style={[styles.sectionBlock, { paddingTop: 20 }]}>
                  <View
                    style={{
                      backgroundColor: HOLIDAY_COLOR + "12",
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: HOLIDAY_COLOR + "35",
                      padding: 16,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <View
                        style={{
                          backgroundColor: HOLIDAY_COLOR + "22",
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: HOLIDAY_COLOR }}>
                          Federal Holiday
                        </Text>
                      </View>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                        {label}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 6 }}>
                      {upcoming.name}
                    </Text>
                    <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 22 }}>
                      {message}
                    </Text>
                  </View>
                </View>
              );
            })()}

            {/* AI Insights */}
            <View style={styles.sectionBlock}>
              <Text
                style={[styles.sectionTitle, { color: colors.foreground }]}
              >
                AI Insights
              </Text>
              <Text
                style={[
                  styles.sectionSub,
                  { color: colors.mutedForeground },
                ]}
              >
                Generated from your real logged data
              </Text>

              {insightsLoading ? (
                <ActivityIndicator
                  color={colors.primary}
                  style={{ marginTop: 16, alignSelf: "center" }}
                />
              ) : insights.length === 0 ? (
                <View
                  style={[
                    styles.insightsEmptyCard,
                    {
                      backgroundColor: colors.muted,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Feather
                    name="cpu"
                    size={22}
                    color={colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.insightsEmptyText,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Keep logging for a few more days — insights will appear once
                    there is enough data to find patterns.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  {insights.map((insight) => (
                    <InsightCard
                      key={insight.id}
                      insight={insight}
                      colors={colors}
                    />
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 14,
    marginTop: 2,
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  refreshBtnText: {
    fontSize: 13,
    fontWeight: "500",
  },

  // Loading
  loadingContainer: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },

  // Section layout
  sectionBlock: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  sectionSub: {
    fontSize: 13,
    marginTop: 2,
    marginBottom: 12,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 20,
    marginTop: 20,
  },

  // Weekly summary card
  summaryCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 16,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  summaryDate: {
    fontSize: 12,
  },
  summaryStats: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  statItem: {
    alignItems: "center",
    gap: 3,
    flex: 1,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  statSub: {
    fontSize: 12,
    fontWeight: "500",
  },
  statLabel: {
    fontSize: 11,
    textAlign: "center",
  },

  // Mood chart
  chartCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  chartCardHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  chartCardTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  chartCardAvg: {
    fontSize: 13,
  },
  chartRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingTop: 4,
  },
  chartEmptyText: {
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 16,
    lineHeight: 20,
  },
  barWrapper: {
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  barTrack: {
    width: 28,
    borderRadius: 6,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barFill: {
    width: "100%",
    borderRadius: 6,
  },
  barScore: {
    fontSize: 11,
    fontWeight: "600",
  },
  barDay: {
    fontSize: 11,
  },

  // Pillar trends
  pillarSection: {
    gap: 8,
  },
  pillarCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  pillarCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pillarName: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  pillarScore: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  pillarScoreMax: {
    fontSize: 13,
    fontWeight: "500",
  },
  pillarStatus: {
    fontSize: 14,
    marginTop: 3,
    fontWeight: "500",
  },
  trendBarsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
  },
  trendBar: {
    flex: 1,
    borderRadius: 2,
  },
  trendCaption: {
    fontSize: 10,
    marginTop: 4,
    letterSpacing: 0.3,
  },

  // Insight cards
  insightCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  insightBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 10,
  },
  insightLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  insightContent: {
    fontSize: 14,
    lineHeight: 22,
  },
  followUpBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    marginTop: 10,
  },
  followUpText: {
    flex: 1,
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 18,
  },

  // Insights empty
  insightsEmptyCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    alignItems: "center",
    gap: 10,
  },
  insightsEmptyText: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },

  // Full empty state
  emptyStateWrap: { alignItems: "center" },
  emptyStateHeading: { fontSize: 18, textAlign: "center", marginBottom: 10 },
  emptyStateBody: { fontSize: 14, textAlign: "center", lineHeight: 22 },
  emptyState: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 28,
    alignItems: "center",
    gap: 12,
  },
  emptyIconBox: {
    width: 60,
    height: 60,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
});
