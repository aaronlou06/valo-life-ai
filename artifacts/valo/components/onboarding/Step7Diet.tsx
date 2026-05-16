import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import ChipSelector from "./ChipSelector";

const DIET_OPTIONS = [
  "No specific plan",
  "High protein",
  "Keto / low carb",
  "Intermittent fasting",
  "Plant based",
  "Paleo",
  "Gluten free",
];

interface Props {
  initialValue: Record<string, any>;
  onChange: (data: Record<string, any>, valid: boolean) => void;
}

export default function Step7Diet({ initialValue, onChange }: Props) {
  const colors = useColors();
  const [dietType, setDietType] = useState<string>(
    initialValue.dietType ?? "No specific plan"
  );

  useEffect(() => {
    onChange({ dietType }, true);
  }, [dietType]);

  const handleSelect = (opt: string) => {
    setDietType((prev) => (prev === opt ? "" : opt));
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
        VALO
      </Text>

      <View style={styles.headingBlock}>
        <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          How do you eat?
        </Text>
        <Text style={[styles.subheading, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Valo uses this to give better nutrition context.
        </Text>
      </View>

      <ChipSelector
        options={DIET_OPTIONS}
        selected={dietType}
        onSelect={handleSelect}
        colors={colors}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 28 },
  valoLabel: { fontSize: 11, letterSpacing: 1.5 },
  headingBlock: { gap: 8 },
  heading: { fontSize: 22, lineHeight: 30 },
  subheading: { fontSize: 14, lineHeight: 22 },
});
