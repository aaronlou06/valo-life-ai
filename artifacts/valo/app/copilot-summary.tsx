import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";

function fmtDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0 && s > 0) return `${m}m ${s}s`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function fmtTonnage(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} t`;
  return `${kg} kg`;
}

type StatTileProps = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
};

function StatTile({ icon, label, value, colors }: StatTileProps) {
  return (
    <View style={[statStyles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[statStyles.iconWrap, { backgroundColor: colors.secondary }]}>
        <Feather name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={[statStyles.value, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        {value}
      </Text>
      <Text style={[statStyles.label, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        {label}
      </Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    alignItems: "center",
    gap: 6,
    minWidth: 90,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  value: { fontSize: 22 },
  label: { fontSize: 12, textAlign: "center" },
});

export default function CopilotSummaryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    sessionId?: string;
    name?: string;
    durationSec?: string;
    totalSets?: string;
    tonnageKg?: string;
    prNames?: string;
  }>();

  const name = params.name ?? "Workout";
  const durationSec = parseInt(params.durationSec ?? "0", 10);
  const totalSets = parseInt(params.totalSets ?? "0", 10);
  const tonnageKg = parseInt(params.tonnageKg ?? "0", 10);
  const prNames = params.prNames
    ? params.prNames.split(",").filter(Boolean)
    : [];

  function handleDone() {
    router.replace("/(tabs)" as never);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Trophy icon */}
        <View style={[styles.trophyWrap, { backgroundColor: "#F5DDD8" }]}>
          <Feather name="award" size={36} color="#A06050" />
        </View>

        <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Session complete
        </Text>
        <Text style={[styles.subheading, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {name}
        </Text>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatTile icon="clock" label="Duration" value={fmtDuration(durationSec)} colors={colors} />
          <StatTile icon="layers" label="Sets" value={String(totalSets)} colors={colors} />
          {tonnageKg > 0 && (
            <StatTile icon="trending-up" label="Volume" value={fmtTonnage(tonnageKg)} colors={colors} />
          )}
        </View>

        {/* Personal records */}
        {prNames.length > 0 && (
          <View style={[styles.prCard, { backgroundColor: "#F5DDD8", borderColor: "#E8C8B8" }]}>
            <View style={styles.prHeader}>
              <Feather name="star" size={16} color="#A06050" />
              <Text style={[styles.prTitle, { color: "#7A4030", fontFamily: "Inter_700Bold" }]}>
                New personal records
              </Text>
            </View>
            {prNames.map((pr, i) => (
              <View key={i} style={styles.prRow}>
                <View style={[styles.prDot, { backgroundColor: "#A06050" }]} />
                <Text style={[styles.prName, { color: "#7A4030", fontFamily: "Inter_500Medium" }]}>
                  {pr}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Motivational note */}
        <View style={[styles.noteCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Text style={[styles.noteText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Your session has been saved. Voice check-ins will now include this workout in your context.
          </Text>
        </View>

        {/* Done button */}
        <TouchableOpacity
          onPress={handleDone}
          style={[styles.doneBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
        >
          <Text style={[styles.doneBtnText, { color: colors.primaryForeground, fontFamily: "Inter_700Bold" }]}>
            Done
          </Text>
        </TouchableOpacity>

        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 20,
  },
  trophyWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  heading: { fontSize: 26 },
  subheading: { fontSize: 16, marginTop: -8 },

  statsRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },

  prCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 10,
  },
  prHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  prTitle: { fontSize: 15 },
  prRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  prDot: { width: 6, height: 6, borderRadius: 3 },
  prName: { fontSize: 14 },

  noteCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  noteText: { fontSize: 14, lineHeight: 21, textAlign: "center" },

  doneBtn: {
    width: "100%",
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 4,
  },
  doneBtnText: { fontSize: 17 },
});
