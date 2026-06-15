import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type WorkoutProgram = {
  id: number;
  name: string;
  totalWeeks: number;
  notes: string | null;
  startDate: string | null;
  createdAt: string;
};

function formatStartDate(d: string): string {
  const parts = d.split("-").map(Number);
  const date = new Date(parts[0]!, (parts[1] ?? 1) - 1, parts[2]);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CopilotProgramsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [programs, setPrograms] = useState<WorkoutProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [attaching, setAttaching] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadPrograms();
    }, []),
  );

  async function loadPrograms() {
    setLoading(true);
    try {
      const data = await customFetch<WorkoutProgram[]>("/api/workout/programs");
      setPrograms(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  function openMenu(p: WorkoutProgram) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const isAttached = Boolean(p.startDate);
    Alert.alert(p.name, undefined, [
      {
        text: "Edit schedule",
        onPress: () =>
          router.push({
            pathname: "/copilot-program-edit" as never,
            params: { id: String(p.id), name: p.name, totalWeeks: String(p.totalWeeks), notes: p.notes ?? "" },
          }),
      },
      isAttached
        ? {
            text: "Detach from calendar",
            onPress: () => handleDetach(p),
          }
        : {
            text: "Attach to calendar",
            onPress: () => handleAttach(p),
          },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => confirmDelete(p),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function handleAttach(p: WorkoutProgram) {
    setAttaching(p.id);
    try {
      const today = new Date().toISOString().split("T")[0]!;
      const updated = await customFetch<WorkoutProgram>(`/api/workout/programs/${p.id}/attach`, {
        method: "POST",
        body: JSON.stringify({ startDate: today }),
      });
      setPrograms((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
    } catch {
      Alert.alert("Could not attach", "Save the schedule first, then try again.");
    } finally {
      setAttaching(null);
    }
  }

  async function handleDetach(p: WorkoutProgram) {
    setAttaching(p.id);
    try {
      const updated = await customFetch<WorkoutProgram>(`/api/workout/programs/${p.id}/attach`, {
        method: "DELETE",
      });
      setPrograms((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
    } catch {
      Alert.alert("Could not detach", "Please try again.");
    } finally {
      setAttaching(null);
    }
  }

  function confirmDelete(p: WorkoutProgram) {
    Alert.alert("Delete program", `Delete "${p.name}"? Attached calendar workouts will also be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await customFetch(`/api/workout/programs/${p.id}`, { method: "DELETE" });
            setPrograms((prev) => prev.filter((x) => x.id !== p.id));
          } catch {
            Alert.alert("Failed", "Could not delete the program.");
          }
        },
      },
    ]);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Programs
        </Text>
        <TouchableOpacity
          onPress={() =>
            router.push({ pathname: "/copilot-program-edit" as never, params: { id: "", name: "", totalWeeks: "4", notes: "" } })
          }
          hitSlop={10}
          style={styles.addBtn}
        >
          <Feather name="plus" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : programs.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Feather name="calendar" size={28} color={colors.mutedForeground} style={{ marginBottom: 10 }} />
            <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              No programs yet
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Tap + to build a multi-week training program and attach it to your calendar.
            </Text>
            <TouchableOpacity
              onPress={() =>
                router.push({ pathname: "/copilot-program-edit" as never, params: { id: "", name: "", totalWeeks: "4", notes: "" } })
              }
              style={[styles.createBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.createBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                Create program
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          programs.map((p) => {
            const isAttached = Boolean(p.startDate);
            return (
              <View key={p.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={styles.cardMain}
                  onPress={() =>
                    router.push({
                      pathname: "/copilot-program-edit" as never,
                      params: { id: String(p.id), name: p.name, totalWeeks: String(p.totalWeeks), notes: p.notes ?? "" },
                    })
                  }
                  activeOpacity={0.8}
                >
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={[styles.cardName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <View style={styles.cardMeta}>
                      <View style={[styles.metaBadge, { backgroundColor: colors.secondary }]}>
                        <Text style={[styles.metaBadgeText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
                          {p.totalWeeks} {p.totalWeeks === 1 ? "week" : "weeks"}
                        </Text>
                      </View>
                      {isAttached && (
                        <View style={[styles.metaBadge, { backgroundColor: "#D8EBE3" }]}>
                          <Feather name="calendar" size={11} color="#4A7D68" />
                          <Text style={[styles.metaBadgeText, { color: "#4A7D68", fontFamily: "Inter_500Medium" }]}>
                            Active since {formatStartDate(p.startDate!)}
                          </Text>
                        </View>
                      )}
                    </View>
                    {p.notes ? (
                      <Text style={[styles.cardNotes, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]} numberOfLines={1}>
                        {p.notes}
                      </Text>
                    ) : null}
                  </View>
                  <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
                </TouchableOpacity>

                <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                  {attaching === p.id ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ paddingVertical: 8 }} />
                  ) : isAttached ? (
                    <TouchableOpacity style={styles.footerBtn} onPress={() => handleDetach(p)}>
                      <Feather name="x-circle" size={14} color={colors.mutedForeground} />
                      <Text style={[styles.footerBtnText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                        Detach from calendar
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.footerBtn} onPress={() => handleAttach(p)}>
                      <Feather name="calendar" size={14} color={colors.primary} />
                      <Text style={[styles.footerBtnText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
                        Attach to calendar
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => openMenu(p)} hitSlop={10}>
                    <Feather name="more-horizontal" size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17 },
  addBtn: { padding: 4 },
  content: { paddingHorizontal: 16, paddingTop: 20, gap: 12 },
  loadingWrap: { alignItems: "center", paddingVertical: 40 },
  emptyCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 28,
    alignItems: "center",
    gap: 8,
    marginTop: 16,
  },
  emptyTitle: { fontSize: 16, marginTop: 4 },
  emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 8 },
  createBtn: { paddingHorizontal: 28, paddingVertical: 13, borderRadius: 13, marginTop: 6 },
  createBtnText: { fontSize: 15 },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  cardMain: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  cardName: { fontSize: 15 },
  cardMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  metaBadgeText: { fontSize: 12 },
  cardNotes: { fontSize: 13 },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  footerBtnText: { fontSize: 13 },
});
