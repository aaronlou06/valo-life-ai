import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
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
