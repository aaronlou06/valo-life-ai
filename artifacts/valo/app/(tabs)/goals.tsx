import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import {
  useListGoals,
  useListHabits,
  useCreateGoal,
  useCreateHabit,
  useUpdateHabit,
  useUpdateGoal,
  useDeleteGoal,
  useDeleteHabit,
  getListGoalsQueryKey,
  getListHabitsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export default function GoalsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: goals, isLoading: goalsLoading } = useListGoals();
  const { data: habits, isLoading: habitsLoading } = useListHabits();
  const createGoal = useCreateGoal();
  const createHabit = useCreateHabit();
  const updateHabit = useUpdateHabit();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();
  const deleteHabit = useDeleteHabit();

  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newHabitName, setNewHabitName] = useState("");
  const [showGoalInput, setShowGoalInput] = useState(false);
  const [showHabitInput, setShowHabitInput] = useState(false);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const tabBarH = Platform.OS === "web" ? 84 : 83;

  const handleAddGoal = async () => {
    if (!newGoalTitle.trim()) return;
    await createGoal.mutateAsync({ data: { title: newGoalTitle.trim(), progressPercent: 0 } });
    queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
    setNewGoalTitle("");
    setShowGoalInput(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleAddHabit = async () => {
    if (!newHabitName.trim()) return;
    await createHabit.mutateAsync({ data: { name: newHabitName.trim() } });
    queryClient.invalidateQueries({ queryKey: getListHabitsQueryKey() });
    setNewHabitName("");
    setShowHabitInput(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const toggleHabit = async (id: number, completed: boolean, streak: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await updateHabit.mutateAsync({ id, data: { completedToday: !completed, streak: !completed ? streak + 1 : Math.max(0, streak - 1) } });
    queryClient.invalidateQueries({ queryKey: getListHabitsQueryKey() });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: bottomPad + tabBarH + 16, paddingHorizontal: 20 }}
    >
      <Text style={[styles.header, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Goals</Text>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Big Goals</Text>
        <TouchableOpacity onPress={() => setShowGoalInput((v) => !v)}>
          <Feather name={showGoalInput ? "x" : "plus"} size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {showGoalInput && (
        <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            style={[styles.textInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
            value={newGoalTitle}
            onChangeText={setNewGoalTitle}
            placeholder="What do you want to achieve?"
            placeholderTextColor={colors.mutedForeground}
            onSubmitEditing={handleAddGoal}
            returnKeyType="done"
            autoFocus
          />
          <TouchableOpacity onPress={handleAddGoal} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
            <Feather name="check" size={16} color={colors.primaryForeground} />
          </TouchableOpacity>
        </View>
      )}

      {goalsLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : goals?.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="flag" size={24} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>No goals yet. Add something meaningful.</Text>
        </View>
      ) : (
        goals?.map((goal) => (
          <View key={goal.id} style={[styles.goalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.goalHeader}>
              <Text style={[styles.goalTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]} numberOfLines={2}>{goal.title}</Text>
              <TouchableOpacity onPress={() => { deleteGoal.mutate({ id: goal.id }); queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() }); }}>
                <Feather name="trash-2" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            {goal.targetDate && (
              <Text style={[styles.goalDate, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Target: {goal.targetDate}</Text>
            )}
            <View style={styles.progressRow}>
              <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
                <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${goal.progressPercent}%` }]} />
              </View>
              <Text style={[styles.progressPct, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>{goal.progressPercent}%</Text>
            </View>
          </View>
        ))
      )}

      <View style={[styles.sectionHeader, { marginTop: 24 }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Daily Habits</Text>
        <TouchableOpacity onPress={() => setShowHabitInput((v) => !v)}>
          <Feather name={showHabitInput ? "x" : "plus"} size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {showHabitInput && (
        <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            style={[styles.textInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
            value={newHabitName}
            onChangeText={setNewHabitName}
            placeholder="Name this habit..."
            placeholderTextColor={colors.mutedForeground}
            onSubmitEditing={handleAddHabit}
            returnKeyType="done"
            autoFocus
          />
          <TouchableOpacity onPress={handleAddHabit} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
            <Feather name="check" size={16} color={colors.primaryForeground} />
          </TouchableOpacity>
        </View>
      )}

      {habitsLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : habits?.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="check-circle" size={24} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>No habits yet. Small things compound.</Text>
        </View>
      ) : (
        habits?.map((habit) => (
          <TouchableOpacity
            key={habit.id}
            style={[styles.habitRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => toggleHabit(habit.id, habit.completedToday, habit.streak)}
          >
            <View style={[styles.habitCheck, { borderColor: habit.completedToday ? colors.primary : colors.border, backgroundColor: habit.completedToday ? colors.primary : "transparent" }]}>
              {habit.completedToday && <Feather name="check" size={14} color={colors.primaryForeground} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.habitName, { color: colors.foreground, fontFamily: "Inter_500Medium", textDecorationLine: habit.completedToday ? "line-through" : "none", opacity: habit.completedToday ? 0.6 : 1 }]}>{habit.name}</Text>
              <Text style={[styles.habitStreak, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{habit.streak} day streak</Text>
            </View>
            <TouchableOpacity onPress={() => { deleteHabit.mutate({ id: habit.id }); queryClient.invalidateQueries({ queryKey: getListHabitsQueryKey() }); }}>
              <Feather name="trash-2" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 28, marginBottom: 24 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 17 },
  goalCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 10 },
  goalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  goalTitle: { fontSize: 15, flex: 1, marginRight: 8, lineHeight: 21 },
  goalDate: { fontSize: 12, marginBottom: 10 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  progressPct: { fontSize: 12, width: 32, textAlign: "right" },
  habitRow: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 8, gap: 14 },
  habitCheck: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, justifyContent: "center", alignItems: "center" },
  habitName: { fontSize: 15, marginBottom: 2 },
  habitStreak: { fontSize: 12 },
  inputRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10, gap: 10 },
  textInput: { flex: 1, fontSize: 15 },
  addBtn: { width: 32, height: 32, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  emptyCard: { borderRadius: 14, borderWidth: 1, padding: 24, alignItems: "center", gap: 10, marginBottom: 12 },
  emptyText: { fontSize: 14, textAlign: "center" },
});
