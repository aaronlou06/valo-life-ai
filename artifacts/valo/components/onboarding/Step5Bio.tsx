import React, { useState, useEffect } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import ChipSelector from "./ChipSelector";

const SEX_OPTIONS = ["Male", "Female", "Prefer not to say"];

interface Props {
  initialValue: Record<string, any>;
  onChange: (data: Record<string, any>, valid: boolean) => void;
}

export default function Step5Bio({ initialValue, onChange }: Props) {
  const colors = useColors();
  const [age, setAge] = useState<string>(initialValue.age != null ? String(initialValue.age) : "");
  const [biologicalSex, setBiologicalSex] = useState<string>(initialValue.biologicalSex ?? "");

  useEffect(() => {
    const parsedAge = age.trim() ? parseInt(age.trim(), 10) : null;
    onChange({ age: parsedAge, biologicalSex }, true);
  }, [age, biologicalSex]);

  return (
    <View style={styles.container}>
      <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
        VALO
      </Text>

      <View style={styles.headingBlock}>
        <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          A little about your body.
        </Text>
        <Text style={[styles.subheading, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          This helps Valo calibrate health benchmarks accurately.
        </Text>
      </View>

      <View style={styles.fields}>
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            Age
          </Text>
          <TextInput
            value={age}
            onChangeText={setAge}
            placeholder="Your age"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="numeric"
            maxLength={3}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            Biological sex
          </Text>
          <ChipSelector
            options={SEX_OPTIONS}
            selected={biologicalSex}
            onSelect={(opt) => setBiologicalSex((prev) => (prev === opt ? "" : opt))}
            colors={colors}
          />
        </View>
      </View>

      <Text style={[styles.note, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        Used for HRV and sleep benchmarks only.
      </Text>
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
  fieldGroup: { gap: 10 },
  fieldLabel: { fontSize: 13, lineHeight: 18 },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  note: { fontSize: 12, lineHeight: 18 },
});
