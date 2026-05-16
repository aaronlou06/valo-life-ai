import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

interface Props {
  value: string;
  onChange: (v: string) => void;
  colors: any;
}

export default function TimePickerInline({ value, onChange, colors }: Props) {
  const parts = value.split(":");
  const hh = parseInt(parts[0] ?? "20", 10);
  const mm = parseInt(parts[1] ?? "0", 10);

  const setHH = (h: number) => {
    const clamped = ((h % 24) + 24) % 24;
    onChange(`${String(clamped).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  };

  const setMM = (m: number) => {
    const clamped = ((m % 60) + 60) % 60;
    onChange(`${String(hh).padStart(2, "0")}:${String(clamped).padStart(2, "0")}`);
  };

  const bump = (fn: (n: number) => void, n: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fn(n);
  };

  return (
    <View style={styles.row}>
      <View style={styles.col}>
        <TouchableOpacity
          onPress={() => bump(setHH, hh + 1)}
          style={[styles.btn, { borderColor: colors.border }]}
        >
          <Feather name="chevron-up" size={18} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.digit, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {String(hh).padStart(2, "0")}
        </Text>
        <TouchableOpacity
          onPress={() => bump(setHH, hh - 1)}
          style={[styles.btn, { borderColor: colors.border }]}
        >
          <Feather name="chevron-down" size={18} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.colon, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>:</Text>

      <View style={styles.col}>
        <TouchableOpacity
          onPress={() => bump(setMM, mm + 5)}
          style={[styles.btn, { borderColor: colors.border }]}
        >
          <Feather name="chevron-up" size={18} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.digit, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {String(mm).padStart(2, "0")}
        </Text>
        <TouchableOpacity
          onPress={() => bump(setMM, mm - 5)}
          style={[styles.btn, { borderColor: colors.border }]}
        >
          <Feather name="chevron-down" size={18} color={colors.foreground} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  col: { alignItems: "center", gap: 6 },
  btn: {
    width: 48,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  digit: { fontSize: 34, lineHeight: 42 },
  colon: { fontSize: 34, marginBottom: 4 },
});
