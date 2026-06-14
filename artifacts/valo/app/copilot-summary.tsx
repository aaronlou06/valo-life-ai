import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { HR_ZONES, fmtZoneSeconds } from "@/lib/heartRate";

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
    avgHr?: string;
    maxHr?: string;
    caloriesKcal?: string;
    timeInZone?: string;
  }>();

  const name = params.name ?? "Workout";
  const durationSec = parseInt(params.durationSec ?? "0", 10);
  const totalSets = parseInt(params.totalSets ?? "0", 10);
  const tonnageKg = parseInt(params.tonnageKg ?? "0", 10);
  const prNames = params.prNames
    ? params.prNames.split(",").filter(Boolean)
    : [];

  const avgHr = params.avgHr ? parseInt(params.avgHr, 10) : null;
  const maxHr = params.maxHr ? parseInt(params.maxHr, 10) : null;
  const caloriesKcal = params.caloriesKcal ? parseInt(params.caloriesKcal, 10) : null;
  const timeInZone: Record<string, number> = (() => {
    if (!params.timeInZone) return {};
    try {
      const parsed = JSON.parse(params.timeInZone) as Record<string, number>;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  })();
  const hasHr = avgHr != null || maxHr != null;
  const zoneRows = HR_ZONES.filter((z) => (timeInZone[z.key] ?? 0) > 0);
  const maxZoneSecs = zoneRows.reduce((m, z) => Math.max(m, timeInZone[z.key] ?? 0), 0);

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

        {/* Heart rate */}
        {hasHr && (
          <>
            <View style={styles.statsRow}>
              <StatTile
                icon="heart"
                label="Avg HR"
                value={avgHr != null ? `${avgHr} bpm` : "--"}
                colors={colors}
              />
              <StatTile
                icon="activity"
                label="Max HR"
                value={maxHr != null ? `${maxHr} bpm` : "--"}
                colors={colors}
              />
              {caloriesKcal != null && caloriesKcal > 0 && (
                <StatTile icon="zap" label="Calories" value={`${caloriesKcal} kcal`} colors={colors} />
              )}
            </View>

            {zoneRows.length > 0 && (
              <View style={[styles.zoneCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.zoneTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                  Time in zone
                </Text>
                {zoneRows.map((z) => {
                  const secs = timeInZone[z.key] ?? 0;
                  const pct = maxZoneSecs > 0 ? secs / maxZoneSecs : 0;
                  return (
                    <View key={z.key} style={styles.zoneRow}>
                      <Text style={[styles.zoneLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                        {z.label}
                      </Text>
                      <View style={[styles.zoneTrack, { backgroundColor: colors.muted }]}>
                        <View
                          style={[
                            styles.zoneFill,
                            { backgroundColor: z.color, width: `${Math.max(6, pct * 100)}%` },
                          ]}
                        />
                      </View>
                      <Text style={[styles.zoneTime, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                        {fmtZoneSeconds(secs)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}

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

  zoneCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  zoneTitle: { fontSize: 15 },
  zoneRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  zoneLabel: { fontSize: 12, width: 96 },
  zoneTrack: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  zoneFill: { height: 8, borderRadius: 4 },
  zoneTime: { fontSize: 12, width: 56, textAlign: "right" },

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
