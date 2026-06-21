import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import {
  useGetCatchUp,
  getGetCatchUpQueryKey,
  useRecordVerificationEvent,
  type CatchupItem,
  type CatchupCell,
} from "@workspace/api-client-react";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayLabel(iso: string): { dow: string; day: string } {
  const d = new Date(iso + "T00:00:00");
  return { dow: WEEKDAYS[d.getDay()] ?? "", day: String(d.getDate()) };
}

function itemKey(item: CatchupItem): string {
  return item.habitId != null ? `h:${item.habitId}` : `r:${item.routineId}`;
}

export default function CatchUpScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data, isLoading } = useGetCatchUp({
    query: { queryKey: getGetCatchUpQueryKey(), staleTime: 0 },
  });
  const { mutateAsync: recordEvent, isPending: saving } = useRecordVerificationEvent();

  // Which pending cell is currently expanded for a Done/Missed choice.
  const [active, setActive] = useState<{ key: string; date: string } | null>(null);

  const handleDone = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: getGetCatchUpQueryKey() });
    router.back();
  }, [queryClient, router]);

  async function handleRecord(item: CatchupItem, date: string, status: "done" | "missed") {
    setActive(null);
    try {
      await recordEvent({
        data: {
          habitId: item.habitId ?? undefined,
          routineId: item.routineId ?? undefined,
          date,
          status,
          provenance: "recalled",
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetCatchUpQueryKey() });
    } catch {
      // Leave the cell pending on failure; the user can retry.
    }
  }

  const topPad =
    (Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top) + 8;

  const items = data?.items ?? [];
  const actionable = items.filter(
    (it) => it.cadence !== "flexible" && it.cells.some((c) => c.status === "pending"),
  );
  const flexible = items.filter((it) => it.cadence === "flexible");

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Catch up
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: 16 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.intro, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          A few things from the last few days are unverified. Confirm what happened so your
          streaks and insights stay accurate.
        </Text>

        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          </View>
        ) : actionable.length === 0 && flexible.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="check-circle" size={22} color={colors.primary} />
            <Text style={[styles.emptyText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
              You're all caught up.
            </Text>
          </View>
        ) : (
          <>
            {actionable.map((item) => {
              const key = itemKey(item);
              return (
                <View
                  key={key}
                  style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <Text
                    style={[styles.itemName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <Text
                    style={[styles.itemMeta, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
                  >
                    {item.cadence === "routine" ? "Routine" : "Daily habit"}
                  </Text>
                  <View style={styles.cellRow}>
                    {item.cells.map((cell) => (
                      <CellPill
                        key={cell.date}
                        cell={cell}
                        colors={colors}
                        isActive={active?.key === key && active?.date === cell.date}
                        onPress={() =>
                          cell.status === "pending"
                            ? setActive((prev) =>
                                prev?.key === key && prev?.date === cell.date
                                  ? null
                                  : { key, date: cell.date },
                              )
                            : undefined
                        }
                      />
                    ))}
                  </View>
                  {active?.key === key && (
                    <View style={styles.actionRow}>
                      <Text
                        style={[styles.actionPrompt, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
                      >
                        {dayLabel(active.date).dow} {dayLabel(active.date).day}
                      </Text>
                      <View style={styles.actionBtns}>
                        <TouchableOpacity
                          disabled={saving}
                          onPress={() => handleRecord(item, active.date, "done")}
                          activeOpacity={0.8}
                          style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                        >
                          <Feather name="check" size={14} color={colors.primaryForeground} />
                          <Text
                            style={[styles.actionBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}
                          >
                            Did it
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          disabled={saving}
                          onPress={() => handleRecord(item, active.date, "missed")}
                          activeOpacity={0.8}
                          style={[styles.actionBtn, { backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1 }]}
                        >
                          <Feather name="x" size={14} color={colors.mutedForeground} />
                          <Text
                            style={[styles.actionBtnText, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}
                          >
                            Missed
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}

            {flexible.length > 0 && (
              <Text
                style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}
              >
                This week
              </Text>
            )}
            {flexible.map((item) => {
              const w = item.weekly;
              const done = w?.done ?? 0;
              const target = w?.target ?? 0;
              const met = target > 0 && done >= target;
              return (
                <View
                  key={itemKey(item)}
                  style={[styles.flexCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.itemName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    <Text
                      style={[styles.itemMeta, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
                    >
                      {done} of {target} run{target !== 1 ? "s" : ""} this week
                    </Text>
                  </View>
                  <Feather
                    name={met ? "check-circle" : "circle"}
                    size={20}
                    color={met ? colors.primary : colors.mutedForeground}
                  />
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Sticky Done button */}
      {!isLoading && (
        <View
          style={[
            styles.footer,
            { paddingBottom: insets.bottom + 12, borderTopColor: colors.border, backgroundColor: colors.background },
          ]}
        >
          <TouchableOpacity
            onPress={handleDone}
            activeOpacity={0.85}
            style={[styles.doneBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.doneBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
              Done
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function CellPill({
  cell,
  colors,
  isActive,
  onPress,
}: {
  cell: CatchupCell;
  colors: ReturnType<typeof useColors>;
  isActive: boolean;
  onPress: () => void;
}) {
  const { dow, day } = dayLabel(cell.date);
  let bg = colors.secondary;
  let fg = colors.mutedForeground;
  let icon: keyof typeof Feather.glyphMap | null = null;
  if (cell.status === "done") {
    bg = "#D8EBE3";
    fg = "#4A7D68";
    icon = "check";
  } else if (cell.status === "missed") {
    bg = "#F5DDD8";
    fg = "#A04040";
    icon = "x";
  }
  return (
    <TouchableOpacity
      disabled={cell.status !== "pending"}
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.cell,
        {
          backgroundColor: bg,
          borderColor: isActive ? colors.primary : "transparent",
          borderWidth: isActive ? 1.5 : 0,
        },
      ]}
    >
      <Text style={[styles.cellDow, { color: fg, fontFamily: "Inter_500Medium" }]}>{dow}</Text>
      {icon ? (
        <Feather name={icon} size={14} color={fg} />
      ) : (
        <Text style={[styles.cellDay, { color: fg, fontFamily: "Inter_600SemiBold" }]}>{day}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17 },
  scroll: { paddingHorizontal: 20, paddingTop: 16 },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  loadingRow: { paddingVertical: 40, alignItems: "center" },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 10,
  },
  emptyText: { fontSize: 15 },
  itemCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  itemName: { fontSize: 15, lineHeight: 20 },
  itemMeta: { fontSize: 12, marginTop: 2 },
  cellRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  cell: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    gap: 4,
  },
  cellDow: { fontSize: 10, letterSpacing: 0.4 },
  cellDay: { fontSize: 14 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },
  actionPrompt: { fontSize: 13 },
  actionBtns: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  actionBtnText: { fontSize: 13 },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 8,
    marginBottom: 10,
  },
  flexCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  doneBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  doneBtnText: { fontSize: 16 },
});
