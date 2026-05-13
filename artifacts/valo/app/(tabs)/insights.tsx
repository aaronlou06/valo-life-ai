import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useListInsights, useListMoods } from "@workspace/api-client-react";

const { width: SCREEN_W } = Dimensions.get("window");

function MoodBar({ score, day }: { score: number; day: string }) {
  const colors = useColors();
  const maxH = 64;
  const barH = Math.max(6, (score / 10) * maxH);
  return (
    <View style={styles.barWrapper}>
      <View style={[styles.barTrack, { backgroundColor: colors.muted, height: maxH }]}>
        <View style={[styles.barFill, { backgroundColor: colors.primary, height: barH }]} />
      </View>
      <Text style={[styles.barScore, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{score}</Text>
      <Text style={[styles.barDay, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{day}</Text>
    </View>
  );
}

function getLast7Days(): string[] {
  const days = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const result: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    result.push(days[d.getDay()]!);
  }
  return result;
}

export default function InsightsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data: insights, isLoading: insightsLoading } = useListInsights();
  const { data: moods, isLoading: moodsLoading } = useListMoods();

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const tabBarH = Platform.OS === "web" ? 84 : 83;

  const dayLabels = getLast7Days();
  const today = new Date().toISOString().split("T")[0]!;
  const moodByDay: Record<string, number> = {};
  moods?.forEach((m) => { moodByDay[m.date] = m.score; });
  const chartData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().split("T")[0]!;
    return moodByDay[dateStr] ?? 0;
  });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: bottomPad + tabBarH + 16, paddingHorizontal: 20 }}
    >
      <Text style={[styles.header, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Insights</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Patterns in your data</Text>

      <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.chartTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Mood — last 7 days</Text>
        {moodsLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : (
          <View style={styles.chartRow}>
            {chartData.map((score, i) => (
              <MoodBar key={i} score={score} day={dayLabels[i] ?? ""} />
            ))}
          </View>
        )}
        {!moodsLoading && moods?.length === 0 && (
          <View style={styles.emptyChart}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Log your mood in the Voice tab to see trends here.</Text>
          </View>
        )}
      </View>

      <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>AI INSIGHTS</Text>

      {insightsLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : (
        insights?.map((insight) => (
          <View key={insight.id} style={[styles.insightCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.insightBadge, { backgroundColor: colors.primary + "1A" }]}>
              <Text style={[styles.insightLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>{insight.label}</Text>
            </View>
            <Text style={[styles.insightContent, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>{insight.content}</Text>
            {insight.followUpQuestion && (
              <Text style={[styles.insightQuestion, { color: "#5B8CDE", fontFamily: "Inter_400Regular" }]}>
                {insight.followUpQuestion}
              </Text>
            )}
          </View>
        ))
      )}

      {!insightsLoading && (!insights || insights.length === 0) && (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="cpu" size={24} color={colors.mutedForeground} />
          <Text style={[styles.emptyCardText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Keep logging to unlock personalized insights.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 28, marginBottom: 4 },
  subtitle: { fontSize: 15, marginBottom: 24 },
  chartCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 24 },
  chartTitle: { fontSize: 15, marginBottom: 16 },
  chartRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingTop: 4 },
  barWrapper: { alignItems: "center", gap: 4, flex: 1 },
  barTrack: { width: 28, borderRadius: 6, justifyContent: "flex-end", overflow: "hidden" },
  barFill: { width: "100%", borderRadius: 6 },
  barScore: { fontSize: 11 },
  barDay: { fontSize: 11 },
  emptyChart: { paddingVertical: 16, alignItems: "center" },
  emptyText: { fontSize: 13, textAlign: "center" },
  sectionLabel: { fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 12 },
  insightCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 12 },
  insightBadge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 10 },
  insightLabel: { fontSize: 12 },
  insightContent: { fontSize: 14, lineHeight: 22, marginBottom: 10 },
  insightQuestion: { fontSize: 14, fontStyle: "italic", lineHeight: 20 },
  emptyCard: { borderRadius: 14, borderWidth: 1, padding: 24, alignItems: "center", gap: 10 },
  emptyCardText: { fontSize: 14, textAlign: "center" },
});
