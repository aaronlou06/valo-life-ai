import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useValoAuth } from "@/contexts/AuthContext";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useGetDashboard } from "@workspace/api-client-react";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

interface MetricTileProps {
  label: string;
  value: string | null;
  unit?: string;
  icon: string;
  onLogIt: () => void;
}

function MetricTile({ label, value, unit, icon, onLogIt }: MetricTileProps) {
  const colors = useColors();
  return (
    <View style={[styles.metricTile, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name={icon as any} size={16} color={colors.primary} style={{ marginBottom: 8 }} />
      <Text style={[styles.metricLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>{label}</Text>
      {value !== null ? (
        <Text style={[styles.metricValue, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {value}<Text style={[styles.metricUnit, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{unit ? ` ${unit}` : ""}</Text>
        </Text>
      ) : (
        <View style={{ alignItems: "center" }}>
          <Text style={[styles.metricDash, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>—</Text>
          <TouchableOpacity onPress={onLogIt}>
            <Text style={[styles.logItText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>Log it</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

interface PillarCardProps {
  title: string;
  score: number;
  status: string;
  color: string;
}

function PillarCard({ title, score, status, color }: PillarCardProps) {
  const colors = useColors();
  return (
    <View style={[styles.pillarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.pillarHeader}>
        <Text style={[styles.pillarTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{title}</Text>
        <Text style={[styles.pillarScore, { color, fontFamily: "Inter_700Bold" }]}>{score}/10</Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
        <View style={[styles.progressFill, { backgroundColor: color, width: `${(score / 10) * 100}%` }]} />
      </View>
      <Text style={[styles.pillarStatus, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{status}</Text>
    </View>
  );
}

export default function TodayScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { name } = useValoAuth();
  const router = useRouter();

  const { data: dashboard, isLoading, refetch, isRefetching } = useGetDashboard();

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const tabBarH = Platform.OS === "web" ? 84 : 83;

  const goToLog = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/(tabs)/log");
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: bottomPad + tabBarH + 16, paddingHorizontal: 20 }}
      refreshControl={<RefreshControl refreshing={!!isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
    >
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.greeting, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{todayLabel()}</Text>
          <Text style={[styles.greetingName, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {greeting()}{name ? `, ${name}` : ""}.
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/(tabs)/profile"); }}
          style={[styles.gearBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="settings" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Today's metrics</Text>
          <View style={styles.metricsRow}>
            <MetricTile
              label="Sleep"
              value={dashboard?.sleepHours != null ? String(dashboard.sleepHours) : null}
              unit="hrs"
              icon="moon"
              onLogIt={goToLog}
            />
            <MetricTile
              label="HRV"
              value={dashboard?.hrv != null ? String(dashboard.hrv) : null}
              unit="ms"
              icon="heart"
              onLogIt={goToLog}
            />
            <MetricTile
              label="Steps"
              value={dashboard?.steps != null ? (dashboard.steps >= 1000 ? `${(dashboard.steps / 1000).toFixed(1)}k` : String(dashboard.steps)) : null}
              icon="activity"
              onLogIt={goToLog}
            />
            <MetricTile
              label="RHR"
              value={dashboard?.restingHeartRate != null ? String(dashboard.restingHeartRate) : null}
              unit="bpm"
              icon="radio"
              onLogIt={goToLog}
            />
          </View>

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Pillar scores</Text>
          <PillarCard title="Health" score={dashboard?.healthScore ?? 0} status={dashboard?.healthStatus ?? "No data yet"} color={colors.primary} />
          <PillarCard title="Work & Mission" score={dashboard?.workScore ?? 0} status={dashboard?.workStatus ?? "No data yet"} color="#5B8CDE" />
          <PillarCard title="Relationships" score={dashboard?.relationshipScore ?? 0} status={dashboard?.relationshipStatus ?? "No data yet"} color="#7DCB8F" />

          <TouchableOpacity
            style={[styles.debriefBtn, { backgroundColor: colors.primary }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push("/(tabs)/checkin"); }}
          >
            <Feather name="sun" size={20} color={colors.primaryForeground} />
            <Text style={[styles.debriefBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>Start evening debrief</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 28 },
  gearBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
  },
  greeting: { fontSize: 14, marginBottom: 4 },
  greetingName: { fontSize: 28, lineHeight: 34 },
  sectionLabel: { fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 12, marginTop: 4 },
  metricsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  metricTile: { flex: 1, minWidth: "44%", padding: 16, borderRadius: 14, borderWidth: 1, alignItems: "center" },
  metricLabel: { fontSize: 12, marginBottom: 4 },
  metricValue: { fontSize: 22, marginTop: 2 },
  metricUnit: { fontSize: 13 },
  metricDash: { fontSize: 22, marginTop: 2, marginBottom: 2 },
  logItText: { fontSize: 12, marginTop: 2 },
  pillarCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 12 },
  pillarHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  pillarTitle: { fontSize: 15 },
  pillarScore: { fontSize: 15 },
  progressTrack: { height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 8 },
  progressFill: { height: 6, borderRadius: 3 },
  pillarStatus: { fontSize: 13 },
  debriefBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 54, borderRadius: 14, marginTop: 12 },
  debriefBtnText: { fontSize: 16 },
});
