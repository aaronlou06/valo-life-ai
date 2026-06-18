import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import {
  useGetWeeklyRecapById,
  getGetWeeklyRecapByIdQueryKey,
  type WeeklyRecap,
  type WeeklyRecapSection,
} from "@workspace/api-client-react";

// ── Helpers ─────────────────────────────────────────────────────────────────

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtShort(iso: string): string {
  const datePart = iso.split("T")[0]!;
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS_SHORT[m - 1]} ${d}`;
}

function dateRange(start: string, end: string): string {
  return `${fmtShort(start)} – ${fmtShort(end)}`;
}

const PILLARS: { key: keyof Pick<WeeklyRecap,
  "pillarSleep" | "pillarMovement" | "pillarWork" | "pillarMindset" | "pillarRelationships">;
  priorKeyLabel: string; label: string }[] = [
  { key: "pillarSleep", priorKeyLabel: "Sleep", label: "Sleep" },
  { key: "pillarMovement", priorKeyLabel: "Movement", label: "Movement" },
  { key: "pillarWork", priorKeyLabel: "Work & Focus", label: "Work & Focus" },
  { key: "pillarMindset", priorKeyLabel: "Mindset", label: "Mindset" },
  { key: "pillarRelationships", priorKeyLabel: "Relationships", label: "Relationships" },
];

// ── Pillar bar row ────────────────────────────────────────────────────────────

function PillarBar({
  label,
  score,
  delta,
  colors,
}: {
  label: string;
  score: number;
  delta: number | null;
  colors: ReturnType<typeof useColors>;
}) {
  const pct = Math.min(100, Math.max(0, (score / 10) * 100));
  const hasDelta = delta != null && Math.abs(delta) >= 0.1;
  const positive = (delta ?? 0) >= 0;

  return (
    <View style={styles.pillarRow}>
      <View style={styles.pillarHeader}>
        <Text style={[styles.pillarLabel, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          {label}
        </Text>
        <View style={styles.pillarRight}>
          <Text style={[styles.pillarScore, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
            {score.toFixed(1)}
          </Text>
          {hasDelta && (
            <View
              style={[
                styles.deltaChip,
                {
                  backgroundColor: positive ? "rgba(193,123,63,0.14)" : "rgba(212,71,62,0.12)",
                },
              ]}
            >
              <Text
                style={[
                  styles.deltaText,
                  {
                    color: positive ? colors.primary : colors.destructive,
                    fontFamily: "Inter_600SemiBold",
                  },
                ]}
              >
                {positive ? "+" : "−"}{Math.abs(delta!).toFixed(1)}
              </Text>
            </View>
          )}
        </View>
      </View>
      <View style={[styles.barTrack, { backgroundColor: colors.muted }]}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
      </View>
    </View>
  );
}

// ── Activity tile ─────────────────────────────────────────────────────────────

function StatTile({
  value,
  label,
  colors,
}: {
  value: string;
  label: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.statTile, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.statValue, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        {label}
      </Text>
    </View>
  );
}

// ── Quote block ───────────────────────────────────────────────────────────────

function QuoteBlock({
  kind,
  text,
  colors,
}: {
  kind: "win" | "struggle";
  text: string;
  colors: ReturnType<typeof useColors>;
}) {
  const isWin = kind === "win";
  return (
    <View
      style={[
        styles.quoteBlock,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderLeftColor: isWin ? colors.primary : colors.mutedForeground,
        },
      ]}
    >
      <View style={styles.quoteHeader}>
        <Feather
          name={isWin ? "award" : "anchor"}
          size={13}
          color={isWin ? colors.primary : colors.mutedForeground}
        />
        <Text
          style={[
            styles.quoteKind,
            { color: isWin ? colors.primary : colors.mutedForeground, fontFamily: "Inter_600SemiBold" },
          ]}
        >
          {isWin ? "TOP WIN" : "BIGGEST STRUGGLE"}
        </Text>
      </View>
      <Text style={[styles.quoteText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
        {text}
      </Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function WeeklyRecapScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const numericId = Number(id);

  const { data: recap, isLoading, isError } = useGetWeeklyRecapById(numericId, {
    query: {
      enabled: Number.isFinite(numericId),
      queryKey: getGetWeeklyRecapByIdQueryKey(numericId),
    },
  });

  const topPad = (Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top) + 8;

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <ActivityIndicator size="small" color={colors.mutedForeground} />
      </View>
    );
  }

  if (isError || !recap) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <Text style={[styles.errorText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          This recap could not be found.
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.errorBack}>
          <Text style={[styles.errorBackText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
            Go back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const narrative = recap.narrativeJson ?? null;
  const sections: WeeklyRecapSection[] = (narrative?.sections ?? []).filter(
    (s) => s.body && s.body.trim() !== "",
  );

  // Pillar deltas come from narrative sections by title; fall back to none.
  const deltaByTitle = new Map<string, number | null>();
  for (const s of narrative?.sections ?? []) {
    if (s.title) deltaByTitle.set(s.title.toLowerCase(), s.delta ?? null);
  }

  const visiblePillars = PILLARS.map((p) => {
    const score = recap[p.key] as number | null;
    if (score == null) return null;
    const delta = deltaByTitle.get(p.label.toLowerCase()) ?? null;
    return { label: p.label, score, delta };
  }).filter((p): p is { label: string; score: number; delta: number | null } => p !== null);

  const habitPct = recap.habitsCompletionPct != null ? Math.round(recap.habitsCompletionPct) : null;

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingTop: topPad, paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header bar ── */}
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
            <Feather name="chevron-left" size={24} color={colors.mutedForeground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
              YOUR WEEK WITH VALO
            </Text>
            <Text style={[styles.range, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {dateRange(recap.weekStart, recap.weekEnd)}
            </Text>
          </View>
        </View>

        {/* ── Headline ── */}
        {recap.headline && (
          <Text style={[styles.headline, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {recap.headline}
          </Text>
        )}

        {/* ── Quiet week note ── */}
        {recap.isQuietWeek && (
          <View style={[styles.quietNote, { backgroundColor: colors.muted }]}>
            <Feather name="moon" size={13} color={colors.mutedForeground} />
            <Text style={[styles.quietText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Lighter week — here's what was logged.
            </Text>
          </View>
        )}

        {/* ── What Valo learned ── */}
        {recap.valoInsight && (
          <View
            style={[
              styles.insightCard,
              { backgroundColor: "rgba(193,123,63,0.08)", borderColor: colors.primary },
            ]}
          >
            <Text style={[styles.insightLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
              What Valo learned about you this week
            </Text>
            <Text style={[styles.insightText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
              {recap.valoInsight}
            </Text>
          </View>
        )}

        {/* ── Pillar bars ── */}
        {visiblePillars.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
              YOUR PILLARS
            </Text>
            <View style={[styles.pillarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {visiblePillars.map((p) => (
                <PillarBar
                  key={p.label}
                  label={p.label}
                  score={p.score}
                  delta={p.delta}
                  colors={colors}
                />
              ))}
            </View>
          </View>
        )}

        {/* ── Activity grid ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
            ACTIVITY
          </Text>
          <View style={styles.statGrid}>
            <StatTile value={String(recap.workoutsCompleted)} label="Workouts" colors={colors} />
            <StatTile value={habitPct != null ? `${habitPct}%` : "—"} label="Habits" colors={colors} />
            <StatTile value={String(recap.debriefCount)} label="Check-ins" colors={colors} />
            <StatTile value={String(recap.nutritionDaysLogged)} label="Nutrition days" colors={colors} />
          </View>
        </View>

        {/* ── Win / struggle ── */}
        {(recap.topWin || recap.topStruggle) && (
          <View style={[styles.section, { gap: 10 }]}>
            {recap.topWin && <QuoteBlock kind="win" text={recap.topWin} colors={colors} />}
            {recap.topStruggle && <QuoteBlock kind="struggle" text={recap.topStruggle} colors={colors} />}
          </View>
        )}

        {/* ── Section narratives ── */}
        {sections.length > 0 && (
          <View style={[styles.section, { gap: 16 }]}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
              THE DETAILS
            </Text>
            {sections.map((s, i) => (
              <View key={`${s.title}-${i}`} style={styles.narrative}>
                <Text style={[styles.narrativeTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                  {s.title}
                </Text>
                <Text style={[styles.narrativeBody, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {s.body}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Closing ── */}
        {(narrative?.closing || recap.intentionNextWeek) && (
          <View style={[styles.closingCard, { borderTopColor: colors.border }]}>
            {narrative?.closing && (
              <Text style={[styles.closingText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                {narrative.closing}
              </Text>
            )}
            {recap.intentionNextWeek && (
              <View style={styles.intentionWrap}>
                <Text style={[styles.intentionLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                  FOR NEXT WEEK
                </Text>
                <Text style={[styles.intentionText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                  {recap.intentionNextWeek}
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  errorText: { fontSize: 15 },
  errorBack: { paddingVertical: 8, paddingHorizontal: 16 },
  errorBackText: { fontSize: 15 },
  scroll: { paddingHorizontal: 20 },

  headerBar: { flexDirection: "row", alignItems: "center", marginBottom: 18 },
  backBtn: { marginLeft: -6, marginRight: 6, padding: 2 },
  eyebrow: { fontSize: 11, letterSpacing: 1.2 },
  range: { fontSize: 13, marginTop: 2 },

  headline: { fontSize: 26, lineHeight: 34, marginBottom: 16 },

  quietNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  quietText: { fontSize: 13 },

  insightCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 18,
    marginBottom: 24,
  },
  insightLabel: { fontSize: 12, letterSpacing: 0.3, marginBottom: 8 },
  insightText: { fontSize: 16, lineHeight: 24 },

  section: { marginBottom: 24 },
  sectionLabel: { fontSize: 11, letterSpacing: 1, marginBottom: 12 },

  pillarCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 16 },
  pillarRow: { gap: 7 },
  pillarHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pillarLabel: { fontSize: 14 },
  pillarRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  pillarScore: { fontSize: 13 },
  deltaChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  deltaText: { fontSize: 11 },
  barTrack: { height: 7, borderRadius: 4, overflow: "hidden" },
  barFill: { height: 7, borderRadius: 4 },

  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statTile: {
    flexBasis: "47%",
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 14,
    gap: 4,
  },
  statValue: { fontSize: 24 },
  statLabel: { fontSize: 12 },

  quoteBlock: { borderRadius: 14, borderWidth: 1, borderLeftWidth: 3, padding: 14, gap: 8 },
  quoteHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  quoteKind: { fontSize: 10, letterSpacing: 0.8 },
  quoteText: { fontSize: 15, lineHeight: 22 },

  narrative: { gap: 5 },
  narrativeTitle: { fontSize: 15 },
  narrativeBody: { fontSize: 14, lineHeight: 21 },

  closingCard: { borderTopWidth: 1, paddingTop: 20, gap: 18 },
  closingText: { fontSize: 15, lineHeight: 23, fontStyle: "italic" },
  intentionWrap: { gap: 6 },
  intentionLabel: { fontSize: 11, letterSpacing: 1 },
  intentionText: { fontSize: 16, lineHeight: 24 },
});
