import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import ChipSelector from "./ChipSelector";

const OPTIONS = [
  "Health", "Family", "Career", "Fitness", "Relationships",
  "Creativity", "Learning", "Finance", "Spirituality", "Personal growth",
];

interface Props {
  initialValue: Record<string, any>;
  onChange: (data: Record<string, any>, valid: boolean) => void;
}

export default function Step2Priorities({ initialValue, onChange }: Props) {
  const colors = useColors();
  const [selected, setSelected] = useState<string[]>(() => {
    const raw = initialValue.userPriorities ?? "";
    return raw ? raw.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
  });

  useEffect(() => {
    const userPriorities = selected.join(", ");
    onChange({ userPriorities }, selected.length > 0);
  }, [selected]);

  const toggle = (opt: string) => {
    setSelected((prev) =>
      prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
          Valo
        </Text>
        <Text style={[styles.question, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          What matters most to you right now?
        </Text>
        <Text style={[styles.subtext, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Choose everything that feels alive for you today.
        </Text>
      </View>

      <ChipSelector
        options={OPTIONS}
        selected={selected}
        onSelect={toggle}
        multi
        colors={colors}
      />

      {selected.length > 0 && (
        <Text style={[styles.hint, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {selected.length} selected
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 28 },
  bubble: { gap: 10 },
  valoLabel: { fontSize: 13, letterSpacing: 0.5 },
  question: { fontSize: 26, lineHeight: 34 },
  subtext: { fontSize: 15, lineHeight: 22 },
  hint: { fontSize: 13 },
});
