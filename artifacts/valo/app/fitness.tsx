import React, { useState } from "react";
import {
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
import { useColors } from "@/hooks/useColors";

const SAGE = "#6B9E78";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Exercise {
  name: string;
  detail: string;
}

interface Workout {
  name: string;
  tags: string[];
  exercises: Exercise[];
}

const SEED: Record<string, Workout | null> = {
  Mon: null,
  Tue: {
    name: "Push Day — Upper Body",
    tags: ["Strength", "45 min", "Gym"],
    exercises: [
      { name: "Bench Press", detail: "4 × 8" },
      { name: "Overhead Press", detail: "3 × 10" },
      { name: "Incline Dumbbell Press", detail: "3 × 12" },
      { name: "Tricep Pushdown", detail: "3 × 15" },
      { name: "Lateral Raises", detail: "3 × 15" },
    ],
  },
  Wed: {
    name: "Zone 2 Cardio",
    tags: ["Cardio", "30 min", "Outdoor"],
    exercises: [
      { name: "Easy Run", detail: "30 min" },
      { name: "Mobility cooldown", detail: "10 min" },
    ],
  },
  Thu: null,
  Fri: {
    name: "Pull Day — Back & Biceps",
    tags: ["Strength", "50 min", "Gym"],
    exercises: [
      { name: "Deadlift", detail: "4 × 5" },
      { name: "Pull-ups", detail: "4 × 8" },
      { name: "Barbell Row", detail: "3 × 10" },
      { name: "Bicep Curls", detail: "3 × 12" },
    ],
  },
  Sat: null,
  Sun: null,
};

export default function FitnessScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [plan, setPlan] = useState<Record<string, Workout | null>>(SEED);
  const [selected, setSelected] = useState("Tue");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [duration, setDuration] = useState("");

  const workout = plan[selected];

  const saveWorkout = () => {
    if (!name.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const tags = [type.trim() || "Workout", duration.trim() ? `${duration.trim()} min` : "—"];
    setPlan((prev) => ({
      ...prev,
      [selected]: { name: name.trim(), tags, exercises: [] },
    }));
    setName("");
    setType("");
    setDuration("");
    setAdding(false);
  };

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Fitness Planner
        </Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        >
          {/* Week strip */}
          <View style={styles.weekStrip}>
            {DAYS.map((d) => {
              const active = d === selected;
              const has = !!plan[d];
              return (
                <TouchableOpacity
                  key={d}
                  onPress={() => { Haptics.selectionAsync(); setSelected(d); setAdding(false); }}
                  activeOpacity={0.8}
                  style={[
                    styles.dayPill,
                    active
                      ? { backgroundColor: SAGE, borderColor: SAGE }
                      : { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.dayText, { fontFamily: "Inter_600SemiBold", color: active ? "#FFFFFF" : colors.foreground }]}>
                    {d}
                  </Text>
                  <View style={[styles.dot, { backgroundColor: has ? (active ? "#FFFFFF" : SAGE) : "transparent" }]} />
                </TouchableOpacity>
              );
            })}
          </View>

          {workout ? (
            <View style={[styles.workoutCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.workoutName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                {workout.name}
              </Text>
              <View style={styles.tagRow}>
                {workout.tags.map((t, i) => (
                  <View key={i} style={[styles.tag, { backgroundColor: `${SAGE}1F` }]}>
                    <Text style={[styles.tagText, { color: SAGE, fontFamily: "Inter_500Medium" }]}>{t}</Text>
                  </View>
                ))}
              </View>
              {workout.exercises.length > 0 && (
                <View style={styles.exerciseList}>
                  {workout.exercises.map((ex, i) => (
                    <View
                      key={i}
                      style={[
                        styles.exerciseRow,
                        { backgroundColor: i % 2 === 0 ? "transparent" : colors.muted },
                      ]}
                    >
                      <Text style={[styles.exerciseName, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                        {ex.name}
                      </Text>
                      <Text style={[styles.exerciseDetail, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                        {ex.detail}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.restCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="moon" size={28} color={colors.mutedForeground} />
              <Text style={[styles.restText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Rest day</Text>
              <Text style={[styles.restSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Recovery is part of the plan.
              </Text>
            </View>
          )}

          {adding ? (
            <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Workout name"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.input, fontFamily: "Inter_400Regular" }]}
                autoFocus
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TextInput
                  value={type}
                  onChangeText={setType}
                  placeholder="Type (e.g. Strength)"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { flex: 1, color: colors.foreground, backgroundColor: colors.input, fontFamily: "Inter_400Regular" }]}
                />
                <TextInput
                  value={duration}
                  onChangeText={setDuration}
                  placeholder="Min"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  style={[styles.input, { width: 80, color: colors.foreground, backgroundColor: colors.input, fontFamily: "Inter_400Regular" }]}
                />
              </View>
              <View style={styles.formActions}>
                <TouchableOpacity onPress={() => { setAdding(false); setName(""); setType(""); setDuration(""); }} style={styles.cancelBtn}>
                  <Text style={[styles.cancelText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveWorkout} style={[styles.saveBtn, { backgroundColor: SAGE }]}>
                  <Text style={[styles.saveText, { fontFamily: "Inter_600SemiBold" }]}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setAdding(true)}
              activeOpacity={0.7}
              style={[styles.addRow, { borderColor: colors.border }]}
            >
              <Feather name="plus" size={18} color={SAGE} />
              <Text style={[styles.addText, { color: SAGE, fontFamily: "Inter_500Medium" }]}>
                {workout ? `Replace ${selected}'s workout` : `Add workout for ${selected}`}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
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
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18 },
  weekStrip: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  dayPill: {
    flex: 1,
    marginHorizontal: 2,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: "center",
    gap: 5,
  },
  dayText: { fontSize: 12 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  workoutCard: { borderRadius: 12, borderWidth: 1, padding: 16 },
  workoutName: { fontSize: 17, marginBottom: 10 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  tagText: { fontSize: 12 },
  exerciseList: { borderRadius: 8, overflow: "hidden" },
  exerciseRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  exerciseName: { fontSize: 14 },
  exerciseDetail: { fontSize: 13 },
  restCard: { borderRadius: 12, borderWidth: 1, padding: 28, alignItems: "center", gap: 8 },
  restText: { fontSize: 16 },
  restSub: { fontSize: 13 },
  formCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 10, marginTop: 12 },
  input: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  formActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 9 },
  cancelText: { fontSize: 13 },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 8 },
  saveText: { fontSize: 13, color: "#FFFFFF" },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    paddingVertical: 14,
    marginTop: 12,
  },
  addText: { fontSize: 14 },
});
