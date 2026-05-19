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

  useEffect(() => {
    onChange({ name: name.trim() }, name.trim().length > 0);
  }, [name]);

  return (
    <View style={styles.container}>
      <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
        VALO
      </Text>

      <View style={styles.headingBlock}>
        <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          Let's start with you.
        </Text>
        <Text style={[styles.subheading, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Just your name to get started — Valo will learn everything else through conversation.
        </Text>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          First name
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="What should Valo call you?"
          placeholderTextColor={colors.mutedForeground}
          autoFocus
          returnKeyType="done"
          style={[
            styles.input,
            {
              color: colors.foreground,
              borderColor: colors.border,
              backgroundColor: colors.card,
              fontFamily: "Inter_400Regular",
            },
          ]}
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
  fieldGroup: { gap: 10 },
  fieldLabel: { fontSize: 13, lineHeight: 18 },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
  },
});
