import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";

interface Props {
  onContinue: (data: Record<string, string>) => void;
}

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
] as const;

function getDeviceLangCode(): string {
  try {
    const lang =
      typeof navigator !== "undefined" && navigator.language
        ? navigator.language.split("-")[0]
        : "en";
    return lang ?? "en";
  } catch {
    return "en";
  }
}

export default function StepLanguage({ onContinue }: Props) {
  const colors = useColors();
  const deviceCode = getDeviceLangCode();
  const defaultCode =
    LANGUAGES.find((l) => l.code === deviceCode)?.code ?? "en";
  const [selected, setSelected] = useState<string>(defaultCode);

  function handleContinue() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onContinue({ preferredLanguage: selected });
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
        VALO
      </Text>

      <View style={styles.headingBlock}>
        <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          What language do you prefer?
        </Text>
        <Text style={[styles.subheading, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Valo will use this when speaking with you.
        </Text>
      </View>

      <View style={styles.options}>
        {LANGUAGES.map((lang) => {
          const isSelected = selected === lang.code;
          return (
            <TouchableOpacity
              key={lang.code}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelected(lang.code);
              }}
              activeOpacity={0.8}
              style={[
                styles.option,
                {
                  backgroundColor: isSelected ? colors.primary : colors.card,
                  borderColor: isSelected ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.optionText,
                  {
                    color: isSelected ? colors.primaryForeground : colors.foreground,
                    fontFamily: isSelected ? "Inter_600SemiBold" : "Inter_400Regular",
                  },
                ]}
              >
                {lang.label}
              </Text>
              {isSelected && (
                <Feather name="check" size={16} color={colors.primaryForeground} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.continueBtn, { backgroundColor: colors.primary }]}
        onPress={handleContinue}
        activeOpacity={0.85}
      >
        <Text style={[styles.continueBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
          Continue
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 28 },
  valoLabel: { fontSize: 11, letterSpacing: 1.5 },
  headingBlock: { gap: 8 },
  heading: { fontSize: 22, lineHeight: 30 },
  subheading: { fontSize: 14, lineHeight: 22 },
  options: { gap: 10 },
  option: {
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionText: { fontSize: 16 },
  continueBtn: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  continueBtnText: { fontSize: 16 },
});
