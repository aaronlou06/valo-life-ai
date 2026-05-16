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
    onChange({ userMotivation: motivation.trim() }, true);
  }, [motivation]);

  return (
    <View style={styles.container}>
      <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
        VALO
      </Text>

      <View style={styles.headingBlock}>
        <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          What keeps you going when things get hard?
        </Text>
        <Text style={[styles.subheading, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Valo will use your own words to encourage you on difficult days.
        </Text>
      </View>

      <View style={styles.fieldGroup}>
        <TextInput
          value={motivation}
          onChangeText={setMotivation}
          placeholder={"e.g. My family. Or — I refuse to be the person I used to be. Or — Knowing I'll regret it if I don't."}
          placeholderTextColor={colors.mutedForeground}
          autoFocus
          multiline
          numberOfLines={5}
          style={[styles.textarea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
        />
        <Text style={[styles.note, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          This goes directly to Valo — it will remember it.
        </Text>
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
  fieldGroup: { gap: 10 },
  textarea: {
    minHeight: 100,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: "top",
  },
  note: { fontSize: 12, lineHeight: 18 },
});
