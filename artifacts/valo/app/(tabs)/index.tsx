import React, { useRef, useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  Animated,
  TouchableWithoutFeedback,
  Linking,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { SymbolView } from "expo-symbols";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import { useValoAuth } from "@/contexts/AuthContext";
import { CheckInSheet } from "@/components/CheckInSheet";
import {
  useGetTodayLog,
  useListGoals,
  useListHabits,
  useListCalendarEvents,
} from "@workspace/api-client-react";

const isIOS = Platform.OS === "ios";

const BUG_EMAIL = "support@govalo.app";
const BUG_SUBJECT = "Bug report";

// ── Time helpers ──────────────────────────────────────────────────────────────

function getTimeOfDay(): "morning" | "midday" | "evening" {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "midday";
  return "evening";
}

function getGreeting(): string {
  const tod = getTimeOfDay();
  if (tod === "morning") return "Good morning";
  if (tod === "midday") return "Good afternoon";
  return "Good evening";
}

function getFirstName(name: string | null): string {
  if (!name) return "there";
  return name.split(" ")[0] ?? "there";
}

function getTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

function formatEventTime(startTime: string | null | undefined): string | null {
  if (!startTime) return null;
  const d = new Date(startTime);
  if (!isNaN(d.getTime())) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }
  return startTime;
}

