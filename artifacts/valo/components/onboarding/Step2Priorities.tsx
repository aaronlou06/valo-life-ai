import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import ChipSelector from "./ChipSelector";

const OPTIONS = [
  "Health & fitness",
  "Mental clarity",
  "Relationships",
  "Faith & spirituality",
  "Career & purpose",
  "Family",
  "Personal growth",
  "Financial goals",
];

const MAX_SELECT = 3;

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
    onChange({ userPriorities: selected.join(", ") }, selected.length > 0);
  }, [selected]);

  const toggle = (opt: string) => {
    setSelected((prev) =>
      prev.includes(opt)
        ? prev.filter((x) => x !== opt)
        : prev.length >= MAX_SELECT
        ? prev
        : [...prev, opt]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
        VALO
      </Text>

      <View style={styles.headingBlock}>
        <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          What matters most to you right now?
        </Text>
        <Text style={[styles.subheading, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Pick up to 3. Valo focuses here first.
        </Text>
      </View>

      <ChipSelector
        options={OPTIONS}
        selected={selected}
        onSelect={toggle}
        multi
        colors={colors}
      />

      {selected.length >= MAX_SELECT && (
        <Text style={[styles.maxNote, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Maximum 3 selected. Tap one to remove it.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 28 },
  valoLabel: { fontSize: 11, letterSpacing: 1.5 },
  headingBlock: { gap: 8 },
  heading: { fontSize: 22, lineHeight: 30 },
  subheading: { fontSize: 14, lineHeight: 22 },
  maxNote: { fontSize: 12, lineHeight: 18 },
});
