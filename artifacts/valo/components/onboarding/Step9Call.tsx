import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Switch, StyleSheet, Platform } from "react-native";
import { useColors } from "@/hooks/useColors";
import TimePickerInline from "./TimePickerInline";

interface Props {
  initialValue: Record<string, any>;
  onChange: (data: Record<string, any>, valid: boolean) => void;
}

export default function Step9Call({ initialValue, onChange }: Props) {
  const colors = useColors();
  const [callTime, setCallTime] = useState<string>(initialValue.preferredCallTime ?? "20:30");
  const [phoneNumber, setPhoneNumber] = useState<string>(initialValue.phoneNumber ?? "");
  const [callsEnabled, setCallsEnabled] = useState<boolean>(
    initialValue.callsEnabled !== undefined ? initialValue.callsEnabled : true
  );

  useEffect(() => {
    onChange(
      {
        preferredCallTime: callTime,
        phoneNumber: phoneNumber.trim() || null,
        callsEnabled,
        callTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      true
    );
  }, [callTime, phoneNumber, callsEnabled]);

  return (
    <View style={styles.container}>
      <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
        VALO
      </Text>

      <View style={styles.headingBlock}>
        <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          When should Valo call you each evening?
        </Text>
        <Text style={[styles.subheading, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          This is the most important setting. Valo will call you at this time every day.
        </Text>
      </View>

      <View style={styles.fields}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            Daily check-in time
          </Text>
          <TimePickerInline value={callTime} onChange={setCallTime} colors={colors} />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            Your phone number
          </Text>
          <TextInput
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="+1 (555) 000-0000"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="phone-pad"
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
          />
          <Text style={[styles.note, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Valo calls this number. It is never shared.
          </Text>
        </View>

        <View style={[styles.toggleRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.toggleLabel, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
            Enable daily calls
          </Text>
          <Switch
            value={callsEnabled}
            onValueChange={setCallsEnabled}
            trackColor={{ false: colors.muted, true: colors.primary }}
            thumbColor={Platform.OS === "android" ? colors.primaryForeground : undefined}
          />
        </View>
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
  fields: { gap: 20 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  cardLabel: { fontSize: 13, lineHeight: 18 },
  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 13, lineHeight: 18 },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  note: { fontSize: 12, lineHeight: 18 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  toggleLabel: { fontSize: 15 },
});
