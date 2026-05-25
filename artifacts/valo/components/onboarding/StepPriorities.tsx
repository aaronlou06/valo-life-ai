import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";

const PRIORITIES = [
  "Health & Fitness",
  "Mental Wellbeing",
  "Career & Performance",
  "Relationships",
  "Faith & Spirituality",
  "Financial Goals",
  "Personal Growth",
  "Family",
];

interface Props {
  onContinue: (data: Record<string, string>) => void;
  onSkip: () => void;
}

export default function StepPriorities({ onContinue, onSkip }: Props) {
  const colors = useColors();
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(item: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected((prev) => {
      if (prev.includes(item)) return prev.filter((x) => x !== item);
      if (prev.length >= 3) return prev;
      return [...prev, item];
    });
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        What matters most to you right now?
      </Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        Pick up to 3. Valo focuses on what you care about.
      </Text>

      <View style={styles.chips}>
        {PRIORITIES.map((p) => {
          const active = selected.includes(p);
          return (
            <TouchableOpacity
              key={p}
              onPress={() => toggle(p)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.primary : colors.card,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color: active ? colors.primaryForeground : colors.foreground,
                    fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular",
                  },
                ]}
              >
                {p}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[
          styles.continueBtn,
          { backgroundColor: selected.length > 0 ? colors.primary : colors.muted },
        ]}
        onPress={() => selected.length > 0 && onContinue({ lifePriorities: selected.join(",") })}
        disabled={selected.length === 0}
        activeOpacity={0.85}
      >
        <Text
          style={[
            styles.continueBtnText,
            {
              color: selected.length > 0 ? colors.primaryForeground : colors.mutedForeground,
              fontFamily: "Inter_600SemiBold",
            },
          ]}
        >
          Continue
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onSkip} style={styles.skipBtn} activeOpacity={0.7}>
        <Text style={[styles.skipText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Skip
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 20, paddingTop: 8 },
  title: { fontSize: 26, lineHeight: 34 },
  subtitle: { fontSize: 15, lineHeight: 23 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
  },
  chipText: { fontSize: 14 },
  continueBtn: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  continueBtnText: { fontSize: 16 },
  skipBtn: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 24 },
  skipText: { fontSize: 14, textDecorationLine: "underline" },
});
