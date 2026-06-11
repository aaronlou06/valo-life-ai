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

const BG = "#F7F5F2";
const CARD = "#FFFFFF";
const BORDER = "#E8E4DE";
const SLATE = "#1A1814";
const MUTED = "#8B8780";
const TERRA = "#C17B3F";
const SAGE = "#6B9E78";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Exercise = { id: string; name: string; sets: number; reps: number; done: boolean };
type Workout = { name: string; tags: string[]; exercises: Exercise[] } | null;

const SEED_WORKOUTS: Record<string, Workout> = {
  Mon: {
    name: "Push Day — Upper Body",
    tags: ["Strength", "45 min", "Gym"],
    exercises: [
      { id: "1", name: "Bench Press", sets: 4, reps: 8, done: false },
      { id: "2", name: "Overhead Press", sets: 3, reps: 10, done: false },
      { id: "3", name: "Dumbbell Fly", sets: 3, reps: 12, done: false },
      { id: "4", name: "Tricep Pushdown", sets: 3, reps: 15, done: false },
    ],
  },
  Tue: {
    name: "Pull Day — Back & Biceps",
    tags: ["Strength", "50 min", "Gym"],
    exercises: [
      { id: "5", name: "Pull-Ups", sets: 4, reps: 6, done: false },
      { id: "6", name: "Barbell Row", sets: 4, reps: 8, done: false },
      { id: "7", name: "Lat Pulldown", sets: 3, reps: 10, done: false },
      { id: "8", name: "Bicep Curl", sets: 3, reps: 12, done: false },
    ],
  },
  Wed: null,
  Thu: {
    name: "Leg Day",
    tags: ["Strength", "55 min", "Gym"],
    exercises: [
      { id: "9", name: "Squat", sets: 4, reps: 8, done: false },
      { id: "10", name: "Romanian Deadlift", sets: 3, reps: 10, done: false },
      { id: "11", name: "Leg Press", sets: 3, reps: 12, done: false },
      { id: "12", name: "Calf Raise", sets: 4, reps: 15, done: false },
    ],
  },
  Fri: {
    name: "Cardio & Core",
    tags: ["Cardio", "35 min", "Home"],
    exercises: [
      { id: "13", name: "Plank", sets: 3, reps: 60, done: false },
      { id: "14", name: "Mountain Climbers", sets: 3, reps: 20, done: false },
      { id: "15", name: "Treadmill Run", sets: 1, reps: 20, done: false },
    ],
  },
  Sat: null,
  Sun: null,
};

