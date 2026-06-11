import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Svg, { Circle, Line, Polyline, Rect } from "react-native-svg";
import { useColors } from "@/hooks/useColors";

const LAVENDER = "#9B7BB8";
const SLATE = "#5B7FA6";
const SAGE = "#6B9E78";
const SAGE_RED = "#C2675A";

type Range = "7D" | "1M" | "3M" | "6M";
const RANGES: Range[] = ["7D", "1M", "3M", "6M"];

const POINTS: Record<Range, number> = { "7D": 7, "1M": 4, "3M": 6, "6M": 6 };
const LABELS: Record<Range, string[]> = {
  "7D": ["M", "T", "W", "T", "F", "S", "S"],
  "1M": ["W1", "W2", "W3", "W4"],
  "3M": ["Apr", "", "May", "", "Jun", ""],
  "6M": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
};

// Deterministic pseudo-data generator so each range/metric is stable.
function series(seed: number, n: number, min: number, max: number): number[] {
  const out: number[] = [];
  let v = seed;
  for (let i = 0; i < n; i++) {
    v = (v * 9301 + 49297) % 233280;
    const r = v / 233280;
    out.push(Math.round((min + r * (max - min)) * 10) / 10);
  }
  return out;
}

const CHART_W = 300;
const CHART_H = 110;
const PAD = 8;

function LineChart({ data, max, color }: { data: number[]; max: number; color: string }) {
  const n = data.length;
  const stepX = n > 1 ? (CHART_W - PAD * 2) / (n - 1) : 0;
  const points = data
    .map((d, i) => {
      const x = PAD + i * stepX;
      const y = PAD + (1 - d / max) * (CHART_H - PAD * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none">
      {[0.25, 0.5, 0.75].map((g) => (
        <Line key={g} x1={PAD} y1={PAD + g * (CHART_H - PAD * 2)} x2={CHART_W - PAD} y2={PAD + g * (CHART_H - PAD * 2)} stroke={color} strokeOpacity={0.12} strokeWidth={1} />
      ))}
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => {
        const x = PAD + i * stepX;
        const y = PAD + (1 - d / max) * (CHART_H - PAD * 2);
        return <Circle key={i} cx={x} cy={y} r={3} fill={color} />;
      })}
    </Svg>
  );
}

function BarChart({ data, max, color }: { data: number[]; max: number; color: string }) {
  const n = data.length;
  const gap = 6;
  const barW = (CHART_W - PAD * 2 - gap * (n - 1)) / n;
  return (
    <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none">
      {data.map((d, i) => {
        const h = (d / max) * (CHART_H - PAD * 2);
        const x = PAD + i * (barW + gap);
        const y = CHART_H - PAD - h;
        return <Rect key={i} x={x} y={y} width={barW} height={h} rx={3} fill={color} />;
      })}
    </Svg>
  );
}

interface ChartDef {
  title: string;
  unit: string;
  color: string;
  max: number;
  seed: number;
  min: number;
  rangeMax: number;
  kind: "line" | "bar";
}

const CHARTS: ChartDef[] = [
  { title: "Mood Score", unit: "/10", color: LAVENDER, max: 10, seed: 17, min: 5, rangeMax: 9, kind: "line" },
  { title: "Sleep", unit: "hrs", color: SLATE, max: 10, seed: 53, min: 5.5, rangeMax: 8.5, kind: "line" },
  { title: "Habit Completion", unit: "%", color: SAGE, max: 100, seed: 91, min: 40, rangeMax: 100, kind: "bar" },
];

export default function ChartsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [range, setRange] = useState<Range>("7D");
  const n = POINTS[range];
  const labels = LABELS[range];

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Progress Charts
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
      >
        {/* Range selector */}
        <View style={styles.rangeRow}>
          {RANGES.map((r) => {
            const active = r === range;
            return (
              <TouchableOpacity
                key={r}
                onPress={() => { Haptics.selectionAsync(); setRange(r); }}
                activeOpacity={0.8}
                style={[
                  styles.rangePill,
                  active
                    ? { backgroundColor: LAVENDER, borderColor: LAVENDER }
                    : { backgroundColor: "transparent", borderColor: colors.border },
                ]}
              >
                <Text style={[styles.rangeText, { fontFamily: "Inter_600SemiBold", color: active ? "#FFFFFF" : colors.foreground }]}>
                  {r}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {CHARTS.map((c) => {
          const data = series(c.seed + n, n, c.min, c.rangeMax);
          const first = data[0]!;
          const last = data[data.length - 1]!;
          const pct = first === 0 ? 0 : Math.round(((last - first) / first) * 100);
          const up = pct >= 0;
          return (
            <View key={c.title} style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.chartHeader}>
                <Text style={[styles.chartTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                  {c.title}
                </Text>
                <View style={[styles.trendBadge, { backgroundColor: up ? `${SAGE}1F` : `${SAGE_RED}1F` }]}>
                  <Feather name={up ? "arrow-up-right" : "arrow-down-right"} size={12} color={up ? SAGE : SAGE_RED} />
                  <Text style={[styles.trendText, { color: up ? SAGE : SAGE_RED, fontFamily: "Inter_600SemiBold" }]}>
                    {Math.abs(pct)}% vs last period
                  </Text>
                </View>
              </View>

              {c.kind === "line" ? (
                <LineChart data={data} max={c.max} color={c.color} />
              ) : (
                <BarChart data={data} max={c.max} color={c.color} />
              )}

              <View style={styles.axisRow}>
                {labels.slice(0, n).map((l, i) => (
                  <Text key={i} style={[styles.axisLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    {l}
                  </Text>
                ))}
              </View>

              <Text style={[styles.latest, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Latest: {last}{c.unit}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18 },
  rangeRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  rangePill: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  rangeText: { fontSize: 13 },
  chartCard: { borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 14 },
  chartHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  chartTitle: { fontSize: 14 },
  trendBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  trendText: { fontSize: 11 },
  axisRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, paddingHorizontal: PAD },
  axisLabel: { fontSize: 10, flex: 1, textAlign: "center" },
  latest: { fontSize: 12, marginTop: 8 },
});
