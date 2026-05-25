import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";

const MORE_OPTIONS = ["Energy", "Clarity", "Confidence", "Purpose", "Connection", "Peace", "Motivation"];
const LESS_OPTIONS = ["Stress", "Anxiety", "Distraction", "Guilt", "Fatigue", "Overwhelm"];

interface Props {
  onContinue: (data: Record<string, string>) => void;
  onSkip: () => void;
}

export default function StepWants({ onContinue, onSkip }: Props) {
  const colors = useColors();
  const [wantsMore, setWantsMore] = useState<string[]>([]);
  const [wantsLess, setWantsLess] = useState<string[]>([]);

  function toggleMore(item: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWantsMore((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
    );
  }

  function toggleLess(item: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWantsLess((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
    );
  }

  const canContinue = wantsMore.length > 0 || wantsLess.length > 0;

  function handleContinue() {
    if (!canContinue) return;
    const data: Record<string, string> = {};
    if (wantsMore.length > 0) data.userWantsMore = wantsMore.join(",");
    if (wantsLess.length > 0) data.userWantsLess = wantsLess.join(",");
    onContinue(data);
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        What do you want more of each day?
      </Text>

      <View style={styles.section}>
        <Text style={[styles.rowLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          MORE OF
        </Text>
        <View style={styles.chips}>
          {MORE_OPTIONS.map((item) => {
            const active = wantsMore.includes(item);
            return (
              <TouchableOpacity
                key={item}
                onPress={() => toggleMore(item)}
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
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.rowLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          LESS OF
        </Text>
        <View style={styles.chips}>
          {LESS_OPTIONS.map((item) => {
            const active = wantsLess.includes(item);
            return (
              <TouchableOpacity
                key={item}
                onPress={() => toggleLess(item)}
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
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.continueBtn,
          { backgroundColor: canContinue ? colors.primary : colors.muted },
        ]}
        onPress={handleContinue}
        disabled={!canContinue}
        activeOpacity={0.85}
      >
        <Text
          style={[
            styles.continueBtnText,
            {
              color: canContinue ? colors.primaryForeground : colors.mutedForeground,
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
  section: { gap: 10 },
  rowLabel: { fontSize: 11, letterSpacing: 0.8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
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