export default function FitnessScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [selectedDay, setSelectedDay] = useState("Tue");
  const [workouts, setWorkouts] = useState<Record<string, Workout>>(SEED_WORKOUTS);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("");
  const [newDur, setNewDur] = useState("");

  function toggleExercise(exId: string) {
    const w = workouts[selectedDay];
    if (!w) return;
    setWorkouts({
      ...workouts,
      [selectedDay]: {
        ...w,
        exercises: w.exercises.map((e) => e.id === exId ? { ...e, done: !e.done } : e),
      },
    });
  }

  function addWorkout() {
    if (!newName.trim()) return;
    setWorkouts({
      ...workouts,
      [selectedDay]: {
        name: newName.trim(),
        tags: [newType.trim() || "Custom", newDur.trim() ? `${newDur}min` : ""],
        exercises: [],
      },
    });
    setNewName(""); setNewType(""); setNewDur("");
    setShowForm(false);
  }

  const doneCount = Object.values(workouts).filter(Boolean).length;
  const totalMins = [45, 50, 35].reduce((a, b) => a + b, 0);

  const dayWorkout = workouts[selectedDay];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: (Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top) + 12, borderBottomColor: BORDER }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={TERRA} />
        </TouchableOpacity>
        <Text style={[styles.title, { fontFamily: "Inter_600SemiBold" }]}>Workout Planner</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.statsRow}>
          <View style={[styles.statChip, { backgroundColor: `${SAGE}18` }]}>
            <Text style={[styles.statVal, { color: SAGE, fontFamily: "Inter_700Bold" }]}>{doneCount}</Text>
            <Text style={[styles.statLabel, { fontFamily: "Inter_400Regular" }]}>workouts this week</Text>
          </View>
          <View style={[styles.statChip, { backgroundColor: `${SAGE}18` }]}>
            <Text style={[styles.statVal, { color: SAGE, fontFamily: "Inter_700Bold" }]}>{totalMins}</Text>
            <Text style={[styles.statLabel, { fontFamily: "Inter_400Regular" }]}>total minutes</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayStrip}>
          {DAYS.map((d) => (
            <TouchableOpacity
              key={d}
              onPress={() => setSelectedDay(d)}
              activeOpacity={0.7}
              style={[
                styles.dayPill,
                { backgroundColor: selectedDay === d ? SAGE : CARD, borderColor: selectedDay === d ? SAGE : BORDER },
              ]}
            >
              <Text
                style={[
                  styles.dayText,
                  { color: selectedDay === d ? "#FFFFFF" : MUTED, fontFamily: "Inter_600SemiBold" },
                ]}
              >
                {d}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {dayWorkout ? (
          <View style={[styles.card]}>
            <Text style={[styles.workoutName, { fontFamily: "Inter_600SemiBold" }]}>{dayWorkout.name}</Text>
            <View style={styles.tagRow}>
              {dayWorkout.tags.filter(Boolean).map((t) => (
                <View key={t} style={[styles.tag, { backgroundColor: `${SAGE}18` }]}>
                  <Text style={[styles.tagText, { color: SAGE, fontFamily: "Inter_500Medium" }]}>{t}</Text>
                </View>
              ))}
            </View>
            {dayWorkout.exercises.map((ex) => (
              <TouchableOpacity
                key={ex.id}
                onPress={() => toggleExercise(ex.id)}
                activeOpacity={0.7}
                style={styles.exRow}
              >
                <View style={[styles.checkbox, { borderColor: ex.done ? SAGE : BORDER, backgroundColor: ex.done ? SAGE : "transparent" }]}>
                  {ex.done && <Feather name="check" size={12} color="#FFFFFF" />}
                </View>
                <Text
                  style={[
                    styles.exName,
                    { fontFamily: "Inter_400Regular", textDecorationLine: ex.done ? "line-through" : "none", color: ex.done ? MUTED : SLATE },
                  ]}
                >
                  {ex.name}
                </Text>
                <Text style={[styles.exSets, { fontFamily: "Inter_400Regular" }]}>
                  {ex.sets}×{ex.reps}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={[styles.card, styles.restCard]}>
            <Feather name="moon" size={28} color={MUTED} />
            <Text style={[styles.restText, { fontFamily: "Inter_500Medium" }]}>Rest day</Text>
            <Text style={[styles.restSub, { fontFamily: "Inter_400Regular" }]}>Recovery is part of the plan.</Text>
          </View>
        )}

        <TouchableOpacity
          onPress={() => setShowForm((v) => !v)}
          activeOpacity={0.8}
          style={[styles.addBtn, { borderColor: SAGE }]}
        >
          <Feather name="plus" size={16} color={SAGE} />
          <Text style={[styles.addBtnText, { color: SAGE, fontFamily: "Inter_600SemiBold" }]}>
            Add Workout
          </Text>
        </TouchableOpacity>

        {showForm && (
          <View style={[styles.card, { padding: 14 }]}>
            <TextInput placeholder="Workout name" placeholderTextColor={MUTED} value={newName} onChangeText={setNewName} style={[styles.input, { fontFamily: "Inter_400Regular" }]} />
            <TextInput placeholder="Type (e.g. Strength)" placeholderTextColor={MUTED} value={newType} onChangeText={setNewType} style={[styles.input, { fontFamily: "Inter_400Regular" }]} />
            <TextInput placeholder="Duration (min)" placeholderTextColor={MUTED} value={newDur} onChangeText={setNewDur} keyboardType="number-pad" style={[styles.input, { fontFamily: "Inter_400Regular" }]} />
            <TouchableOpacity onPress={addWorkout} activeOpacity={0.8} style={styles.saveBtn}>
              <Text style={[styles.saveBtnText, { fontFamily: "Inter_600SemiBold" }]}>Save</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: BG,
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, color: SLATE },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statChip: { flex: 1, borderRadius: 12, padding: 12, alignItems: "center" },
  statVal: { fontSize: 24 },
  statLabel: { fontSize: 11, color: MUTED, marginTop: 2 },
  dayStrip: { flexGrow: 0, marginBottom: 16 },
  dayPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  dayText: { fontSize: 13 },
  card: {
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  workoutName: { fontSize: 15, color: SLATE, marginBottom: 10 },
  tagRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginBottom: 14 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  tagText: { fontSize: 12 },
  exRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  exName: { flex: 1, fontSize: 14 },
  exSets: { fontSize: 12, color: MUTED },
  restCard: { alignItems: "center", paddingVertical: 32, gap: 8 },
  restText: { fontSize: 16, color: MUTED },
  restSub: { fontSize: 13, color: MUTED },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 12,
  },
  addBtnText: { fontSize: 14 },
  input: { borderWidth: 1, borderColor: BORDER, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: SLATE, marginBottom: 8 },
  saveBtn: { backgroundColor: TERRA, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  saveBtnText: { color: "#FFFFFF", fontSize: 14 },
});
