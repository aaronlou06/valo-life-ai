import React, { useState, useEffect } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  initialValue: Record<string, any>;
  onChange: (data: Record<string, any>, valid: boolean) => void;
}

export default function Step4Motivation({ initialValue, onChange }: Props) {
  const colors = useColors();
  const [motivation, setMotivation] = useState<string>(initialValue.userMotivation ?? "");

  useEffect(() => {
    onChange({ userMotivation: motivation.trim() }, motivation.trim().length > 0);
  }, [motivation]);

  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
          Valo
        </Text>
        <Text style={[styles.question, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          What keeps you going?
        </Text>
        <Text style={[styles.subtext, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Your deepest reason — the one that doesn't fade.
        </Text>
      </View>

      <TextInput
        value={motivation}
        onChangeText={setMotivation}
        placeholder="I want to be someone my family is proud of. I want to prove I can..."
        placeholderTextColor={colors.mutedForeground}
        autoFocus
        multiline
        numberOfLines={5}
        style={[styles.textarea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 28 },
  bubble: { gap: 10 },
  valoLabel: { fontSize: 13, letterSpacing: 0.5 },
  question: { fontSize: 26, lineHeight: 34 },
  subtext: { fontSize: 15, lineHeight: 22 },
  textarea: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    lineHeight: 24,
    textAlignVertical: "top",
  },
});
