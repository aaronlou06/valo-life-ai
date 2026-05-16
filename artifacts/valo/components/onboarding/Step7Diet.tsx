import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import ChipSelector from "./ChipSelector";

const DIET_OPTIONS = [
  "Omnivore",
  "Vegetarian",
  "Vegan",
  "Keto",
  "Paleo",
  "Gluten-free",
  "Intermittent fasting",
  "Other",
];

interface Props {
  initialValue: Record<string, any>;
  onChange: (data: Record<string, any>, valid: boolean) => void;
}

export default function Step7Diet({ initialValue, onChange }: Props) {
  const colors = useColors();
  const [dietType, setDietType] = useState<string>(initialValue.dietType ?? "");

  useEffect(() => {
    onChange({ dietType }, true);
  }, [dietType]);

  const handleSelect = (opt: string) => {
    setDietType((prev) => (prev === opt ? "" : opt));
  };

  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
          Valo
        </Text>
        <Text style={[styles.question, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          How do you eat?
        </Text>
        <Text style={[styles.subtext, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Helps Valo read your energy and recovery patterns.
        </Text>
      </View>

      <ChipSelector
        options={DIET_OPTIONS}
        selected={dietType}
        onSelect={handleSelect}
        colors={colors}
      />

      <Text style={[styles.optional, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        Optional — you can update this anytime.
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
  optional: { fontSize: 13 },
});
