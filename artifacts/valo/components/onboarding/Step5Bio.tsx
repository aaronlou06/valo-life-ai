import React, { useState, useEffect } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import ChipSelector from "./ChipSelector";

const SEX_OPTIONS = ["Male", "Female", "Non-binary", "Prefer not to say"];

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
    onChange(
      { age: parsedAge, biologicalSex },
      true
    );
  }, [age, biologicalSex]);

  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
          Valo
        </Text>
        <Text style={[styles.question, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          A bit about you
        </Text>
        <Text style={[styles.subtext, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Helps Valo personalise your health context.
        </Text>
      </View>

      <View style={styles.fields}>
        <View>
          <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            AGE
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

        <View>
          <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            BIOLOGICAL SEX
          </Text>
          <ChipSelector
            options={SEX_OPTIONS}
            selected={biologicalSex}
            onSelect={setBiologicalSex}
            colors={colors}
          />
        </View>
      </View>

      <Text style={[styles.optional, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        Both fields are optional.
      </Text>
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
  label: { fontSize: 11, letterSpacing: 0.8, marginBottom: 10 },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  optional: { fontSize: 13 },
});
