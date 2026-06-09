import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQueries } from "@tanstack/react-query";
import {
  useListHabits,
  useListGoals,
  useGetStreakData,
  listHabitCompletions,
  getListHabitCompletionsQueryKey,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type Colors = ReturnType<typeof useColors>;

type RangeOption = "7d" | "1m" | "3m" | "6m";

const RANGE_OPTIONS: { key: RangeOption; label: string; days: number }[] = [
  { key: "7d", label: "7d", days: 7 },
  { key: "1m", label: "1m", days: 30 },
  { key: "3m", label: "3m", days: 90 },
  { key: "6m", label: "6m", days: 180 },
];

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getDatesInRange(days: number): string[] {
  const result: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    result.push(toISODate(d));
  }
  return result;
}

function RangeSwitcher({
  selected,
  onSelect,
  colors,
}: {
  selected: RangeOption;
  onSelect: (r: RangeOption) => void;
  colors: Colors;
}) {
  return (
    <View style={[switcherStyles.row, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
      {RANGE_OPTIONS.map((opt) => {
        const active = opt.key === selected;
        return (
          <TouchableOpacity
            key={opt.key}
            onPress={() => onSelect(opt.key)}
            activeOpacity={0.7}
            style={[
              switcherStyles.pill,
              active && { backgroundColor: colors.card },
            ]}
          >
            <Text
              style={[
                switcherStyles.pillText,
                { color: active ? colors.primary : colors.mutedForeground, fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular" },
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const switcherStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    alignSelf: "flex-start",
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pillText: {
    fontSize: 13,
  },
});

function StatCard({
  label,
  value,
  unit,
  colors,
}: {
  label: string;
  value: string | number;
  unit?: string;
  colors: Colors;
}) {
  return (
    <View style={[statStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[statStyles.value, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        {value}
        {unit ? <Text style={[statStyles.unit, { color: colors.mutedForeground }]}>{unit}</Text> : null}
      </Text>
      <Text style={[statStyles.label, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        {label}
      </Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    alignItems: "center",
    gap: 4,
    minWidth: 72,
  },
  value: {
    fontSize: 22,
    lineHeight: 26,
  },
  unit: {
    fontSize: 12,
  },
  label: {
    fontSize: 11,
    letterSpacing: 0.2,
    textAlign: "center",
  },
});

function HabitRow({
  habit,
  completedDates,
  rangeDates,
  colors,
}: {
  habit: { id: number; name: string; streak: number };
  completedDates: Set<string>;
  rangeDates: string[];
  colors: Colors;
}) {
  const total = rangeDates.length;
  const completed = rangeDates.filter((d) => completedDates.has(d)).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const displayDates = rangeDates.slice(-28);

  return (
    <View style={[habitRowStyles.row, { borderBottomColor: colors.border }]}>
      <View style={habitRowStyles.topLine}>
        <Text style={[habitRowStyles.name, { color: colors.foreground, fontFamily: "Inter_500Medium" }]} numberOfLines={1}>
          {habit.name}
        </Text>
        <View style={habitRowStyles.meta}>
          {habit.streak > 0 ? (
            <View style={habitRowStyles.streakBadge}>
              <Feather name="zap" size={11} color="#C17B3F" />
              <Text style={[habitRowStyles.streakText, { color: "#C17B3F", fontFamily: "Inter_600SemiBold" }]}>
                {habit.streak}
              </Text>
            </View>
          ) : null}
          <Text style={[habitRowStyles.pct, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
            {pct}%
          </Text>
        </View>
      </View>
      <View style={habitRowStyles.dots}>
        {displayDates.map((d) => {
          const done = completedDates.has(d);
          return (
            <View
              key={d}
              style={[
                habitRowStyles.dot,
                {
                  backgroundColor: done ? colors.primary : colors.secondary,
                  borderColor: done ? colors.primary : colors.border,
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const habitRowStyles = StyleSheet.create({
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  name: {
    fontSize: 14,
    flex: 1,
    marginRight: 12,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  streakText: {
    fontSize: 12,
  },
  pct: {
    fontSize: 13,
    minWidth: 36,
    textAlign: "right",
  },
  dots: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

function GoalRow({
  goal,
  colors,
}: {
  goal: { id: number; title: string; progressPercent: number; targetDate?: string | null };
  colors: Colors;
}) {
  return (
    <View style={[goalRowStyles.row, { borderBottomColor: colors.border }]}>
      <View style={goalRowStyles.header}>
        <Text style={[goalRowStyles.title, { color: colors.foreground, fontFamily: "Inter_500Medium" }]} numberOfLines={2}>
          {goal.title}
        </Text>
        <Text style={[goalRowStyles.pct, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
          {goal.progressPercent}%
        </Text>
      </View>
      <View style={[goalRowStyles.track, { backgroundColor: colors.secondary }]}>
        <View
          style={[
            goalRowStyles.fill,
            { backgroundColor: colors.primary, width: `${goal.progressPercent}%` },
          ]}
        />
      </View>
      {goal.targetDate ? (
        <Text style={[goalRowStyles.date, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Target: {new Date(goal.targetDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </Text>
      ) : null}
    </View>
  );
}

const goalRowStyles = StyleSheet.create({
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  pct: {
    fontSize: 16,
    minWidth: 40,
    textAlign: "right",
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
  date: {
    fontSize: 12,
  },
});

export default function ProgressScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState<RangeOption>("7d");

  const rangeDays = RANGE_OPTIONS.find((r) => r.key === range)!.days;
  const rangeDates = useMemo(() => getDatesInRange(rangeDays), [rangeDays]);

  const { data: habits = [], isLoading: habitsLoading } = useListHabits();
  const { data: goals = [], isLoading: goalsLoading } = useListGoals();
  const { data: streakData } = useGetStreakData();

  const completionQueries = useQueries({
    queries: rangeDates.map((date) => ({
      queryKey: getListHabitCompletionsQueryKey(date),
      queryFn: () => listHabitCompletions(date),
      staleTime: 5 * 60 * 1000,
    })),
  });

  const completionsByHabitId = useMemo<Map<number, Set<string>>>(() => {
    const map = new Map<number, Set<string>>();
    for (const q of completionQueries) {
      if (!q.data) continue;
      for (const c of q.data) {
        if (!map.has(c.habitId)) map.set(c.habitId, new Set());
        map.get(c.habitId)!.add(c.date);
      }
    }
    return map;
  }, [completionQueries]);

  const allDatesCompleted = useMemo<Set<string>>(() => {
    const s = new Set<string>();
    for (const q of completionQueries) {
      if (!q.data || q.data.length === 0) continue;
      s.add(rangeDates[completionQueries.indexOf(q)]!);
    }
    return s;
  }, [completionQueries, rangeDates]);

  const overallConsistency = useMemo(() => {
    if (habits.length === 0 || rangeDays === 0) return 0;
    let totalPossible = habits.length * rangeDays;
    let totalCompleted = 0;
    for (const h of habits) {
      const doneSet = completionsByHabitId.get(h.id) ?? new Set<string>();
      totalCompleted += rangeDates.filter((d) => doneSet.has(d)).length;
    }
    return totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;
  }, [habits, completionsByHabitId, rangeDates, rangeDays]);

  const activeStreaks = habits.filter((h) => h.streak > 0).length;
  const longestStreak = habits.reduce((max, h) => Math.max(max, h.streak), 0);
  const habitsCompletedToday = habits.filter((h) => h.completedToday).length;

  const consistencyNote = useMemo(() => {
    if (habits.length === 0) return null;
    let best: { name: string; pct: number } | null = null;
    for (const h of habits) {
      const doneSet = completionsByHabitId.get(h.id) ?? new Set<string>();
      const pct = rangeDays > 0 ? Math.round((rangeDates.filter((d) => doneSet.has(d)).length / rangeDays) * 100) : 0;
      if (!best || pct > best.pct) best = { name: h.name, pct };
    }
    if (!best || best.pct === 0) return null;
    return `${best.name} is your most consistent habit this period — ${best.pct}%`;
  }, [habits, completionsByHabitId, rangeDates, rangeDays]);

  const completionsLoading = completionQueries.some((q) => q.isLoading);
  const isLoading = habitsLoading || goalsLoading || completionsLoading;

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Progress
          </Text>
          <RangeSwitcher selected={range} onSelect={setRange} colors={colors} />
        </View>

        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            <View style={styles.statsRow}>
              <StatCard label="Consistency" value={`${overallConsistency}%`} colors={colors} />
              <StatCard label="Active Streaks" value={activeStreaks} colors={colors} />
              <StatCard label="Longest Streak" value={longestStreak} unit=" d" colors={colors} />
              <StatCard label="Done Today" value={`${habitsCompletedToday}/${habits.length}`} colors={colors} />
            </View>

            {habits.length > 0 ? (
              <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                  Habits
                </Text>
                {habits.map((h) => (
                  <HabitRow
                    key={h.id}
                    habit={h}
                    completedDates={completionsByHabitId.get(h.id) ?? new Set()}
                    rangeDates={rangeDates}
                    colors={colors}
                  />
                ))}
              </View>
            ) : null}

            {goals.length > 0 ? (
              <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                  Goals
                </Text>
                {goals.map((g) => (
                  <GoalRow key={g.id} goal={g} colors={colors} />
                ))}
              </View>
            ) : null}

            {habits.length === 0 && goals.length === 0 ? (
              <View style={[styles.emptyWrap, { borderColor: colors.border }]}>
                <Feather name="bar-chart-2" size={32} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  Add habits and goals on the Plan tab to start tracking your progress here.
                </Text>
              </View>
            ) : null}

            {consistencyNote ? (
              <View style={[styles.noteWrap, { borderColor: colors.border }]}>
                <Feather name="info" size={13} color={colors.mutedForeground} style={{ marginTop: 1 }} />
                <Text style={[styles.noteText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {consistencyNote}
                </Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 20,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
  },
  loadingWrap: {
    paddingTop: 60,
    alignItems: "center",
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  section: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    paddingTop: 14,
    paddingBottom: 4,
  },
  emptyWrap: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    padding: 32,
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  noteWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    marginTop: 4,
  },
  noteText: {
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
});
