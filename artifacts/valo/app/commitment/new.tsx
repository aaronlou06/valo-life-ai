import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListHabits,
  useCreateSharedCommitment,
  getListSharedCommitmentsQueryKey,
  type Habit,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

const TERRACOTTA = "#C17B3F";

const CADENCES: { value: string; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "custom", label: "Custom" },
];

const METRIC_TYPES: { value: string; label: string }[] = [
  { value: "binary", label: "Done / not done" },
  { value: "count", label: "A number of times" },
  { value: "streak", label: "A streak" },
];

export default function NewCommitmentScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const habitsQ = useListHabits();
  const createCommitment = useCreateSharedCommitment();

  const habits = (habitsQ.data ?? []) as Habit[];
  const [habitId, setHabitId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [metricType, setMetricType] = useState("binary");
  const [cadence, setCadence] = useState("daily");
  const [daysPerWeek, setDaysPerWeek] = useState("3");

  const topPad = (Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top) + 12;
  const selectedHabit = useMemo(() => habits.find((h) => h.id === habitId), [habits, habitId]);
  const effectiveTitle = title.trim() || selectedHabit?.name || "";
  const canSave = habitId != null && effectiveTitle.length > 0 && !createCommitment.isPending;

  const pickHabit = (h: Habit) => {
    setHabitId(h.id);
    if (!title.trim()) setTitle(h.name);
  };

  const save = async () => {
    if (!canSave || habitId == null) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const res = await createCommitment.mutateAsync({
        data: {
          title: effectiveTitle,
          sourceType: "habit",
          sourceId: habitId,
          metricType,
          cadence,
          ...(cadence !== "daily"
            ? { cadenceDaysPerWeek: Math.max(1, Math.min(7, Number(daysPerWeek) || 3)) }
            : {}),
        },
      });
      queryClient.invalidateQueries({ queryKey: getListSharedCommitmentsQueryKey() });
      router.replace(`/commitment/${res.id}`);
    } catch {
      // surfaced via createCommitment.isError
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.safe, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: topPad, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          New commitment
        </Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.lead, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Turn one of your habits into a shared commitment you can hold yourself accountable to.
        </Text>

        <Text style={[styles.label, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          Based on a habit
        </Text>
        {habitsQ.isLoading ? (
          <ActivityIndicator color={TERRACOTTA} style={{ marginVertical: 12 }} />
        ) : habits.length === 0 ? (
          <Text style={[styles.help, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            You have no habits yet. Create a habit first, then come back to share it.
          </Text>
        ) : (
          <View style={styles.chipWrap}>
            {habits.map((h) => {
              const active = h.id === habitId;
              return (
                <TouchableOpacity
                  key={h.id}
                  onPress={() => pickHabit(h)}
                  activeOpacity={0.8}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? TERRACOTTA : colors.card,
                      borderColor: active ? TERRACOTTA : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? "#FFFFFF" : colors.foreground, fontFamily: "Inter_500Medium" },
                    ]}
                  >
                    {h.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <Text style={[styles.label, { color: colors.foreground, fontFamily: "Inter_500Medium", marginTop: 20 }]}>
          How is it measured?
        </Text>
        <View style={styles.chipWrap}>
          {METRIC_TYPES.map((m) => {
            const active = m.value === metricType;
            return (
              <TouchableOpacity
                key={m.value}
                onPress={() => setMetricType(m.value)}
                activeOpacity={0.8}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? TERRACOTTA : colors.card,
                    borderColor: active ? TERRACOTTA : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? "#FFFFFF" : colors.foreground, fontFamily: "Inter_500Medium" },
                  ]}
                >
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.label, { color: colors.foreground, fontFamily: "Inter_500Medium", marginTop: 20 }]}>
          Title
        </Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="What are you committing to?"
          placeholderTextColor={colors.mutedForeground}
          style={[
            styles.input,
            { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" },
          ]}
        />

        <Text style={[styles.label, { color: colors.foreground, fontFamily: "Inter_500Medium", marginTop: 20 }]}>
          Cadence
        </Text>
        <View style={styles.chipWrap}>
          {CADENCES.map((c) => {
            const active = c.value === cadence;
            return (
              <TouchableOpacity
                key={c.value}
                onPress={() => setCadence(c.value)}
                activeOpacity={0.8}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? TERRACOTTA : colors.card,
                    borderColor: active ? TERRACOTTA : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? "#FFFFFF" : colors.foreground, fontFamily: "Inter_500Medium" },
                  ]}
                >
                  {c.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {cadence !== "daily" && (
          <>
            <Text style={[styles.label, { color: colors.foreground, fontFamily: "Inter_500Medium", marginTop: 20 }]}>
              Days per week
            </Text>
            <TextInput
              value={daysPerWeek}
              onChangeText={setDaysPerWeek}
              keyboardType="number-pad"
              maxLength={1}
              style={[
                styles.input,
                { width: 80, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" },
              ]}
            />
          </>
        )}

        {createCommitment.isError && (
          <Text style={[styles.errorText, { color: colors.destructive, fontFamily: "Inter_400Regular" }]}>
            Could not create the commitment. Please try again.
          </Text>
        )}

        <TouchableOpacity
          onPress={save}
          activeOpacity={0.85}
          disabled={!canSave}
          style={[styles.primaryBtn, { backgroundColor: TERRACOTTA, opacity: canSave ? 1 : 0.5 }]}
        >
          {createCommitment.isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>Create commitment</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18 },
  lead: { fontSize: 14, lineHeight: 21, marginBottom: 24 },
  label: { fontSize: 14, marginBottom: 10 },
  help: { fontSize: 13, lineHeight: 19 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  errorText: { fontSize: 13, marginTop: 16 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 28,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 15 },
});
