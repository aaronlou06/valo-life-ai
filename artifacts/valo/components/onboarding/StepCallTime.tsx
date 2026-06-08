import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";

const TIME_SLOTS = [
  { label: "6:00 AM", value: "06:00" },
  { label: "7:00 AM", value: "07:00" },
  { label: "7:30 AM", value: "07:30" },
  { label: "8:00 AM", value: "08:00" },
  { label: "8:30 AM", value: "08:30" },
  { label: "9:00 AM", value: "09:00" },
  { label: "12:00 PM", value: "12:00" },
  { label: "5:00 PM", value: "17:00" },
  { label: "6:00 PM", value: "18:00" },
  { label: "7:00 PM", value: "19:00" },
  { label: "8:00 PM", value: "20:00" },
  { label: "8:30 PM", value: "20:30" },
  { label: "9:00 PM", value: "21:00" },
  { label: "9:30 PM", value: "21:30" },
  { label: "10:00 PM", value: "22:00" },
];

interface Props {
  onContinue: (data: Record<string, string>) => void;
  onSkip: () => void;
}

export default function StepCallTime({ onContinue, onSkip }: Props) {
  const colors = useColors();
  const [selected, setSelected] = useState<string | null>(null);

  function handleSelect(value: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(value);
  }

  function handleContinue() {
    if (!selected) {
      onSkip();
      return;
    }
    onContinue({ preferredCallTime: selected });
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
        VALO
      </Text>
      <Text style={[styles.question, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
        What time of day do you want me to check in with you?
      </Text>
      <Text style={[styles.hint, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        You can change this anytime in Settings.
      </Text>

      <View style={styles.grid}>
        {TIME_SLOTS.map((slot) => {
          const active = selected === slot.value;
          return (
            <TouchableOpacity
              key={slot.value}
              onPress={() => handleSelect(slot.value)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.primary : colors.card,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color: active ? colors.primaryForeground : colors.foreground,
                    fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular",
                  },
                ]}
              >
                {slot.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[
          styles.continueBtn,
          { backgroundColor: selected ? colors.primary : colors.muted },
        ]}
        onPress={handleContinue}
        activeOpacity={0.85}
      >
        <Text
          style={[
            styles.continueBtnText,
            {
              color: selected ? colors.primaryForeground : colors.mutedForeground,
              fontFamily: "Inter_600SemiBold",
            },
          ]}
        >
          {selected ? "Continue" : "Skip"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onSkip} style={styles.skipBtn} activeOpacity={0.7}>
        <Text style={[styles.skipText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Skip
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 20, paddingTop: 8 },
  valoLabel: { fontSize: 11, letterSpacing: 1.5 },
  question: { fontSize: 24, lineHeight: 32 },
  hint: { fontSize: 14, lineHeight: 20, marginTop: -8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 24,
    borderWidth: 1,
  },
  chipText: { fontSize: 14 },
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
