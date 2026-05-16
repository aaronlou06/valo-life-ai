import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import TimePickerInline from "./TimePickerInline";
import ChipSelector from "./ChipSelector";

const SCHEDULE_OPTIONS = ["Regular hours", "Shift work", "Self-employed", "Varies"];

interface Props {
  initialValue: Record<string, any>;
  onChange: (data: Record<string, any>, valid: boolean) => void;
}

export default function Step8Rhythm({ initialValue, onChange }: Props) {
  const colors = useColors();
  const [wakeTime, setWakeTime] = useState<string>(initialValue.wakeTime ?? "06:30");
  const [bedTime, setBedTime] = useState<string>(initialValue.bedTime ?? "22:30");
  const [workSchedule, setWorkSchedule] = useState<string>(initialValue.workSchedule ?? "");

  useEffect(() => {
    onChange({ wakeTime, bedTime, workSchedule }, true);
  }, [wakeTime, bedTime, workSchedule]);

  return (
    <View style={styles.container}>
      <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
        VALO
      </Text>

      <View style={styles.headingBlock}>
        <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          What does your typical day look like?
        </Text>
        <Text style={[styles.subheading, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          This helps Valo know when to check in and what to expect.
        </Text>
      </View>

      <View style={styles.fields}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            I usually wake up around
          </Text>
          <TimePickerInline value={wakeTime} onChange={setWakeTime} colors={colors} />
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            I usually go to bed around
          </Text>
          <TimePickerInline value={bedTime} onChange={setBedTime} colors={colors} />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            Work schedule
          </Text>
          <ChipSelector
            options={SCHEDULE_OPTIONS}
            selected={workSchedule}
            onSelect={(opt) => setWorkSchedule((prev) => (prev === opt ? "" : opt))}
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
  fields: { gap: 20 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  cardLabel: { fontSize: 13, lineHeight: 18 },
  fieldGroup: { gap: 12 },
  fieldLabel: { fontSize: 13, lineHeight: 18 },
});
