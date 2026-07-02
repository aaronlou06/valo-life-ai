import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { requestHealthKitPermissions } from "@/lib/healthKit";
import { useHealthKitSync } from "@/hooks/useHealthKitSync";

interface Props {
  name: string;
  onComplete: () => void;
}

export default function StepConnect({ name, onComplete }: Props) {
  const colors = useColors();
  const { syncNow, isSyncing, isPermissionsGranted } = useHealthKitSync();
  const [healthConnected, setHealthConnected] = useState(false);

  const isConnected = isPermissionsGranted || healthConnected;

  const handleHealthKit = async () => {
    const granted = await requestHealthKitPermissions();
    if (granted) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setHealthConnected(true);
      await syncNow();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headingBlock}>
        <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
          VALO
        </Text>
        <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          Connect your health data.
        </Text>
        <Text style={[styles.subtext, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Apple Health gives Valo the context it needs to give you meaningful feedback on sleep, recovery, and daily activity.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardLeft}>
          <View style={[styles.cardIcon, { backgroundColor: colors.muted }]}>
            <Feather name="activity" size={20} color={colors.primary} />
          </View>
          <View style={styles.cardText}>
            <Text style={[styles.cardName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              Apple Health
            </Text>
            <Text style={[styles.cardDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Sleep, HRV, steps, recovery
            </Text>
          </View>
        </View>

        {isConnected ? (
          <View style={styles.connectedBadge}>
            <Feather name="check" size={14} color="#22C55E" />
            <Text style={[styles.connectedText, { fontFamily: "Inter_600SemiBold" }]}>
              Connected
            </Text>
          </View>
        ) : isSyncing ? (
          <Text style={[styles.syncingText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Syncing...
          </Text>
        ) : (
          <TouchableOpacity
            style={[styles.connectBtn, { backgroundColor: colors.primary }]}
            onPress={() => void handleHealthKit()}
            activeOpacity={0.8}
          >
            <Text style={[styles.connectBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
              Connect
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.calendarNote, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        Calendar and other connections are available in Profile after setup.
      </Text>

      <View style={styles.bottomActions}>
        <TouchableOpacity
          style={[styles.goBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onComplete();
          }}
          activeOpacity={0.85}
        >
          <Text style={[styles.goBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
            Continue
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onComplete} style={styles.skipBtn} activeOpacity={0.7}>
          <Text style={[styles.skipText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Skip for now
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 24 },
  headingBlock: { gap: 10 },
  valoLabel: { fontSize: 11, letterSpacing: 1.5 },
  heading: { fontSize: 24, lineHeight: 32 },
  subtext: { fontSize: 14, lineHeight: 22 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cardLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  cardIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardText: { flex: 1, gap: 3 },
  cardName: { fontSize: 16 },
  cardDesc: { fontSize: 13, lineHeight: 18 },
  connectedBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  connectedText: { color: "#22C55E", fontSize: 13 },
  connectBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  connectBtnText: { fontSize: 13 },
  syncingText: { fontSize: 13 },
  calendarNote: { fontSize: 12, lineHeight: 18, textAlign: "center" },
  bottomActions: { gap: 12, marginTop: 8 },
  goBtn: { height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  goBtnText: { fontSize: 16 },
  skipBtn: { alignItems: "center", paddingVertical: 6 },
  skipText: { fontSize: 14 },
});
