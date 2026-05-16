import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import TimePickerInline from "./TimePickerInline";
import ChipSelector from "./ChipSelector";

const SCHEDULE_OPTIONS = [
  "9-to-5",
  "Remote",
  "Flexible",
  "Shift work",
  "Student",
  "Self-employed",
];

interface Props {
  initialValue: Record<string, any>;
  onChange: (data: Record<string, any>, valid: boolean) => void;
}

export default function Step8Rhythm({ initialValue, onChange }: Props) {
  const colors = useColors();
  const [wakeTime, setWakeTime] = useState<string>(initialValue.wakeTime ?? "07:00");
  const [bedTime, setBedTime] = useState<string>(initialValue.bedTime ?? "23:00");
  const [workSchedule, setWorkSchedule] = useState<string>(initialValue.workSchedule ?? "");

  useEffect(() => {
    onChange({ wakeTime, bedTime, workSchedule }, true);
  }, [wakeTime, bedTime, workSchedule]);

  const handleScheduleSelect = (opt: string) => {
    setWorkSchedule((prev) => (prev === opt ? "" : opt));
  };

  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
          Valo
        </Text>
        <Text style={[styles.question, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Tell me about your day
        </Text>
        <Text style={[styles.subtext, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Valo uses this to time check-ins and understand your energy cycles.
        </Text>
      </View>

      <View style={styles.fields}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            WAKE TIME
          </Text>
          <TimePickerInline value={wakeTime} onChange={setWakeTime} colors={colors} />
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            BED TIME
          </Text>
          <TimePickerInline value={bedTime} onChange={setBedTime} colors={colors} />
        </View>

        <View>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            WORK SCHEDULE
          </Text>
          <ChipSelector
            options={SCHEDULE_OPTIONS}
            selected={workSchedule}
            onSelect={handleScheduleSelect}
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
  subtext: { fontSize: 15, lineHeight: 22 },
  fields: { gap: 20 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  cardLabel: { fontSize: 11, letterSpacing: 0.8 },
  sectionLabel: { fontSize: 11, letterSpacing: 0.8, marginBottom: 12 },
});
