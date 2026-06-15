import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  Platform,
  UIManager,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQueries } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import {
  useListHabits,
  listHabitCompletions,
  getListHabitCompletionsQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HABIT_ORDER_KEY = "@valo/habit-order-v1";
const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayISO(): string {
  return toISODate(new Date());
}

/** Returns Mon–Sun of the current week */
function getCurrentWeekDates(): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay(); // 0=Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toISODate(d);
  });
}

function getWeekLabel(dates: string[]): string {
  const first = new Date(dates[0]! + "T00:00:00");
  const last = new Date(dates[6]! + "T00:00:00");
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(first)} – ${fmt(last)}`;
}

/** Past N days including today, oldest first */
function getPastDates(n: number): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (n - 1 - i));
    return toISODate(d);
  });
}

function computeBestStreak(habitId: number, sortedDates: string[], completedSet: Set<string>): number {
  let best = 0, current = 0;
  for (const date of sortedDates) {
    if (completedSet.has(date)) {
      current++;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }
  return best;
}

function getMonthCompletions(completedSet: Set<string>): { completed: number; total: number } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  let completed = 0;
  for (let d = 1; d <= today; d++) {
    const s = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (completedSet.has(s)) completed++;
  }
  return { completed, total: today };
}

/** Returns 13 weeks (Mon–Sun groups) with completed count, newest last */
function getWeeklyBars(
  sortedDates: string[],
  completedSet: Set<string>,
): { label: string; count: number }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() + mondayOffset);

  return Array.from({ length: 13 }, (_, wi) => {
    const weekStart = new Date(thisMonday);
    weekStart.setDate(thisMonday.getDate() - (12 - wi) * 7);
    let count = 0;
    for (let d = 0; d < 7; d++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + d);
      if (completedSet.has(toISODate(day))) count++;
    }
    const label = `${MONTH_SHORT[weekStart.getMonth()]} ${weekStart.getDate()}`;
    return { label, count };
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type HabitItem = { id: number; name: string; streak: number; completedToday: boolean };
type Colors = ReturnType<typeof useColors>;

// ─── WeeklyGrid ───────────────────────────────────────────────────────────────

function WeeklyGrid({
  weekDates,
  todayStr,
  completedSet,
  colors,
}: {
  weekDates: string[];
  todayStr: string;
  completedSet: Set<string>;
  colors: Colors;
}) {
  return (
    <View style={gridStyles.wrapper}>
      <View style={gridStyles.labelRow}>
        {DAY_LABELS.map((l, i) => (
          <View key={i} style={gridStyles.cell}>
            <Text style={[gridStyles.dayLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              {l}
            </Text>
          </View>
        ))}
      </View>
      <View style={gridStyles.dotRow}>
        {weekDates.map((date, i) => {
          const done = completedSet.has(date);
          const isToday = date === todayStr;
          const isFuture = date > todayStr;
          return (
            <View key={i} style={gridStyles.cell}>
              <View
                style={[
                  gridStyles.dot,
                  done && { backgroundColor: colors.primary },
                  !done && !isFuture && { backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1 },
                  isFuture && { backgroundColor: colors.secondary, opacity: 0.4 },
                  isToday && !done && { borderColor: colors.primary, borderWidth: 1.5, backgroundColor: colors.secondary },
                ]}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const gridStyles = StyleSheet.create({
  wrapper: { gap: 4 },
  labelRow: { flexDirection: "row" },
  dotRow: { flexDirection: "row" },
  cell: { flex: 1, alignItems: "center", justifyContent: "center" },
  dayLabel: { fontSize: 9, letterSpacing: 0.3 },
  dot: { width: 18, height: 18, borderRadius: 5 },
});

// ─── ThirtyDayGrid ────────────────────────────────────────────────────────────

function ThirtyDayGrid({
  past30,
  todayStr,
  completedSet,
  colors,
}: {
  past30: string[];
  todayStr: string;
  completedSet: Set<string>;
  colors: Colors;
}) {
  const rows = 5;
  const cols = 6;
  return (
    <View style={monthGridStyles.grid}>
      {Array.from({ length: rows }, (_, row) =>
        Array.from({ length: cols }, (_, col) => {
          const idx = row * cols + col;
          const date = past30[idx];
          if (!date) return <View key={`${row}-${col}`} style={monthGridStyles.cell} />;
          const done = completedSet.has(date);
          const isToday = date === todayStr;
          return (
            <View
              key={`${row}-${col}`}
              style={[
                monthGridStyles.cell,
                done && { backgroundColor: colors.primary },
                !done && { backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
                isToday && !done && { borderColor: colors.primary, borderWidth: 1.5 },
              ]}
            />
          );
        })
      )}
    </View>
  );
}

const monthGridStyles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
  },
  cell: {
    width: 22,
    height: 22,
    borderRadius: 5,
  },
});

// ─── WeeklyBars ───────────────────────────────────────────────────────────────

function WeeklyBars({
  bars,
  colors,
}: {
  bars: { label: string; count: number }[];
  colors: Colors;
}) {
  const maxH = 36;
  return (
    <View style={barStyles.wrapper}>
      {bars.map((bar, i) => {
        const isLast = i === bars.length - 1;
        const height = bar.count > 0 ? Math.max(4, Math.round((bar.count / 7) * maxH)) : 3;
        return (
          <View key={i} style={barStyles.barCol}>
            <View
              style={[
                barStyles.bar,
                { height, backgroundColor: isLast ? colors.primary : colors.primary + "60" },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

const barStyles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 44,
    gap: 3,
    marginTop: 4,
  },
  barCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  bar: {
    width: "90%",
    borderRadius: 3,
  },
});

// ─── HabitCard ────────────────────────────────────────────────────────────────

function HabitCard({
  habit,
  completedSet,
  past30,
  past90Sorted,
  weekDates,
  todayStr,
  isExpanded,
  onToggle,
  drag,
  isActive,
  colors,
}: {
  habit: HabitItem;
  completedSet: Set<string>;
  past30: string[];
  past90Sorted: string[];
  weekDates: string[];
  todayStr: string;
  isExpanded: boolean;
  onToggle: () => void;
  drag: () => void;
  isActive: boolean;
  colors: Colors;
}) {
  const monthStats = useMemo(() => getMonthCompletions(completedSet), [completedSet]);
  const bestStreak = useMemo(
    () => computeBestStreak(habit.id, past90Sorted, completedSet),
    [habit.id, past90Sorted, completedSet]
  );
  const weeklyBars = useMemo(
    () => getWeeklyBars(past90Sorted, completedSet),
    [past90Sorted, completedSet]
  );

  return (
    <View
      style={[
        cardStyles.card,
        { backgroundColor: colors.card, borderColor: isActive ? colors.primary : colors.border },
      ]}
    >
      {/* Main row: handle + name + grid */}
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.75}
        style={cardStyles.mainRow}
      >
        <TouchableOpacity
          onLongPress={drag}
          delayLongPress={200}
          activeOpacity={0.5}
          style={cardStyles.handle}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="menu" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>

        <View style={cardStyles.nameWrap}>
          <Text
            style={[cardStyles.habitName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}
            numberOfLines={1}
          >
            {habit.name}
          </Text>
          {habit.streak > 0 ? (
            <View style={cardStyles.streakBadge}>
              <Feather name="zap" size={10} color={colors.primary} />
              <Text style={[cardStyles.streakText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                {habit.streak}d
              </Text>
            </View>
          ) : null}
        </View>

        <View style={cardStyles.gridWrap}>
          <WeeklyGrid
            weekDates={weekDates}
            todayStr={todayStr}
            completedSet={completedSet}
            colors={colors}
          />
        </View>

        <Feather
          name={isExpanded ? "chevron-up" : "chevron-down"}
          size={14}
          color={colors.mutedForeground}
          style={{ marginLeft: 6 }}
        />
      </TouchableOpacity>

      {/* Expanded section */}
      {isExpanded ? (
        <View style={[cardStyles.expanded, { borderTopColor: colors.border }]}>
          {/* 30-day grid */}
          <View style={cardStyles.expandSection}>
            <Text style={[cardStyles.expandLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
              LAST 30 DAYS
            </Text>
            <ThirtyDayGrid
              past30={past30}
              todayStr={todayStr}
              completedSet={completedSet}
              colors={colors}
            />
          </View>

          {/* 3-month bar chart */}
          <View style={cardStyles.expandSection}>
            <Text style={[cardStyles.expandLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
              3 MONTHS (WEEKLY)
            </Text>
            <WeeklyBars bars={weeklyBars} colors={colors} />
          </View>

          {/* Stats row */}
          <View style={[cardStyles.statsRow, { borderTopColor: colors.border }]}>
            <View style={cardStyles.statItem}>
              <Text style={[cardStyles.statValue, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                {habit.streak}
              </Text>
              <Text style={[cardStyles.statLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                current streak
              </Text>
            </View>
            <View style={[cardStyles.statDivider, { backgroundColor: colors.border }]} />
            <View style={cardStyles.statItem}>
              <Text style={[cardStyles.statValue, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                {bestStreak}
              </Text>
              <Text style={[cardStyles.statLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                best streak (90d)
              </Text>
            </View>
            <View style={[cardStyles.statDivider, { backgroundColor: colors.border }]} />
            <View style={cardStyles.statItem}>
              <Text style={[cardStyles.statValue, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
                {monthStats.completed}/{monthStats.total}
              </Text>
              <Text style={[cardStyles.statLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                this month
              </Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginBottom: 10,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingRight: 12,
  },
  handle: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  nameWrap: {
    flex: 1,
    marginRight: 12,
    gap: 3,
  },
  habitName: {
    fontSize: 14,
    lineHeight: 18,
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  streakText: {
    fontSize: 11,
  },
  gridWrap: {
    width: 148,
  },
  expanded: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  expandSection: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  expandLabel: {
    fontSize: 10,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  statsRow: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    marginHorizontal: 14,
    marginTop: 8,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    fontSize: 18,
    lineHeight: 22,
  },
  statLabel: {
    fontSize: 10,
    textAlign: "center",
    lineHeight: 14,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 36,
    alignSelf: "center",
  },
});

// ─── Workout types ────────────────────────────────────────────────────────────

type WSession = { id: number; date: string; name: string; durationSec: number | null };
type VolumeWeek = { label: string; sessions: number; sets: number; tonnageKg: number };
type WorkoutPR = {
  id: number;
  exerciseId: number | null;
  exerciseName: string | null;
  metricType: string;
  value: number | null;
  weightKg: number | null;
  reps: number | null;
  achievedAt: string | null;
};
type RecentExercise = { exerciseId: number; exerciseName: string | null; lastDate: string };
type ExerciseSetLog = {
  id: number;
  sessionDate: string;
  sessionName: string;
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null;
  isPersonalBest: boolean | null;
};

// ─── Workout helpers ──────────────────────────────────────────────────────────

function computeWorkoutStreak(sessions: WSession[]): number {
  if (sessions.length === 0) return 0;
  const dateSet = new Set(sessions.map((s) => s.date));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOffset = dateSet.has(toISODate(today)) ? 0 : 1;
  let streak = 0;
  for (let i = startOffset; i <= 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (dateSet.has(toISODate(d))) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

function formatKg(kg: number): string {
  return kg >= 1000 ? `${(kg / 1000).toFixed(1)}t` : `${Math.round(kg)}kg`;
}

function shortDate(iso: string): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── WorkoutVolumeBars ────────────────────────────────────────────────────────

function WorkoutVolumeBars({ volume, colors }: { volume: VolumeWeek[]; colors: Colors }) {
  const maxTonnage = Math.max(...volume.map((w) => w.tonnageKg), 1);
  const maxH = 36;

  if (volume.length === 0) {
    return (
      <View style={wStyles.emptyBar}>
        <Text style={[wStyles.emptyBarText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          No data yet
        </Text>
      </View>
    );
  }

  return (
    <View style={barStyles.wrapper}>
      {volume.map((week, i) => {
        const isLast = i === volume.length - 1;
        const height =
          week.tonnageKg > 0 ? Math.max(4, Math.round((week.tonnageKg / maxTonnage) * maxH)) : 3;
        return (
          <View key={week.label} style={barStyles.barCol}>
            <View
              style={[
                barStyles.bar,
                {
                  height,
                  backgroundColor: isLast ? colors.primary : colors.primary + "60",
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

// ─── WorkoutProgressionModal ──────────────────────────────────────────────────

function WorkoutProgressionModal({
  exercise,
  onClose,
  colors,
}: {
  exercise: { id: number; name: string } | null;
  onClose: () => void;
  colors: Colors;
}) {
  const [history, setHistory] = useState<ExerciseSetLog[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [windowSize, setWindowSize] = useState(20);

  useEffect(() => {
    if (!exercise) return;
    void loadHistory(exercise.id, windowSize);
  }, [exercise, windowSize]);

  async function loadHistory(id: number, limit: number) {
    setHistLoading(true);
    try {
      const data = await customFetch<ExerciseSetLog[]>(
        `/api/workout/exercises/${id}/history?limit=${limit}`,
      );
      setHistory(data);
    } catch {
      // ignore
    } finally {
      setHistLoading(false);
    }
  }

  const sessionPoints = useMemo(() => {
    const byDate = new Map<
      string,
      { date: string; maxWeight: number; maxReps: number; isPR: boolean }
    >();
    for (const set of history) {
      const existing = byDate.get(set.sessionDate);
      const weight = set.weightKg ?? 0;
      const reps = set.reps ?? 0;
      if (!existing || weight > existing.maxWeight) {
        byDate.set(set.sessionDate, {
          date: set.sessionDate,
          maxWeight: weight,
          maxReps: reps,
          isPR: !!set.isPersonalBest,
        });
      } else if (set.isPersonalBest && existing) {
        existing.isPR = true;
      }
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [history]);

  const maxWeight = Math.max(...sessionPoints.map((p) => p.maxWeight), 1);
  const chartH = 60;

  return (
    <Modal
      visible={!!exercise}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[wModal.root, { backgroundColor: colors.background }]}>
        <View style={[wModal.header, { borderBottomColor: colors.border }]}>
          <Text
            style={[wModal.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}
            numberOfLines={1}
          >
            {exercise?.name ?? ""}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={wModal.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={wModal.windowRow}>
            {([10, 20, 50] as const).map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => setWindowSize(n)}
                activeOpacity={0.75}
                style={[
                  wModal.windowBtn,
                  {
                    backgroundColor: windowSize === n ? colors.primary : colors.secondary,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    wModal.windowBtnText,
                    {
                      color: windowSize === n ? colors.primaryForeground : colors.foreground,
                      fontFamily: "Inter_500Medium",
                    },
                  ]}
                >
                  Last {n}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {histLoading ? (
            <View style={wModal.centerWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : sessionPoints.length === 0 ? (
            <View style={wModal.centerWrap}>
              <Text
                style={[wModal.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
              >
                No history logged yet.
              </Text>
            </View>
          ) : (
            <>
              <View style={[wModal.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text
                  style={[wModal.chartLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}
                >
                  BEST SET WEIGHT PER SESSION
                </Text>
                <View style={{ height: chartH, justifyContent: "flex-end" }}>
                  <View style={[wModal.chartBars, { height: chartH }]}>
                    {sessionPoints.map((pt, i) => {
                      const height =
                        pt.maxWeight > 0
                          ? Math.max(4, Math.round((pt.maxWeight / maxWeight) * chartH))
                          : 3;
                      const isLatest = i === sessionPoints.length - 1;
                      return (
                        <View key={pt.date} style={wModal.barCol}>
                          <View
                            style={[
                              wModal.bar,
                              {
                                height,
                                backgroundColor: pt.isPR
                                  ? "#C17B3F"
                                  : isLatest
                                  ? colors.primary
                                  : colors.primary + "55",
                              },
                            ]}
                          />
                        </View>
                      );
                    })}
                  </View>
                </View>
                <View style={wModal.chartMeta}>
                  <Text
                    style={[wModal.chartMetaText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
                  >
                    {shortDate(sessionPoints[0]!.date)}
                  </Text>
                  <Text
                    style={[wModal.chartMetaText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
                  >
                    {shortDate(sessionPoints[sessionPoints.length - 1]!.date)}
                  </Text>
                </View>
                <View style={wModal.legendRow}>
                  <View style={[wModal.legendDot, { backgroundColor: "#C17B3F" }]} />
                  <Text
                    style={[wModal.legendText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
                  >
                    Personal record
                  </Text>
                </View>
              </View>

              <View style={[wModal.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text
                  style={[wModal.chartLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}
                >
                  SESSIONS
                </Text>
                {[...sessionPoints].reverse().map((pt, i) => (
                  <View
                    key={pt.date}
                    style={[
                      wModal.sessionRow,
                      { borderBottomColor: colors.border },
                      i === sessionPoints.length - 1 && { borderBottomWidth: 0, paddingBottom: 0 },
                    ]}
                  >
                    <Text
                      style={[wModal.sessionDate, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}
                    >
                      {shortDate(pt.date)}
                    </Text>
                    <Text
                      style={[
                        wModal.sessionWeight,
                        {
                          color: pt.isPR ? colors.primary : colors.foreground,
                          fontFamily: pt.isPR ? "Inter_700Bold" : "Inter_500Medium",
                        },
                      ]}
                    >
                      {pt.maxWeight > 0 ? `${pt.maxWeight}kg` : "—"}
                      {pt.maxReps > 0 ? ` × ${pt.maxReps}` : ""}
                      {pt.isPR ? "  PR" : ""}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const wModal = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 18, flex: 1, marginRight: 12 },
  content: { padding: 16, gap: 14, paddingBottom: 60 },
  windowRow: { flexDirection: "row", gap: 8 },
  windowBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  windowBtnText: { fontSize: 13 },
  centerWrap: { paddingVertical: 48, alignItems: "center" },
  emptyText: { fontSize: 14 },
  chartCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
  },
  chartLabel: { fontSize: 10, letterSpacing: 0.8 },
  chartBars: { flexDirection: "row", alignItems: "flex-end", gap: 3 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  bar: { width: "80%", borderRadius: 3 },
  chartMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  chartMetaText: { fontSize: 10 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11 },
  listCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sessionDate: { fontSize: 14 },
  sessionWeight: { fontSize: 14 },
});

// ─── WorkoutsSection ──────────────────────────────────────────────────────────

function WorkoutsSection({ colors }: { colors: Colors }) {
  const [sessions, setSessions] = useState<WSession[]>([]);
  const [volume, setVolume] = useState<VolumeWeek[]>([]);
  const [prs, setPrs] = useState<WorkoutPR[]>([]);
  const [recentExercises, setRecentExercises] = useState<RecentExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExercise, setSelectedExercise] = useState<{ id: number; name: string } | null>(
    null,
  );

  const todayStr = useMemo(() => todayISO(), []);
  const weekDates = useMemo(() => getCurrentWeekDates(), []);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [s, v, p, re] = await Promise.all([
        customFetch<WSession[]>("/api/workout/sessions?status=completed&limit=60"),
        customFetch<VolumeWeek[]>("/api/workout/volume?weeks=13"),
        customFetch<WorkoutPR[]>("/api/workout/prs?limit=6"),
        customFetch<RecentExercise[]>("/api/workout/recent-exercises?limit=10"),
      ]);
      setSessions(s);
      setVolume(v);
      setPrs(p);
      setRecentExercises(re);
    } catch {
      // fail silently — section just stays in "loading" never resolved; user sees nothing
    } finally {
      setLoading(false);
    }
  }

  const sessionDates = useMemo(() => new Set(sessions.map((s) => s.date)), [sessions]);
  const thisWeekCount = useMemo(
    () => weekDates.filter((d) => sessionDates.has(d)).length,
    [weekDates, sessionDates],
  );
  const streak = useMemo(() => computeWorkoutStreak(sessions), [sessions]);

  const thisWeek = volume[volume.length - 1];
  const lastWeek = volume[volume.length - 2];
  const thisWeekTonnage = thisWeek?.tonnageKg ?? 0;
  const lastWeekTonnage = lastWeek?.tonnageKg ?? 0;
  const volumeDeltaPct =
    lastWeekTonnage > 0
      ? Math.round(((thisWeekTonnage - lastWeekTonnage) / lastWeekTonnage) * 100)
      : null;

  const noWorkouts = !loading && sessions.length === 0;

  return (
    <View style={wStyles.section}>
      <View style={wStyles.sectionHeader}>
        <View style={[wStyles.sectionDivider, { backgroundColor: colors.border }]} />
        <Feather name="activity" size={12} color={colors.mutedForeground} />
        <Text
          style={[wStyles.sectionTitle, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}
        >
          WORKOUTS
        </Text>
        <View style={[wStyles.sectionDivider, { backgroundColor: colors.border }]} />
      </View>

      {loading ? (
        <View style={wStyles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : noWorkouts ? (
        <View style={[wStyles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="activity" size={28} color={colors.mutedForeground} />
          <Text
            style={[wStyles.emptyTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}
          >
            No workouts yet
          </Text>
          <Text
            style={[wStyles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
          >
            Complete a workout session to see your progress here.
          </Text>
        </View>
      ) : (
        <>
          {/* Summary strip */}
          <View
            style={[wStyles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={wStyles.summaryItem}>
              <Text
                style={[wStyles.summaryValue, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}
              >
                {thisWeekCount}
              </Text>
              <Text
                style={[wStyles.summaryLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
              >
                this week
              </Text>
            </View>
            <View style={[wStyles.summaryDivider, { backgroundColor: colors.border }]} />
            <View style={wStyles.summaryItem}>
              <Text
                style={[wStyles.summaryValue, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}
              >
                {streak > 0 ? `${streak}d` : "0"}
              </Text>
              <Text
                style={[wStyles.summaryLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
              >
                streak
              </Text>
            </View>
            <View style={[wStyles.summaryDivider, { backgroundColor: colors.border }]} />
            <View style={wStyles.summaryItem}>
              <Text
                style={[
                  wStyles.summaryValue,
                  {
                    color: thisWeekTonnage > 0 ? colors.foreground : colors.mutedForeground,
                    fontFamily: "Inter_700Bold",
                  },
                ]}
              >
                {thisWeekTonnage > 0 ? formatKg(thisWeekTonnage) : "—"}
              </Text>
              <Text
                style={[wStyles.summaryLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
              >
                {volumeDeltaPct !== null
                  ? `${volumeDeltaPct >= 0 ? "+" : ""}${volumeDeltaPct}% vs last wk`
                  : "volume this wk"}
              </Text>
            </View>
          </View>

          {/* Workout-day consistency grid */}
          <View
            style={[wStyles.innerCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text
              style={[wStyles.cardLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}
            >
              THIS WEEK
            </Text>
            <WeeklyGrid
              weekDates={weekDates}
              todayStr={todayStr}
              completedSet={sessionDates}
              colors={colors}
            />
          </View>

          {/* Volume trend chart */}
          {volume.length > 0 && (
            <View
              style={[wStyles.innerCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Text
                style={[wStyles.cardLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}
              >
                VOLUME — LAST 13 WEEKS (KG LIFTED)
              </Text>
              <WorkoutVolumeBars volume={volume} colors={colors} />
            </View>
          )}

          {/* Personal records */}
          {prs.length > 0 && (
            <View>
              <Text
                style={[
                  wStyles.listLabel,
                  { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" },
                ]}
              >
                PERSONAL RECORDS
              </Text>
              {prs.map((pr) => (
                <TouchableOpacity
                  key={pr.id}
                  onPress={() =>
                    pr.exerciseId
                      ? setSelectedExercise({ id: pr.exerciseId, name: pr.exerciseName ?? "Exercise" })
                      : null
                  }
                  activeOpacity={pr.exerciseId ? 0.75 : 1}
                  style={[wStyles.prCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={[wStyles.prIcon, { backgroundColor: "#F5EBE0" }]}>
                    <Feather name="award" size={16} color="#C17B3F" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[wStyles.prName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}
                      numberOfLines={1}
                    >
                      {pr.exerciseName ?? "Exercise"}
                    </Text>
                    <Text
                      style={[wStyles.prDetail, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
                    >
                      {pr.metricType === "1rm_kg"
                        ? `${pr.weightKg}kg × ${pr.reps} rep${(pr.reps ?? 1) !== 1 ? "s" : ""}`
                        : pr.metricType === "duration_sec"
                        ? `${Math.round((pr.value ?? 0) / 60)}m duration`
                        : `${pr.value} ${pr.metricType}`}
                      {pr.achievedAt ? ` · ${shortDate(pr.achievedAt)}` : ""}
                    </Text>
                  </View>
                  {pr.exerciseId ? (
                    <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Recently trained exercises */}
          {recentExercises.length > 0 && (
            <View>
              <Text
                style={[
                  wStyles.listLabel,
                  { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" },
                ]}
              >
                RECENT EXERCISES
              </Text>
              <View
                style={[wStyles.exerciseList, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                {recentExercises.map((ex, i) => (
                  <TouchableOpacity
                    key={ex.exerciseId}
                    onPress={() =>
                      setSelectedExercise({ id: ex.exerciseId, name: ex.exerciseName ?? "Exercise" })
                    }
                    activeOpacity={0.75}
                    style={[
                      wStyles.exerciseRow,
                      { borderBottomColor: colors.border },
                      i === recentExercises.length - 1 && { borderBottomWidth: 0 },
                    ]}
                  >
                    <Text
                      style={[wStyles.exerciseName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}
                      numberOfLines={1}
                    >
                      {ex.exerciseName ?? "Exercise"}
                    </Text>
                    <Text
                      style={[wStyles.exerciseDate, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
                    >
                      {shortDate(ex.lastDate)}
                    </Text>
                    <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </>
      )}

      <WorkoutProgressionModal
        exercise={selectedExercise}
        onClose={() => setSelectedExercise(null)}
        colors={colors}
      />
    </View>
  );
}

const wStyles = StyleSheet.create({
  section: { paddingTop: 8, paddingBottom: 8, gap: 12 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 4,
    marginTop: 16,
  },
  sectionDivider: { flex: 1, height: StyleSheet.hairlineWidth },
  sectionTitle: { fontSize: 11, letterSpacing: 0.8 },
  loadingWrap: { paddingVertical: 32, alignItems: "center" },
  emptyCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  emptyTitle: { fontSize: 15 },
  emptyText: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  summaryCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    paddingVertical: 16,
  },
  summaryItem: { flex: 1, alignItems: "center", gap: 3 },
  summaryValue: { fontSize: 20, lineHeight: 24 },
  summaryLabel: { fontSize: 10, textAlign: "center", lineHeight: 14 },
  summaryDivider: { width: StyleSheet.hairlineWidth, height: 36, alignSelf: "center" },
  innerCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
  },
  cardLabel: { fontSize: 10, letterSpacing: 0.8 },
  emptyBar: { height: 44, alignItems: "center", justifyContent: "center" },
  emptyBarText: { fontSize: 12 },
  listLabel: {
    fontSize: 10,
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  prCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  prIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  prName: { fontSize: 14, lineHeight: 18 },
  prDetail: { fontSize: 12, marginTop: 2 },
  exerciseList: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  exerciseRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  exerciseName: { flex: 1, fontSize: 14 },
  exerciseDate: { fontSize: 12 },
});

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ colors }: { colors: Colors }) {
  return (
    <View style={emptyStyles.wrap}>
      <Feather name="check-circle" size={36} color={colors.mutedForeground} />
      <Text style={[emptyStyles.title, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
        No habits yet
      </Text>
      <Text style={[emptyStyles.sub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        Add habits on the Plan tab to start tracking your consistency here.
      </Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  wrap: {
    paddingTop: 80,
    paddingHorizontal: 40,
    alignItems: "center",
    gap: 12,
  },
  title: { fontSize: 17, marginTop: 4 },
  sub: { fontSize: 14, lineHeight: 20, textAlign: "center" },
});

// ─── ProgressScreen ───────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data: fetchedHabits = [], isLoading: habitsLoading } = useListHabits();
  const [orderedHabits, setOrderedHabits] = useState<HabitItem[]>([]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [orderLoaded, setOrderLoaded] = useState(false);

  const weekDates = useMemo(() => getCurrentWeekDates(), []);
  const weekLabel = useMemo(() => getWeekLabel(weekDates), [weekDates]);
  const todayStr = useMemo(() => todayISO(), []);
  const past30 = useMemo(() => getPastDates(30), []);
  const past90 = useMemo(() => getPastDates(90), []);

  // Fetch completions for past 90 days
  const completionQueries = useQueries({
    queries: past90.map((date) => ({
      queryKey: getListHabitCompletionsQueryKey(date),
      queryFn: () => listHabitCompletions(date),
      staleTime: 5 * 60 * 1000,
    })),
  });

  // completedSet per habit: habitId -> Set<date>
  const completionsByHabitId = useMemo<Map<number, Set<string>>>(() => {
    const map = new Map<number, Set<string>>();
    for (const q of completionQueries) {
      if (!q.data) continue;
      for (const c of q.data) {
        if (!map.has(c.habitId)) map.set(c.habitId, new Set());
        map.get(c.habitId)!.add(c.completionDate);
      }
    }
    return map;
  }, [completionQueries]);

  // Load persisted order, apply to fetched habits
  useEffect(() => {
    if (!fetchedHabits.length) return;

    AsyncStorage.getItem(HABIT_ORDER_KEY)
      .then((raw) => {
        const savedIds: number[] = raw ? (JSON.parse(raw) as number[]) : [];
        if (savedIds.length === 0) {
          setOrderedHabits(fetchedHabits as HabitItem[]);
          setOrderLoaded(true);
          return;
        }
        // Apply saved order, append any new habits at the end
        const idSet = new Set(savedIds);
        const sorted = [
          ...savedIds
            .map((id) => (fetchedHabits as HabitItem[]).find((h) => h.id === id))
            .filter((h): h is HabitItem => !!h),
          ...(fetchedHabits as HabitItem[]).filter((h) => !idSet.has(h.id)),
        ];
        setOrderedHabits(sorted);
        setOrderLoaded(true);
      })
      .catch(() => {
        setOrderedHabits(fetchedHabits as HabitItem[]);
        setOrderLoaded(true);
      });
  }, [fetchedHabits]);

  const handleReorder = useCallback(({ data }: { data: HabitItem[] }) => {
    setOrderedHabits(data);
    AsyncStorage.setItem(HABIT_ORDER_KEY, JSON.stringify(data.map((h) => h.id))).catch(() => {});
  }, []);

  const toggleExpand = useCallback((id: number) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<HabitItem>) => (
      <ScaleDecorator activeScale={0.97}>
        <HabitCard
          habit={item}
          completedSet={completionsByHabitId.get(item.id) ?? new Set()}
          past30={past30}
          past90Sorted={past90}
          weekDates={weekDates}
          todayStr={todayStr}
          isExpanded={!!expanded[item.id]}
          onToggle={() => toggleExpand(item.id)}
          drag={drag}
          isActive={isActive}
          colors={colors}
        />
      </ScaleDecorator>
    ),
    [completionsByHabitId, past30, past90, weekDates, todayStr, expanded, toggleExpand, colors]
  );

  const isLoading = habitsLoading || !orderLoaded;

  const ListHeader = useMemo(
    () => (
      <View style={[headerStyles.wrap, { paddingTop: (Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top) + 20 }]}>
        <Text style={[headerStyles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Progress
        </Text>
        <View style={headerStyles.weekRow}>
          <Feather name="calendar" size={13} color={colors.mutedForeground} />
          <Text style={[headerStyles.weekLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            {weekLabel}
          </Text>
        </View>
        <View style={[headerStyles.colHints, { marginTop: 16, paddingHorizontal: 16 }]}>
          <Text style={[headerStyles.hint, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Hold  ≡  to reorder  •  Tap card to expand
          </Text>
        </View>
      </View>
    ),
    [insets.top, weekLabel, colors]
  );

  const ListEmpty = useMemo(
    () =>
      isLoading ? (
        <View style={{ paddingTop: 60, alignItems: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <EmptyState colors={colors} />
      ),
    [isLoading, colors]
  );

  return (
    <View style={[screenStyles.safe, { backgroundColor: colors.background }]}>
      <DraggableFlatList
        data={orderedHabits}
        onDragEnd={handleReorder}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        ListFooterComponent={<WorkoutsSection colors={colors} />}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        activationDistance={5}
      />
    </View>
  );
}

const screenStyles = StyleSheet.create({
  safe: { flex: 1 },
});

const headerStyles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    marginBottom: 6,
  },
  weekRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  weekLabel: {
    fontSize: 14,
  },
  colHints: {
    paddingVertical: 8,
  },
  hint: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
});
