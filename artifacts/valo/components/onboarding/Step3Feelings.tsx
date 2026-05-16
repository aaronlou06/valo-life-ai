import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import ChipSelector from "./ChipSelector";

const MORE_OPTIONS = [
  "Energy", "Clarity", "Purpose", "Confidence",
  "Peace", "Connection", "Motivation", "Presence",
];

const LESS_OPTIONS = [
  "Stress", "Anxiety", "Distraction", "Fatigue",
  "Guilt", "Overwhelm", "Reactivity", "Isolation",
];

interface Props {
  initialValue: Record<string, any>;
  onChange: (data: Record<string, any>, valid: boolean) => void;
}

export default function Step3Feelings({ initialValue, onChange }: Props) {
  const colors = useColors();

  const [moreSelected, setMoreSelected] = useState<string[]>(() => {
    const raw = initialValue.userWantsMore ?? "";
    return raw ? raw.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
  });

  const [lessSelected, setLessSelected] = useState<string[]>(() => {
    const raw = initialValue.userWantsLess ?? "";
    return raw ? raw.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
  });

  useEffect(() => {
    onChange(
      {
        userWantsMore: moreSelected.join(", "),
        userWantsLess: lessSelected.join(", "),
      },
      true
    );
  }, [moreSelected, lessSelected]);

  const toggleMore = (opt: string) =>
    setMoreSelected((prev) =>
      prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
    );

  const toggleLess = (opt: string) =>
    setLessSelected((prev) =>
      prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
    );

  return (
    <View style={styles.container}>
      <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
        VALO
      </Text>

      <View style={styles.headingBlock}>
        <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          What do you want more of? Less of?
        </Text>
        <Text style={[styles.subheading, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Tap everything that resonates.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          MORE OF
        </Text>
        <ChipSelector
          options={MORE_OPTIONS}
          selected={moreSelected}
          onSelect={toggleMore}
          multi
          colors={colors}
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          LESS OF
        </Text>
        <ChipSelector
          options={LESS_OPTIONS}
          selected={lessSelected}
          onSelect={toggleLess}
          multi
          colors={colors}
        />
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
  section: { gap: 12 },
  sectionLabel: { fontSize: 11, letterSpacing: 0.8 },
});
