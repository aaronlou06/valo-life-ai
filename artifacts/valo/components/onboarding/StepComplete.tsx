import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useColors } from "@/hooks/useColors";

function formatCallTime(hhmm: string | null | undefined): string {
  if (!hhmm) return "your preferred time";
  const [h, m] = hhmm.split(":").map(Number);
  const period = (h ?? 0) >= 12 ? "PM" : "AM";
  const hour = (h ?? 0) % 12 || 12;
  return `${hour}:${String(m ?? 0).padStart(2, "0")} ${period}`;
}

interface Props {
  name?: string;
  callTime?: string | null;
  loading?: boolean;
  onGo: () => void;
  onFirstCheckin?: () => void;
}

export default function StepComplete({ name, callTime, loading, onGo, onFirstCheckin }: Props) {
  const colors = useColors();
  const firstName = name?.split(" ")[0] || "there";
  const displayTime = formatCallTime(callTime);

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
          VALO
        </Text>
        <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          {`You're all set, ${firstName}.`}
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {`Your first check-in is set for ${displayTime}.`}
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {"I'll get to know you as we go. Talk soon."}
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.goBtn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
          onPress={onGo}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <Text style={[styles.goBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
              Go to Valo
            </Text>
          )}
        </TouchableOpacity>

        {!!onFirstCheckin && !loading && (
          <TouchableOpacity onPress={onFirstCheckin} style={styles.checkinBtn} activeOpacity={0.7}>
            <Text style={[styles.checkinText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
              Start your first check-in now
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 40, paddingTop: 24 },
  top: { gap: 16 },
  valoLabel: { fontSize: 11, letterSpacing: 1.5 },
  heading: { fontSize: 26, lineHeight: 34 },
  body: { fontSize: 16, lineHeight: 26 },
  actions: { gap: 16 },
  goBtn: { height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  goBtnText: { fontSize: 16 },
  checkinBtn: { alignItems: "center", paddingVertical: 8 },
  checkinText: { fontSize: 15 },
});
