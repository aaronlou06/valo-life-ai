import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  question: string;
  placeholder?: string;
  field: string;
  optional?: boolean;
  onContinue: (data: Record<string, string>) => void;
  onSkip: () => void;
}

export default function StepOpenText({
  question,
  placeholder = "In your own words...",
  field,
  optional = true,
  onContinue,
  onSkip,
}: Props) {
  const colors = useColors();
  const [text, setText] = useState("");

  const trimmed = text.trim();
  const hasText = trimmed.length > 0;

  function handleContinue() {
    if (hasText) {
      onContinue({ [field]: trimmed });
    } else {
      onSkip();
    }
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
        VALO
      </Text>
      <Text style={[styles.question, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
        {question}
      </Text>
      {optional && (
        <Text style={[styles.hint, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Optional — share as much or as little as you like.
        </Text>
      )}

      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        multiline
        style={[
          styles.input,
          {
            color: colors.foreground,
            borderColor: text.length > 0 ? colors.primary : colors.border,
            backgroundColor: colors.card,
            fontFamily: "Inter_400Regular",
          },
        ]}
        returnKeyType="done"
        blurOnSubmit
        autoFocus
      />

      <TouchableOpacity
        style={[styles.continueBtn, { backgroundColor: colors.primary }]}
        onPress={handleContinue}
        activeOpacity={0.85}
      >
        <Text style={[styles.continueBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
          {hasText ? "Continue" : "Skip"}
        </Text>
      </TouchableOpacity>

      {optional && (
        <TouchableOpacity onPress={onSkip} style={styles.skipBtn} activeOpacity={0.7}>
          <Text style={[styles.skipText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Skip
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 20, paddingTop: 8 },
  valoLabel: { fontSize: 11, letterSpacing: 1.5 },
  question: { fontSize: 24, lineHeight: 32 },
  hint: { fontSize: 14, lineHeight: 20, marginTop: -8 },
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
    marginTop: 4,
  },
  continueBtnText: { fontSize: 16 },
  skipBtn: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 24 },
  skipText: { fontSize: 14, textDecorationLine: "underline" },
});
