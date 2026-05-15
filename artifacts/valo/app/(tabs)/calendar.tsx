import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useListCalendarEvents } from "@workspace/api-client-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const WEEK_DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatEventDate(dateStr: string): string {
  const parts = dateStr.split("-").map(Number);
  const d = new Date(parts[0]!, parts[1]! - 1, parts[2]!);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function typeBadgeColor(type: string | null | undefined): string {
  if (type === "goal-deadline") return "#C17B3F";
  if (type === "habit") return "#D97706";
  if (type === "personal") return "#7C3AED";
  return "#6B7280";
}

function typeBadgeLabel(type: string | null | undefined): string {
  if (type === "goal-deadline") return "Goal";
  if (type === "habit") return "Habit";
  if (type === "personal") return "Personal";
  return "Event";
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const today = new Date();

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const { data: events = [], isFetching, refetch } = useListCalendarEvents();

  const currentTodayStr = todayStr();

  const eventsByDate = useMemo(() => {
    const map: Record<string, typeof events> = {};
    for (const e of events) {
      if (!map[e.date]) map[e.date] = [];
      map[e.date]!.push(e);
    }
    return map;
  }, [events]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOffset = new Date(viewYear, viewMonth, 1).getDay();
  const calendarCells: (number | null)[] = [
    ...Array<null>(firstDayOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  const upcomingEvents = useMemo(
    () =>
      [...events]
        .filter((e) => e.date >= currentTodayStr)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [events, currentTodayStr],
  );

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isFetching}
          onRefresh={refetch}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.header}>
        <Text
          style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}
        >
          Calendar
        </Text>
      </View>

      {/* Month navigation */}
      <View style={[styles.monthNav, { borderColor: colors.border }]}>
        <TouchableOpacity onPress={prevMonth} style={styles.monthNavBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="chevron-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text
          style={[styles.monthTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}
        >
          {MONTH_NAMES[viewMonth]} {viewYear}
        </Text>
        <TouchableOpacity onPress={nextMonth} style={styles.monthNavBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="chevron-right" size={20} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* Day-of-week headers */}
      <View style={styles.weekRow}>
        {WEEK_DAYS.map((d, i) => (
          <Text
            key={i}
            style={[styles.weekDay, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}
          >
            {d}
          </Text>
        ))}
      </View>

      {/* Calendar grid */}
      <View style={[styles.grid, { borderColor: colors.border }]}>
        {calendarCells.map((day, i) => {
          if (!day) {
            return <View key={`empty-${i}`} style={styles.cell} />;
          }
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const hasEvents = (eventsByDate[dateStr]?.length ?? 0) > 0;
          const isToday = dateStr === currentTodayStr;
          return (
            <View key={dateStr} style={styles.cell}>
              <View
                style={[
                  styles.dayCircle,
                  isToday && { backgroundColor: colors.primary },
                ]}
              >
                <Text
                  style={[
                    styles.dayNum,
                    {
                      color: isToday ? colors.primaryForeground : colors.foreground,
                      fontFamily: isToday ? "Inter_600SemiBold" : "Inter_400Regular",
                    },
                  ]}
                >
                  {day}
                </Text>
              </View>
              {hasEvents && (
                <View style={[styles.dot, { backgroundColor: colors.primary }]} />
              )}
            </View>
          );
        })}
      </View>

      {/* Upcoming events */}
      <View style={styles.section}>
        <Text
          style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}
        >
          Upcoming
        </Text>

        {upcomingEvents.length === 0 ? (
          <View style={[styles.emptyState, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Feather name="calendar" size={28} color={colors.mutedForeground} />
            <Text
              style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
            >
              No upcoming events
            </Text>
          </View>
        ) : (
          upcomingEvents.map((event) => {
            const badgeColor = typeBadgeColor(event.type);
            return (
              <View
                key={event.id}
                style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={styles.eventTop}>
                  <Text
                    style={[styles.eventTitle, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}
                    numberOfLines={2}
                  >
                    {event.title}
                  </Text>
                  <View style={[styles.typeBadge, { backgroundColor: badgeColor + "22" }]}>
                    <Text
                      style={[styles.typeBadgeText, { color: badgeColor, fontFamily: "Inter_500Medium" }]}
                    >
                      {typeBadgeLabel(event.type)}
                    </Text>
                  </View>
                </View>
                <View style={styles.eventDateRow}>
                  <Feather name="calendar" size={12} color={colors.mutedForeground} />
                  <Text
                    style={[styles.eventDate, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
                  >
                    {formatEventDate(event.date)}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 40 },

  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    letterSpacing: -0.5,
  },

  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  monthNavBtn: {
    padding: 6,
  },
  monthTitle: {
    fontSize: 16,
  },

  weekRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  weekDay: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    letterSpacing: 0.4,
    paddingVertical: 4,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 28,
    overflow: "hidden",
  },
  cell: {
    width: `${100 / 7}%` as `${number}%`,
    alignItems: "center",
    paddingVertical: 4,
    gap: 2,
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  dayNum: {
    fontSize: 14,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },

  section: {
    paddingHorizontal: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 17,
    marginBottom: 2,
  },

  emptyState: {
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    paddingVertical: 36,
    alignItems: "center",
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
  },

  eventCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  eventTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  eventTitle: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    flexShrink: 0,
  },
  typeBadgeText: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
  eventDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  eventDate: {
    fontSize: 13,
  },
});
