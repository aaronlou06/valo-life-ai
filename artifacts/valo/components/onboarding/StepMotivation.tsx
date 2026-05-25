import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  onContinue: (data: Record<string, string>) => void;
  onSkip: () => void;
}

export default function StepMotivation({ onContinue, onSkip }: Props) {
  const colors = useColors();
  const [text, setText] = useState("");

  function handleContinue() {
    if (!text.trim()) {
      onSkip();
      return;
    }
    onContinue({ userMotivation: text.trim() });
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.outer}>
      <View style={styles.container}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          What keeps you going when things get hard?
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Optional. This helps Valo understand what drives you.
        </Text>

        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="In your own words..."
          placeholderTextColor={colors.mutedForeground}
          multiline
          style={[
            styles.input,
            {
              color: colors.foreground,
              borderColor: colors.border,
              backgroundColor: colors.card,
              fontFamily: "Inter_400Regular",
            },
          ]}
          returnKeyType="done"
          blurOnSubmit
        />

        <TouchableOpacity
          style={[styles.continueBtn, { backgroundColor: colors.primary }]}
          onPress={handleContinue}
          activeOpacity={0.85}
        >
          <Text style={[styles.continueBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
            {text.trim() ? "Continue" : "Skip"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onSkip} style={styles.skipBtn} activeOpacity={0.7}>
          <Text style={[styles.skipText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Skip
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1 },
  container: { gap: 20, paddingTop: 8 },
  title: { fontSize: 26, lineHeight: 34 },
  subtitle: { fontSize: 15, lineHeight: 23 },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 120,
    textAlignVertical: "top",
  },
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
