import React, { useState } from "react";
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";

const SOURCES = [
  { id: "friend", label: "A friend referred me" },
  { id: "social", label: "Social media" },
  { id: "search", label: "App Store / Search" },
  { id: "podcast", label: "Podcast or article" },
  { id: "other", label: "Other" },
];

interface Props {
  onContinue: (data: { referralSource: string; referralCode?: string }) => void;
  onSkip: () => void;
}

export default function StepReferralSource({ onContinue, onSkip }: Props) {
  const colors = useColors();
  const [selected, setSelected] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState("");

  function handleContinue() {
    if (!selected) return;
    onContinue({
      referralSource: selected,
      referralCode: selected === "friend" && referralCode.trim() ? referralCode.trim() : undefined,
    });
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        How did you hear about Valo?
      </Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        Helps us know where to focus
      </Text>

      <View style={styles.options}>
        {SOURCES.map((src) => {
          const isActive = selected === src.id;
          return (
            <TouchableOpacity
              key={src.id}
              onPress={() => setSelected(src.id)}
              activeOpacity={0.75}
              style={[
                styles.option,
                {
                  backgroundColor: isActive ? colors.primary : colors.card,
                  borderColor: isActive ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.optionText,
                  {
                    color: isActive ? colors.primaryForeground : colors.foreground,
                    fontFamily: isActive ? "Inter_600SemiBold" : "Inter_400Regular",
                  },
                ]}
              >
                {src.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {selected === "friend" && (
        <View style={[styles.codeBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.codeLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            Referral code (optional)
          </Text>
          <TextInput
            style={[styles.codeInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
            placeholder="e.g. AB12CD34"
            placeholderTextColor={colors.mutedForeground}
            value={referralCode}
            onChangeText={setReferralCode}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          onPress={handleContinue}
          disabled={!selected}
          activeOpacity={0.85}
          style={[
            styles.continueBtn,
            { backgroundColor: selected ? colors.primary : colors.muted },
          ]}
        >
          <Text
            style={[
              styles.continueBtnText,
              {
                color: selected ? colors.primaryForeground : colors.mutedForeground,
                fontFamily: "Inter_600SemiBold",
              },
            ]}
          >
            Continue
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onSkip} activeOpacity={0.7}>
          <Text style={[styles.skipText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Skip
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 8 },
  title: { fontSize: 26, lineHeight: 34, marginBottom: 8 },
  subtitle: { fontSize: 15, marginBottom: 28 },
  options: { gap: 10, marginBottom: 24 },
  option: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  optionText: { fontSize: 15 },
  codeBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 24,
    gap: 6,
  },
  codeLabel: { fontSize: 12 },
  codeInput: { fontSize: 16, letterSpacing: 1 },
  actions: { gap: 12 },
  continueBtn: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  continueBtnText: { fontSize: 16 },
  skipText: { textAlign: "center", fontSize: 14, paddingVertical: 8 },
});
