import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import ChipSelector from "./ChipSelector";

const WEARABLE_OPTIONS = ["Apple Watch", "Garmin", "Fitbit", "Oura Ring", "Whoop", "Other", "None"];

interface Props {
  initialValue: Record<string, any>;
  onChange: (data: Record<string, any>, valid: boolean) => void;
}

export default function Step6Fitness({ initialValue, onChange }: Props) {
  const colors = useColors();
  const [workouts, setWorkouts] = useState<number>(initialValue.workoutDaysPerWeek ?? 3);
  const [wearable, setWearable] = useState<string>(initialValue.wearableDevice ?? "");

  useEffect(() => {
    onChange({ workoutDaysPerWeek: workouts, wearableDevice: wearable }, true);
  }, [workouts, wearable]);

  const bump = (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWorkouts((prev) => Math.max(0, Math.min(7, prev + delta)));
  };

  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
          Valo
        </Text>
        <Text style={[styles.question, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          How active are you?
        </Text>
      </View>

      <View style={styles.fields}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            WORKOUTS PER WEEK
          </Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              onPress={() => bump(-1)}
              style={[styles.stepBtn, { borderColor: colors.border, opacity: workouts === 0 ? 0.4 : 1 }]}
              disabled={workouts === 0}
            >
              <Feather name="minus" size={18} color={colors.foreground} />
            </TouchableOpacity>
            <View style={styles.stepValue}>
              <Text style={[styles.stepNumber, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                {workouts}
              </Text>
              <Text style={[styles.stepUnit, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {workouts === 1 ? "day" : "days"}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => bump(1)}
              style={[styles.stepBtn, { borderColor: colors.border, opacity: workouts === 7 ? 0.4 : 1 }]}
              disabled={workouts === 7}
            >
              <Feather name="plus" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>
        </View>

        <View>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            WEARABLE DEVICE
          </Text>
          <ChipSelector
            options={WEARABLE_OPTIONS}
            selected={wearable}
            onSelect={(opt) => setWearable(prev => prev === opt ? "" : opt)}
            colors={colors}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 28 },
  bubble: { gap: 10 },
  valoLabel: { fontSize: 13, letterSpacing: 0.5 },
  question: { fontSize: 26, lineHeight: 34 },
  fields: { gap: 24 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  cardLabel: { fontSize: 11, letterSpacing: 0.8 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 20 },
  stepBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  stepValue: { flex: 1, alignItems: "center" },
  stepNumber: { fontSize: 36, lineHeight: 40 },
  stepUnit: { fontSize: 13, marginTop: 2 },
  sectionLabel: { fontSize: 11, letterSpacing: 0.8, marginBottom: 12 },
});
