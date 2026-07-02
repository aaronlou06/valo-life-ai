import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import * as Haptics from "expo-haptics";

const TIME_OPTIONS = [
  { label: "Morning", value: "08:00", hint: "8:00 AM" },
  { label: "Afternoon", value: "12:00", hint: "12:00 PM" },
  { label: "Evening", value: "20:00", hint: "8:00 PM" },
] as const;

const MODE_OPTIONS = [
  { label: "Voice", callsEnabled: true },
  { label: "Text", callsEnabled: false },
] as const;

interface Props {
  onContinue: (data: { preferredCallTime: string; callsEnabled: boolean }) => void;
  initialValue?: Record<string, unknown>;
}

export default function StepCheckinSetup({ onContinue, initialValue }: Props) {
  const colors = useColors();
  const [selectedTime, setSelectedTime] = useState<string>(() => {
    const raw = initialValue?.preferredCallTime;
    const validValues = TIME_OPTIONS.map((o) => o.value) as string[];
    if (typeof raw === "string" && validValues.includes(raw)) return raw;
    return "20:00";
  });
  const [callsEnabled, setCallsEnabled] = useState<boolean>(() => {
    const raw = initialValue?.callsEnabled;
    if (typeof raw === "boolean") return raw;
    return true;
  });

  const handleContinue = () => {
    onContinue({ preferredCallTime: selectedTime, callsEnabled });
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
        VALO
      </Text>

      <View style={styles.headingBlock}>
        <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          Set up your daily check-in.
        </Text>
        <Text style={[styles.subtext, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Pick a time and how you want to connect. You can always change this in Settings.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          When should Valo check in?
        </Text>
        <View style={styles.optionRow}>
          {TIME_OPTIONS.map((opt) => {
            const selected = selectedTime === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setSelectedTime(opt.value);
                }}
                activeOpacity={0.75}
                style={[
                  styles.timeCard,
                  {
                    backgroundColor: selected ? colors.primary : colors.card,
                    borderColor: selected ? colors.primary : colors.border,
                    flex: 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.timeLabel,
                    {
                      color: selected ? colors.primaryForeground : colors.foreground,
                      fontFamily: selected ? "Inter_600SemiBold" : "Inter_400Regular",
                    },
                  ]}
                >
                  {opt.label}
                </Text>
                <Text
                  style={[
                    styles.timeHint,
                    {
                      color: selected ? colors.primaryForeground : colors.mutedForeground,
                      fontFamily: "Inter_400Regular",
                      opacity: selected ? 0.85 : 1,
                    },
                  ]}
                >
                  {opt.hint}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          How would you like to connect?
        </Text>
        <View style={styles.optionRow}>
          {MODE_OPTIONS.map((opt) => {
            const selected = callsEnabled === opt.callsEnabled;
            return (
              <TouchableOpacity
                key={opt.label}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setCallsEnabled(opt.callsEnabled);
                }}
                activeOpacity={0.75}
                style={[
                  styles.modeCard,
                  {
                    backgroundColor: selected ? colors.primary : colors.card,
                    borderColor: selected ? colors.primary : colors.border,
                    flex: 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.modeLabel,
                    {
                      color: selected ? colors.primaryForeground : colors.foreground,
                      fontFamily: selected ? "Inter_600SemiBold" : "Inter_400Regular",
                    },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[styles.modeNote, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {callsEnabled
            ? "Microphone access will be requested the first time you start a voice check-in."
            : "You can switch to voice any time in Settings."}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.continueBtn, { backgroundColor: colors.primary }]}
        onPress={handleContinue}
        activeOpacity={0.85}
      >
        <Text style={[styles.continueBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
          Continue
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 28 },
  valoLabel: { fontSize: 11, letterSpacing: 1.5 },
  headingBlock: { gap: 8 },
  heading: { fontSize: 22, lineHeight: 30 },
  subtext: { fontSize: 14, lineHeight: 22 },
  section: { gap: 12 },
  sectionLabel: { fontSize: 13 },
  optionRow: { flexDirection: "row", gap: 10 },
  timeCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 4,
  },
  timeLabel: { fontSize: 15 },
  timeHint: { fontSize: 12 },
  modeCard: { borderWidth: 1, borderRadius: 14, paddingVertical: 18, alignItems: "center" },
  modeLabel: { fontSize: 15 },
  modeNote: { fontSize: 12, lineHeight: 18 },
  continueBtn: { height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 4 },
  continueBtnText: { fontSize: 16 },
});
