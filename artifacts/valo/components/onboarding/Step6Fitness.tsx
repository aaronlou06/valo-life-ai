import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import ChipSelector from "./ChipSelector";

const WEARABLE_OPTIONS = ["Apple Watch", "Garmin", "Whoop", "Oura Ring", "Fitbit", "None"];

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
      <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
        VALO
      </Text>

      <View style={styles.headingBlock}>
        <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          Tell Valo about your fitness baseline.
        </Text>
        <Text style={[styles.subheading, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          This helps set expectations for workouts and recovery.
        </Text>
      </View>

      <View style={styles.fields}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            How many days a week do you typically work out?
          </Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              onPress={() => bump(-1)}
              style={[styles.stepBtn, { borderColor: colors.border, opacity: workouts === 0 ? 0.35 : 1 }]}
              disabled={workouts === 0}
            >
              <Feather name="minus" size={18} color={colors.foreground} />
            </TouchableOpacity>
            <View style={styles.stepValue}>
              <Text style={[styles.stepNumber, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                {workouts}
              </Text>
              <Text style={[styles.stepUnit, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {workouts === 1 ? "day / week" : "days / week"}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => bump(1)}
              style={[styles.stepBtn, { borderColor: colors.border, opacity: workouts === 7 ? 0.35 : 1 }]}
              disabled={workouts === 7}
            >
              <Feather name="plus" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            Do you use a wearable device?
          </Text>
          <ChipSelector
            options={WEARABLE_OPTIONS}
            selected={wearable}
            onSelect={(opt) => setWearable((prev) => (prev === opt ? "" : opt))}
            colors={colors}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 28 },
  valoLabel: { fontSize: 11, letterSpacing: 1.5 },
  headingBlock: { gap: 8 },
  heading: { fontSize: 22, lineHeight: 30 },
  subheading: { fontSize: 14, lineHeight: 22 },
  fields: { gap: 24 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 18,
  },
  cardLabel: { fontSize: 14, lineHeight: 22 },
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
  stepUnit: { fontSize: 12, marginTop: 2 },
  fieldGroup: { gap: 12 },
  fieldLabel: { fontSize: 13, lineHeight: 18 },
});
