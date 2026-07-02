import React, { useState, useEffect } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1924;
const MAX_YEAR = CURRENT_YEAR - 13;

function validateBirthYear(raw: string): { valid: boolean; tooYoung: boolean } {
  if (!raw || raw.length < 4) return { valid: false, tooYoung: false };
  const year = parseInt(raw, 10);
  if (isNaN(year)) return { valid: false, tooYoung: false };
  if (year > MAX_YEAR) return { valid: false, tooYoung: true };
  if (year < MIN_YEAR) return { valid: false, tooYoung: false };
  return { valid: true, tooYoung: false };
}

interface Props {
  initialValue: Record<string, unknown>;
  onChange: (data: Record<string, unknown>, valid: boolean) => void;
}

export default function Step1Identity({ initialValue, onChange }: Props) {
  const colors = useColors();
  const [name, setName] = useState<string>((initialValue.name as string) ?? "");
  const [birthYear, setBirthYear] = useState<string>("");
  const [yearTouched, setYearTouched] = useState(false);

  useEffect(() => {
    const nameTrimmed = name.trim();
    const { valid: yearValid } = validateBirthYear(birthYear);
    const isValid = nameTrimmed.length > 0 && yearValid;
    const data: Record<string, unknown> = { name: nameTrimmed };
    if (yearValid) {
      data.birthday = `${birthYear}-01-01`;
    }
    onChange(data, isValid);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, birthYear]);

  const { tooYoung } = validateBirthYear(birthYear);
  const showYearError = yearTouched && birthYear.length === 4 && !validateBirthYear(birthYear).valid;

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
          Just a couple of quick details to get started.
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
          returnKeyType="next"
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

      <View style={styles.fieldGroup}>
        <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          Birth year
        </Text>
        <TextInput
          value={birthYear}
          onChangeText={(v) => {
            setBirthYear(v.replace(/\D/g, "").slice(0, 4));
            setYearTouched(true);
          }}
          placeholder={String(CURRENT_YEAR - 30)}
          placeholderTextColor={colors.mutedForeground}
          keyboardType="number-pad"
          maxLength={4}
          returnKeyType="done"
          style={[
            styles.input,
            {
              color: colors.foreground,
              borderColor: showYearError ? "#D4473E" : colors.border,
              backgroundColor: colors.card,
              fontFamily: "Inter_400Regular",
            },
          ]}
        />
        {showYearError && (
          <Text style={[styles.errorText, { fontFamily: "Inter_400Regular" }]}>
            {tooYoung
              ? "You must be at least 13 years old to use Valo."
              : `Please enter a valid birth year (${MIN_YEAR}\u2013${MAX_YEAR}).`}
          </Text>
        )}
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
  errorText: { fontSize: 13, color: "#D4473E", lineHeight: 18 },
});