function eventStartMinutes(startTime: string | null | undefined): number | null {
  if (!startTime) return null;
  const d = new Date(startTime);
  if (!isNaN(d.getTime())) {
    return d.getHours() * 60 + d.getMinutes();
  }
  const match = startTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let h = parseInt(match[1] ?? "0", 10);
  const m = parseInt(match[2] ?? "0", 10);
  const period = match[3]?.toUpperCase();
  if (period === "PM" && h < 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

function computeReadinessLabel(
  hrv: number | null,
  sleep: number | null,
  rhr: number | null,
): "Good" | "Fair" | "Low" | "Unknown" {
  if (hrv == null && sleep == null && rhr == null) return "Unknown";
  let score = 0;
  let factors = 0;
  if (hrv != null) { factors++; if (hrv >= 50) score += 2; else if (hrv >= 35) score += 1; }
  if (sleep != null) { factors++; if (sleep >= 7.5) score += 2; else if (sleep >= 6) score += 1; }
  if (rhr != null) { factors++; if (rhr <= 62) score += 2; else if (rhr <= 70) score += 1; }
  if (factors === 0) return "Unknown";
  const ratio = score / (factors * 2);
  if (ratio >= 0.67) return "Good";
  if (ratio >= 0.34) return "Fair";
  return "Low";
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ValoIntel {
  unresolved_thread: string | null;
  commitment: string | null;
  emotional_tone: string | null;
  last_call_date: string | null;
  pattern_observation: string | null;
}

type GlanceCardType = "readiness" | "next-event" | "habits" | "goal" | "checkin" | "intention";

interface GlanceCandidate {
  type: GlanceCardType;
  score: number;
  data: {
    readinessLabel?: "Good" | "Fair" | "Low" | "Unknown";
    hrv?: number | null;
    sleep?: number | null;
    eventTitle?: string;
    eventTime?: string | null;
    minutesAway?: number | null;
    pendingCount?: number;
    streakAtRisk?: string[];
    pendingNames?: string[];
    goalTitle?: string;
    goalProgress?: number;
    commitment?: string;
  };
}

// ── Scoring + ranking ─────────────────────────────────────────────────────────

function buildAndScoreCandidates(params: {
  tod: "morning" | "midday" | "evening";
  readinessLabel: "Good" | "Fair" | "Low" | "Unknown";
  hrv: number | null;
  sleep: number | null;
  nextEvent: { title: string; startTime?: string | null } | null;
  minutesToNextEvent: number | null;
  pendingHabits: Array<{ name: string; streak: number }>;
  topGoal: { title: string; progressPercent: number } | null;
  intel: ValoIntel | null;
}): GlanceCandidate[] {
  const {
    tod, readinessLabel, hrv, sleep,
    nextEvent, minutesToNextEvent,
    pendingHabits, topGoal, intel,
  } = params;

  const candidates: GlanceCandidate[] = [];

  // 1. Readiness card
  if (readinessLabel !== "Unknown") {
    let score = 0;
    if (tod === "morning") score += 22;
    if (readinessLabel === "Low") score += 28;
    else if (readinessLabel === "Fair") score += 10;
    if (hrv != null && hrv < 30) score += 18;
    if (sleep != null && sleep < 6) score += 22;
    candidates.push({ type: "readiness", score, data: { readinessLabel, hrv, sleep } });
  } else if (tod === "morning") {
    candidates.push({ type: "readiness", score: 8, data: { readinessLabel, hrv, sleep } });
  }

  // 2. Next event card
  if (nextEvent) {
    let score = 0;
    if (minutesToNextEvent != null) {
      if (minutesToNextEvent < 60) score += 40;
      else if (minutesToNextEvent < 180) score += 26;
      else score += 12;
    } else {
      score += 10;
    }
    if (tod === "midday") score += 12;
    if (tod === "morning") score += 8;
    const evTime = formatEventTime(nextEvent.startTime);
    candidates.push({
      type: "next-event",
      score,
      data: { eventTitle: nextEvent.title, eventTime: evTime, minutesAway: minutesToNextEvent },
    });
  }

  // 3. Habits remaining card
  if (pendingHabits.length > 0) {
    let score = 0;
    if (tod === "morning") score += 18;
    if (tod === "midday") score += 22;
    if (tod === "evening") score += 10;
    const streakAtRisk = pendingHabits.filter(h => h.streak > 0).map(h => h.name);
    if (streakAtRisk.length > 0) score += 24;
    if (pendingHabits.length === 1) score += 5;
    candidates.push({
      type: "habits",
      score,
      data: { pendingCount: pendingHabits.length, streakAtRisk, pendingNames: pendingHabits.map(h => h.name) },
    });
  }

  // 4. Top goal nudge
  if (topGoal) {
    let score = 0;
    if (tod === "morning") score += 14;
    if (tod === "midday") score += 12;
    if (topGoal.progressPercent < 20) score += 6;
    if (topGoal.progressPercent >= 80) score += 10;
    candidates.push({ type: "goal", score, data: { goalTitle: topGoal.title, goalProgress: topGoal.progressPercent } });
  }

  // 5. Check-in prompt
  {
    let score = 0;
    if (tod === "evening") score += 36;
    else if (tod === "midday") score += 8;
    else score += 4;
    candidates.push({ type: "checkin", score, data: {} });
  }

  // 6. Yesterday's intention (morning only)
  if (tod === "morning" && intel?.commitment) {
    candidates.push({
      type: "intention",
      score: 22,
      data: { commitment: intel.commitment },
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 5);
}

// ── AvatarDropdown ────────────────────────────────────────────────────────────

type DropdownItem = {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
};

function AvatarDropdown({
  name,
  colors,
}: {
  name: string | null;
  colors: ReturnType<typeof useColors>;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const initial = name ? name[0].toUpperCase() : "V";

  function openMenu() {
    setOpen(true);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 6 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 140, useNativeDriver: true }),
    ]).start();
  }

  function closeMenu() {
    Animated.parallel([
      Animated.timing(scaleAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
    ]).start(() => setOpen(false));
  }

  function navigate(path: string) {
    closeMenu();
    setTimeout(() => router.push(path as never), 120);
  }

  async function handleReportBug() {
    closeMenu();
    const body = `Device: ${Platform.OS}\nOS Version: ${Platform.Version}\n\n--- Describe the bug ---\n\n`;
    const mailto = `mailto:${BUG_EMAIL}?subject=${encodeURIComponent(BUG_SUBJECT)}&body=${encodeURIComponent(body)}`;
    const canOpen = await Linking.canOpenURL(mailto).catch(() => false);
    if (canOpen) {
      await Linking.openURL(mailto).catch(() => {});
    } else {
      Alert.alert("Cannot open mail app", `Please email us at ${BUG_EMAIL}`);
    }
  }

  const items: DropdownItem[] = [
    { label: "Profile", icon: "user", onPress: () => navigate("/(tabs)/profile") },
    { label: "Help", icon: "help-circle", onPress: () => navigate("/help") },
    { label: "Report Bug", icon: "alert-circle", onPress: () => { void handleReportBug(); } },
    { label: "Accountability Buddy", icon: "users", onPress: () => navigate("/accountability-buddy") },
  ];

  return (
    <>
      <TouchableOpacity
        onPress={openMenu}
        activeOpacity={0.75}
        style={[styles.avatar, { backgroundColor: colors.secondary, borderColor: colors.border }]}
      >
        <Text style={[styles.avatarText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
          {initial}
        </Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="none" onRequestClose={closeMenu} statusBarTranslucent>
        <TouchableWithoutFeedback onPress={closeMenu}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <Animated.View
                style={[
                  styles.dropdown,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    top: insets.top + 64,
                    opacity: opacityAnim,
                    transform: [{ scale: scaleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
                  },
                ]}
              >
                {items.map((item, i) => (
                  <TouchableOpacity
                    key={item.label}
                    onPress={item.onPress}
                    activeOpacity={0.7}
                    style={[
                      styles.dropdownItem,
                      i < items.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                    ]}
                  >
                    <Feather name={item.icon} size={16} color={colors.mutedForeground} />
                    <Text style={[styles.dropdownLabel, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </Animated.View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

// ── ValoCard ──────────────────────────────────────────────────────────────────

function ValoCard({
  text,
  loading,
  colors,
}: {
  text: string;
  loading: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  return (
    <View
      style={[
        styles.valoCard,
        {
          backgroundColor: colors.secondary,
          borderColor: colors.border,
          borderLeftColor: colors.accent,
        },
      ]}
    >
      <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
        From Valo
      </Text>
      {loading ? (
        <ActivityIndicator size="small" color={colors.mutedForeground} style={{ marginTop: 8 }} />
      ) : (
        <>
          {/* Visible text + absolutely-positioned measuring ghost (same width, no height impact) */}
          <View style={{ position: "relative" }}>
            {/* Measuring ghost: no numberOfLines cap, invisible, not interactive */}
            <Text
              style={[
                styles.valoText,
                {
                  fontFamily: "Inter_400Regular",
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  opacity: 0,
                },
              ]}
              pointerEvents="none"
              onTextLayout={(e) => {
                console.log("Valo lines:", e.nativeEvent.lines.length);
                setOverflows(e.nativeEvent.lines.length > 3);
              }}
            >
              {text}
            </Text>

            {/* Visible text */}
            <Text
              style={[styles.valoText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
              numberOfLines={expanded ? undefined : 3}
            >
              {text}
            </Text>

            {!expanded && (
              <LinearGradient
                colors={["transparent", colors.secondary]}
                style={styles.valoFade}
                pointerEvents="none"
              />
            )}
          </View>

          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            style={styles.valoToggle}
            activeOpacity={0.7}
          >
            <Text style={[styles.valoToggleLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {expanded ? "See less" : "See more"}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

// ── GlanceCard ────────────────────────────────────────────────────────────────

function GlanceCard({
  card,
  colors,
  onCheckIn,
  router,
}: {
  card: GlanceCandidate;
  colors: ReturnType<typeof useColors>;
  onCheckIn: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const { type, data } = card;

  if (type === "readiness") {
    const label = data.readinessLabel ?? "Unknown";
    const hasData = label !== "Unknown";
    const labelColor = label === "Good" ? "#4A7D68" : label === "Fair" ? "#8A6030" : label === "Low" ? "#A04040" : colors.mutedForeground;
    const labelBg = label === "Good" ? "#D8EBE3" : label === "Fair" ? "#FAEEDA" : label === "Low" ? "#F5DDD8" : colors.secondary;
    const headline = !hasData
      ? "No health data logged yet. Log sleep or HRV to see your readiness."
      : label === "Good"
      ? "Looking good — recovery is solid today."
      : label === "Fair"
      ? (data.sleep != null && (data.sleep as number) < 6
          ? `Sleep was on the shorter side (${data.sleep}h) — take it steady today.`
          : data.hrv != null
          ? `HRV at ${data.hrv} ms — your body may need a lighter touch today.`
          : "Recovery is moderate — pace yourself through the day.")
      : (data.sleep != null && (data.sleep as number) < 5
          ? `Only ${data.sleep}h sleep. Try to protect your energy today.`
          : data.hrv != null
          ? `HRV dipped to ${data.hrv} ms. Worth noticing — keep it manageable.`
          : "Recovery is low today — keep things manageable.");

    return (
      <View style={[styles.glanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.glanceCardRow}>
          <View style={[styles.glanceIconWrap, { backgroundColor: labelBg }]}>
            {isIOS ? (
              <SymbolView name="heart.fill" tintColor={labelColor} size={15} />
            ) : (
              <Feather name="activity" size={15} color={labelColor} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.glanceTitleRow}>
              <Text style={[styles.glanceTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                Readiness
              </Text>
              {hasData && (
                <View style={[styles.pill, { backgroundColor: labelBg }]}>
                  <Text style={[styles.pillText, { color: labelColor, fontFamily: "Inter_600SemiBold" }]}>
                    {label}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.glanceSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {headline}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (type === "next-event") {
    const minsAway = data.minutesAway;
    const isImminent = minsAway != null && minsAway < 60;
    const countdownText = minsAway != null
      ? minsAway === 0 ? "starting now"
      : minsAway < 60 ? `in ${minsAway} min`
      : minsAway < 120 ? "in about an hour"
      : null
      : null;

    return (
      <View style={[styles.glanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.glanceCardRow}>
          <View style={[styles.glanceIconWrap, { backgroundColor: "#D8EBE3" }]}>
            {isIOS ? (
              <SymbolView name="calendar" tintColor="#4A7D68" size={15} />
            ) : (
              <Feather name="calendar" size={15} color="#4A7D68" />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.glanceTitleRow}>
              <Text
                style={[styles.glanceTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold", flexShrink: 1 }]}
                numberOfLines={1}
              >
                {data.eventTitle as string}
              </Text>
              {countdownText != null && (
                <View style={[styles.pill, { backgroundColor: isImminent ? "#FAEEDA" : colors.secondary }]}>
                  <Text style={[styles.pillText, { color: isImminent ? "#8A6030" : colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
                    {countdownText}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.glanceSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {data.eventTime != null ? `At ${data.eventTime as string}` : "Up next on your calendar"}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (type === "habits") {
    const pending = data.pendingCount as number;
    const atRisk = data.streakAtRisk as string[];
    const names = data.pendingNames as string[];
    const riskName = atRisk[0] ?? null;
    const headline = atRisk.length > 0
      ? `${riskName}${atRisk.length > 1 ? ` and ${atRisk.length - 1} other${atRisk.length > 2 ? "s" : ""}` : ""} — streak at risk.`
      : `${pending} habit${pending !== 1 ? "s" : ""} still to do${names.length <= 2 ? `: ${names.join(", ")}` : ""}.`;

    return (
      <View style={[styles.glanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.glanceCardRow}>
          <View style={[styles.glanceIconWrap, { backgroundColor: atRisk.length > 0 ? "#F5DDD8" : "#FAEEDA" }]}>
            {isIOS ? (
              <SymbolView name="checkmark.circle" tintColor={atRisk.length > 0 ? "#A04040" : "#8A6030"} size={15} />
            ) : (
              <Feather name="check-circle" size={15} color={atRisk.length > 0 ? "#A04040" : "#8A6030"} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.glanceTitleRow}>
              <Text style={[styles.glanceTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                Habits
              </Text>
              <View style={[styles.pill, { backgroundColor: atRisk.length > 0 ? "#F5DDD8" : "#FAEEDA" }]}>
                <Text style={[styles.pillText, { color: atRisk.length > 0 ? "#A04040" : "#8A6030", fontFamily: "Inter_600SemiBold" }]}>
                  {pending} left
                </Text>
              </View>
            </View>
            <Text style={[styles.glanceSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {headline}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (type === "goal") {
    const pct = data.goalProgress as number;
    return (
      <TouchableOpacity
        style={[styles.glanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => router.navigate("/(tabs)/plan")}
        activeOpacity={0.75}
      >
        <View style={styles.glanceCardRow}>
          <View style={[styles.glanceIconWrap, { backgroundColor: colors.secondary }]}>
            {isIOS ? (
              <SymbolView name="target" tintColor={colors.primary} size={15} />
            ) : (
              <Feather name="flag" size={15} color={colors.primary} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={[styles.glanceTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold", marginBottom: 6 }]}
              numberOfLines={1}
            >
              {data.goalTitle as string}
            </Text>
            <View style={[styles.progressTrack, { backgroundColor: colors.secondary }]}>
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: colors.primary, width: `${Math.min(pct, 100)}%` as unknown as number },
                ]}
              />
            </View>
            <Text style={[styles.glanceSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 4 }]}>
              {pct}% complete
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  if (type === "checkin") {
    return (
      <TouchableOpacity
        style={[styles.glanceCard, styles.glanceCardCta, { backgroundColor: colors.primary }]}
        onPress={onCheckIn}
        activeOpacity={0.8}
      >
        <View style={styles.glanceCardRow}>
          <View style={[styles.glanceIconWrap, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
            <Feather name="mic" size={15} color={colors.primaryForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.glanceTitle, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
              Ready for today's check-in?
            </Text>
            <Text style={[styles.glanceSub, { color: `${colors.primaryForeground}BB`, fontFamily: "Inter_400Regular" }]}>
              Tap to start your evening debrief with Valo.
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={`${colors.primaryForeground}88`} />
        </View>
      </TouchableOpacity>
    );
  }

  if (type === "intention") {
    return (
      <View style={[styles.glanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.glanceCardRow}>
          <View style={[styles.glanceIconWrap, { backgroundColor: "#FAEEDA" }]}>
            <Feather name="sun" size={15} color="#8A6030" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.glanceTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              Yesterday's intention
            </Text>
            <Text style={[styles.glanceSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {`"${data.commitment as string}"`}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return null;
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useColors();
  const { name, getToken } = useValoAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [checkInOpen, setCheckInOpen] = useState(false);

  const greeting = useMemo(() => getGreeting(), []);
  const firstName = useMemo(() => getFirstName(name), [name]);
  const tod = useMemo(() => getTimeOfDay(), []);
  const todayISO = useMemo(() => getTodayISO(), []);
  const dateLabel = useMemo(
    () => new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    [],
  );

  // ── Data hooks ──────────────────────────────────────────────────────────────
  const { data: todayLog } = useGetTodayLog();
  const { data: goals = [] } = useListGoals();
  const { data: habits = [] } = useListHabits();
  const { data: calendarEvents = [] } = useListCalendarEvents();

  // ── Intel fetch ─────────────────────────────────────────────────────────────
  const [intel, setIntel] = useState<ValoIntel | null>(null);
  const [intelLoading, setIntelLoading] = useState(true);

  const fetchIntel = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) { setIntelLoading(false); return; }
      const res = await fetch(`${getApiBase()}/api/vapi/intel`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as ValoIntel;
        setIntel(data);
      }
    } catch {
      // intel is optional — fail silently
    } finally {
      setIntelLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void fetchIntel();
  }, [fetchIntel]);

  // ── Derived: readiness ──────────────────────────────────────────────────────
  const readinessLabel = useMemo(
    () => computeReadinessLabel(
      todayLog?.hrv ?? null,
      todayLog?.sleepHours ?? null,
      todayLog?.restingHeartRate ?? null,
    ),
    [todayLog],
  );

  // ── Derived: next event ─────────────────────────────────────────────────────
  const { nextEvent, minutesToNextEvent } = useMemo(() => {
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
    const todayEvs = calendarEvents
      .filter(ev => ev.date === todayISO && ev.startTime != null)
      .map(ev => ({ ...ev, startMins: eventStartMinutes(ev.startTime) }))
      .filter(ev => ev.startMins != null)
      .sort((a, b) => (a.startMins ?? 0) - (b.startMins ?? 0));

    for (const ev of todayEvs) {
      const diff = (ev.startMins ?? 0) - nowMins;
      if (diff > -15) {
        return { nextEvent: ev, minutesToNextEvent: Math.max(0, diff) };
      }
    }
    return { nextEvent: null, minutesToNextEvent: null };
  }, [calendarEvents, todayISO]);

  // ── Derived: habits ─────────────────────────────────────────────────────────
  const pendingHabits = useMemo(
    () => habits.filter(h => !h.completedToday).map(h => ({ name: h.name, streak: h.streak })),
    [habits],
  );

  // ── Derived: top goal ───────────────────────────────────────────────────────
  const topGoal = useMemo(
    () => goals[0] ? { title: goals[0].title, progressPercent: goals[0].progressPercent } : null,
    [goals],
  );

  // ── Ranked glance cards ─────────────────────────────────────────────────────
  const rankedCards = useMemo(
    () => buildAndScoreCandidates({
      tod,
      readinessLabel,
      hrv: todayLog?.hrv ?? null,
      sleep: todayLog?.sleepHours ?? null,
      nextEvent,
      minutesToNextEvent,
      pendingHabits,
      topGoal,
      intel,
    }),
    [tod, readinessLabel, todayLog, nextEvent, minutesToNextEvent, pendingHabits, topGoal, intel],
  );

  // ── From Valo card text ─────────────────────────────────────────────────────
  const valoCardText = useMemo(() => {
    if (intel?.unresolved_thread) return intel.unresolved_thread;
    if (intel?.pattern_observation) return intel.pattern_observation;
    if (intel?.commitment) return `Yesterday you set an intention: "${intel.commitment}" — how are you tracking?`;
    if (tod === "morning") return "A new day. What's the one thing that matters most to you today?";
    if (tod === "midday") return "You're in the middle of it. Take a breath — how's the day unfolding so far?";
    return "The day is winding down. Ready to reflect on what went well?";
  }, [intel, tod]);

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.greeting, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {greeting}, {firstName}
            </Text>
            <Text style={[styles.dateText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {dateLabel}
            </Text>
          </View>
          <AvatarDropdown name={name} colors={colors} />
        </View>

        {/* From Valo */}
        <ValoCard text={valoCardText} loading={intelLoading} colors={colors} />

        {/* Ranked glance cards */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
          TODAY
        </Text>
        {rankedCards.map((card) => (
          <GlanceCard
            key={card.type}
            card={card}
            colors={colors}
            onCheckIn={() => setCheckInOpen(true)}
            router={router}
          />
        ))}

        {/* Footer launchpad */}
        <View style={styles.footerRow}>
          <TouchableOpacity
            style={[styles.footerBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.navigate("/tools")}
            activeOpacity={0.75}
          >
            {isIOS ? (
              <SymbolView name="square.grid.2x2" tintColor={colors.mutedForeground} size={15} />
            ) : (
              <Feather name="grid" size={15} color={colors.mutedForeground} />
            )}
            <Text style={[styles.footerBtnText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
              Text
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.footerBtn, styles.footerBtnAccent, { backgroundColor: colors.primary }]}
            onPress={() => setCheckInOpen(true)}
            activeOpacity={0.8}
          >
            <Feather name="edit-3" size={15} color={colors.primaryForeground} />
            <Text style={[styles.footerBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
              Quick capture
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <CheckInSheet isOpen={checkInOpen} onClose={() => setCheckInOpen(false)} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 24,
    marginTop: 4,
  },
  greeting: {
    fontSize: 26,
    lineHeight: 32,
    marginBottom: 4,
  },
  dateText: {
    fontSize: 13,
    lineHeight: 18,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
    marginTop: 2,
  },
  avatarText: {
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
  },
  dropdown: {
    position: "absolute",
    right: 16,
    minWidth: 220,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    overflow: "hidden",
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dropdownLabel: {
    fontSize: 15,
  },
  valoCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: 16,
    marginBottom: 28,
  },
  valoLabel: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  valoText: {
    fontSize: 15,
    lineHeight: 23,
  },
  valoFade: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
  },
  valoToggle: {
    marginTop: 6,
  },
  valoToggleLabel: {
    fontSize: 13,
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  glanceCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
  },
  glanceCardCta: {
    borderWidth: 0,
  },
  glanceCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  glanceIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  glanceTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 3,
  },
  glanceTitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  glanceSub: {
    fontSize: 13,
    lineHeight: 18,
  },
  pill: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pillText: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  footerRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 24,
  },
  footerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
  },
  footerBtnAccent: {
    borderWidth: 0,
  },
  footerBtnText: {
    fontSize: 14,
  },
});
