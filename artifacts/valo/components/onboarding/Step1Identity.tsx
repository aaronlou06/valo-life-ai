import React, { useState, useEffect } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  initialValue: Record<string, any>;
  onChange: (data: Record<string, any>, valid: boolean) => void;
}

export default function Step1Identity({ initialValue, onChange }: Props) {
  const colors = useColors();
  const [name, setName] = useState<string>(initialValue.name ?? "");
  const [userIdentity, setUserIdentity] = useState<string>(initialValue.userIdentity ?? "");

  useEffect(() => {
    onChange({ name: name.trim(), userIdentity: userIdentity.trim() }, name.trim().length > 0);
  }, [name, userIdentity]);

  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
          Valo
        </Text>
        <Text style={[styles.question, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {"Hi, I'm Valo — your personal AI companion.\n\nWhat's your name?"}
        </Text>
      </View>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Your first name"
        placeholderTextColor={colors.mutedForeground}
        autoFocus
        returnKeyType="next"
        style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
      />

      <View style={styles.secondBubble}>
        <Text style={[styles.subQuestion, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          And what kind of person are you working to become?
        </Text>
        <TextInput
          value={userIdentity}
          onChangeText={setUserIdentity}
          placeholder="Someone who shows up with intention and builds something real..."
          placeholderTextColor={colors.mutedForeground}
          multiline
          numberOfLines={4}
          style={[styles.textarea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 24 },
  bubble: { gap: 10 },
  valoLabel: { fontSize: 13, letterSpacing: 0.5 },
  question: { fontSize: 26, lineHeight: 34 },
  secondBubble: { gap: 12 },
  subQuestion: { fontSize: 15, lineHeight: 22 },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  textarea: {
    minHeight: 100,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    lineHeight: 24,
    textAlignVertical: "top",
  },
});
