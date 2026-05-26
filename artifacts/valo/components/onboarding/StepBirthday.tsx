import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";

interface Props {
  onContinue: (data: Record<string, string>) => void;
  onSkip: () => void;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1940;
const MAX_YEAR = CURRENT_YEAR - 13;

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

interface StepperProps {
  label: string;
  display: string;
  onUp: () => void;
  onDown: () => void;
  colors: ReturnType<typeof useColors>;
}

function Stepper({ label, display, onUp, onDown, colors }: StepperProps) {
  return (
    <View style={styles.stepperCol}>
      <Text style={[styles.stepperLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
        {label}
      </Text>
      <TouchableOpacity
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onUp(); }}
        style={[styles.stepperBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
        activeOpacity={0.7}
      >
        <Feather name="chevron-up" size={18} color={colors.foreground} />
      </TouchableOpacity>
      <Text style={[styles.stepperValue, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
        {display}
      </Text>
      <TouchableOpacity
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDown(); }}
        style={[styles.stepperBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
        activeOpacity={0.7}
      >
        <Feather name="chevron-down" size={18} color={colors.foreground} />
      </TouchableOpacity>
    </View>
  );
}

export default function StepBirthday({ onContinue, onSkip }: Props) {
  const colors = useColors();
  const [month, setMonth] = useState(1);
  const [day, setDay] = useState(1);
  const [year, setYear] = useState(1990);
  const [touched, setTouched] = useState(false);

  const maxDay = daysInMonth(month, year);
  const safeDay = clamp(day, 1, maxDay);

  function bumpMonth(delta: number) {
    setTouched(true);
    const next = ((month - 1 + delta + 12) % 12) + 1;
    setMonth(next);
    setDay((d) => clamp(d, 1, daysInMonth(next, year)));
  }

  function bumpDay(delta: number) {
    setTouched(true);
    setDay((d) => ((d - 1 + delta + maxDay) % maxDay) + 1);
  }

  function bumpYear(delta: number) {
    setTouched(true);
    setYear((y) => clamp(y + delta, MIN_YEAR, MAX_YEAR));
  }

  function handleContinue() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!touched) {
      onSkip();
      return;
    }
    const mm = String(month).padStart(2, "0");
    const dd = String(safeDay).padStart(2, "0");
    onContinue({ birthday: `${year}-${mm}-${dd}` });
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
        VALO
      </Text>

      <View style={styles.headingBlock}>
        <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          When were you born?
        </Text>
        <Text style={[styles.subheading, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Helps Valo personalize your health benchmarks.
        </Text>
      </View>

      <View style={[styles.pickerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Stepper
          label="Month"
          display={MONTHS[month - 1]?.slice(0, 3) ?? ""}
          onUp={() => bumpMonth(1)}
          onDown={() => bumpMonth(-1)}
          colors={colors}
        />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Stepper
          label="Day"
          display={String(safeDay)}
          onUp={() => bumpDay(1)}
          onDown={() => bumpDay(-1)}
          colors={colors}
        />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Stepper
          label="Year"
          display={String(year)}
          onUp={() => bumpYear(1)}
          onDown={() => bumpYear(-1)}
          colors={colors}
        />
      </View>

      {!touched && (
        <Text style={[styles.hint, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Adjust to your birthday, or skip if you prefer.
        </Text>
      )}

      <TouchableOpacity
        style={[styles.continueBtn, { backgroundColor: colors.primary }]}
        onPress={handleContinue}
        activeOpacity={0.85}
      >
        <Text style={[styles.continueBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
          {touched ? "Continue" : "Skip"}
        </Text>
      </TouchableOpacity>

      {touched && (
        <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSkip(); }} style={styles.skipBtn} activeOpacity={0.7}>
          <Text style={[styles.skipText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Skip
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 24 },
  valoLabel: { fontSize: 11, letterSpacing: 1.5 },
  headingBlock: { gap: 8 },
  heading: { fontSize: 22, lineHeight: 30 },
  subheading: { fontSize: 14, lineHeight: 22 },
  pickerCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 20,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  divider: { width: 1, height: 80, opacity: 0.4 },
  stepperCol: { alignItems: "center", gap: 8, flex: 1 },
  stepperLabel: { fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" },
  stepperBtn: {
    width: 44,
    height: 34,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  stepperValue: { fontSize: 20, lineHeight: 26, minWidth: 50, textAlign: "center" },
  hint: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  continueBtn: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  continueBtnText: { fontSize: 16 },
  skipBtn: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 24 },
  skipText: { fontSize: 14, textDecorationLine: "underline" },
});
