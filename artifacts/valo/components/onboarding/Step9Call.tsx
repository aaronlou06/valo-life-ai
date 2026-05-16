import React, { useState, useEffect } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import TimePickerInline from "./TimePickerInline";

interface Props {
  initialValue: Record<string, any>;
  onChange: (data: Record<string, any>, valid: boolean) => void;
}

export default function Step9Call({ initialValue, onChange }: Props) {
  const colors = useColors();
  const [callTime, setCallTime] = useState<string>(initialValue.preferredCallTime ?? "20:00");
  const [phoneNumber, setPhoneNumber] = useState<string>(initialValue.phoneNumber ?? "");

  useEffect(() => {
    onChange(
      {
        preferredCallTime: callTime,
        phoneNumber: phoneNumber.trim() || null,
        callsEnabled: phoneNumber.trim().length > 0,
        callTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      true
    );
  }, [callTime, phoneNumber]);

  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
          Valo
        </Text>
        <Text style={[styles.question, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Set up your evening debrief
        </Text>
        <Text style={[styles.subtext, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Each evening, Valo will call to reflect on the day together. You can always change this in Settings.
        </Text>
      </View>

      <View style={styles.fields}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            CALL TIME
          </Text>
          <TimePickerInline value={callTime} onChange={setCallTime} colors={colors} />
        </View>

        <View>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            PHONE NUMBER
          </Text>
          <TextInput
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="+1 555 000 0000"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="phone-pad"
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
          />
          <Text style={[styles.hint, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Include country code. Optional — you can add this later.
          </Text>
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
  fields: { gap: 20 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  cardLabel: { fontSize: 11, letterSpacing: 0.8 },
  fieldLabel: { fontSize: 11, letterSpacing: 0.8, marginBottom: 10 },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  hint: { fontSize: 12, marginTop: 8 },
});
