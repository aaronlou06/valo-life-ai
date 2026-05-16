import React, { useState, useEffect } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  initialValue: Record<string, any>;
  onChange: (data: Record<string, any>, valid: boolean) => void;
}

export default function Step3Feelings({ initialValue, onChange }: Props) {
  const colors = useColors();
  const [more, setMore] = useState<string>(initialValue.userWantsMore ?? "");
  const [less, setLess] = useState<string>(initialValue.userWantsLess ?? "");

  useEffect(() => {
    const valid = more.trim().length > 0 || less.trim().length > 0;
    onChange({ userWantsMore: more.trim(), userWantsLess: less.trim() }, valid);
  }, [more, less]);

  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
          Valo
        </Text>
        <Text style={[styles.question, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {"What do you want more of —\nand less of?"}
        </Text>
        <Text style={[styles.subtext, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Valo will track these as you grow.
        </Text>
      </View>

      <View style={styles.fields}>
        <View>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            MORE OF
          </Text>
          <TextInput
            value={more}
            onChangeText={setMore}
            placeholder="Focus, joy, presence, connection..."
            placeholderTextColor={colors.mutedForeground}
            autoFocus
            multiline
            numberOfLines={3}
            style={[styles.textarea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
          />
        </View>

        <View>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            LESS OF
          </Text>
          <TextInput
            value={less}
            onChangeText={setLess}
            placeholder="Stress, distraction, overthinking..."
            placeholderTextColor={colors.mutedForeground}
            multiline
            numberOfLines={3}
            style={[styles.textarea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 28 },
  bubble: { gap: 10 },
  valoLabel: { fontSize: 13, letterSpacing: 0.5 },
  question: { fontSize: 26, lineHeight: 34 },
  subtext: { fontSize: 15, lineHeight: 22 },
  fields: { gap: 18 },
  fieldLabel: { fontSize: 11, letterSpacing: 0.8, marginBottom: 8 },
  textarea: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    lineHeight: 24,
    textAlignVertical: "top",
  },
});
