import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
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

  const firstName = name.split(" ")[0] || "there";

  const isHealthConnected = isPermissionsGranted || healthConnected;

  const handleHealthKit = async () => {
    const granted = await requestHealthKitPermissions();
    if (granted) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setHealthConnected(true);
      await syncNow();
    }
  };

  const connections = [
    {
      icon: "activity" as const,
      name: "Apple Health",
      description: "Sleep, HRV, steps, recovery",
      connected: isHealthConnected,
      syncing: isSyncing,
      onConnect: handleHealthKit,
    },
    {
      icon: "calendar" as const,
      name: "Apple Calendar",
      description: "Your schedule, meetings, events",
      connected: false,
      onConnect: () => Alert.alert("Coming soon", "Apple Calendar integration is coming soon."),
    },
    {
      icon: "globe" as const,
      name: "Google Calendar",
      description: "Your Google schedule",
      connected: false,
      onConnect: () => Alert.alert("Coming soon", "Google Calendar integration is coming soon."),
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.headingBlock}>
        <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
          VALO
        </Text>
        <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          You're set up, {firstName}.
        </Text>
        <Text style={[styles.subtext, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Connect your devices to unlock Valo's full potential.
        </Text>
      </View>

      <View style={styles.cards}>
        {connections.map((conn) => (
          <View
            key={conn.name}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.cardLeft}>
              <View style={[styles.cardIcon, { backgroundColor: colors.muted }]}>
                <Feather name={conn.icon} size={18} color={colors.primary} />
              </View>
              <View style={styles.cardText}>
                <Text style={[styles.cardName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                  {conn.name}
                </Text>
                <Text style={[styles.cardDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {conn.description}
                </Text>
              </View>
            </View>
            {conn.connected ? (
              <View style={styles.connectedBadge}>
                <Feather name="check" size={14} color="#22C55E" />
                <Text style={[styles.connectedText, { fontFamily: "Inter_600SemiBold" }]}>
                  Connected
                </Text>
              </View>
            ) : ("syncing" in conn && conn.syncing) ? (
              <Text style={[styles.syncingText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Syncing…
              </Text>
            ) : (
              <TouchableOpacity
                style={[styles.connectBtn, { backgroundColor: colors.primary }]}
                onPress={conn.onConnect}
                activeOpacity={0.8}
              >
                <Text style={[styles.connectBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                  Connect
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>

      <View style={styles.bottomActions}>
        <TouchableOpacity
          style={[styles.goBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onComplete();
          }}
          activeOpacity={0.85}
        >
          <Text style={[styles.goBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
            Go to Valo
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
  container: { gap: 28 },
  headingBlock: { gap: 10 },
  valoLabel: { fontSize: 11, letterSpacing: 1.5 },
  heading: { fontSize: 24, lineHeight: 32 },
  subtext: { fontSize: 15, lineHeight: 22 },

  cards: { gap: 10 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cardLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  cardIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardText: { flex: 1, gap: 2 },
  cardName: { fontSize: 15 },
  cardDesc: { fontSize: 12, lineHeight: 17 },
  connectedBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  connectedText: { color: "#22C55E", fontSize: 13 },
  connectBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  connectBtnText: { fontSize: 13 },
  syncingText: { fontSize: 13 },

  bottomActions: { gap: 12, marginTop: 8 },
  goBtn: { height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  goBtnText: { fontSize: 16 },
  skipBtn: { alignItems: "center", paddingVertical: 6 },
  skipText: { fontSize: 14 },
});
