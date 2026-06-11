import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

const BG = "#F7F5F2";
const CARD = "#FFFFFF";
const BORDER = "#E8E4DE";
const SLATE = "#1A1814";
const MUTED = "#8B8780";
const TERRA = "#C17B3F";
const SAGE = "#6B9E78";

type Pattern = { label: string; inhale: number; hold: number; exhale: number; hold2?: number };

const PATTERNS: Pattern[] = [
  { label: "Box", inhale: 4, hold: 4, exhale: 4, hold2: 4 },
  { label: "Calm", inhale: 4, hold: 7, exhale: 8 },
  { label: "Simple", inhale: 4, hold: 0, exhale: 4 },
];

const SESSIONS = [
  { label: "5-min Reset", duration: "5 min", icon: "zap" as const },
  { label: "10-min Focus", duration: "10 min", icon: "target" as const },
  { label: "Sleep Wind-down", duration: "15 min", icon: "moon" as const },
];

export default function MeditateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [patternIdx, setPatternIdx] = useState(0);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<"Breathe in" | "Hold" | "Breathe out">("Breathe in");
  const [startingSession, setStartingSession] = useState<string | null>(null);
  const scale = useRef(new Animated.Value(1)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  const pat = PATTERNS[patternIdx]!;

  function runCycle() {
    const seq: Animated.CompositeAnimation[] = [];
    seq.push(
      Animated.timing(scale, { toValue: 1.5, duration: pat.inhale * 1000, useNativeDriver: true })
    );
    if (pat.hold > 0) {
      seq.push(
        Animated.delay(pat.hold * 1000)
      );
    }
    seq.push(
      Animated.timing(scale, { toValue: 1, duration: pat.exhale * 1000, useNativeDriver: true })
    );
    if (pat.hold2 && pat.hold2 > 0) {
      seq.push(Animated.delay(pat.hold2 * 1000));
    }
    return Animated.sequence(seq);
  }

  useEffect(() => {
    if (!running) {
      animRef.current?.stop();
      scale.setValue(1);
      setPhase("Breathe in");
      return;
    }

    let cancelled = false;

    async function loop() {
      const phases: Array<{ label: "Breathe in" | "Hold" | "Breathe out"; duration: number }> = [
        { label: "Breathe in", duration: pat.inhale },
        ...(pat.hold > 0 ? [{ label: "Hold" as const, duration: pat.hold }] : []),
        { label: "Breathe out", duration: pat.exhale },
        ...(pat.hold2 && pat.hold2 > 0 ? [{ label: "Hold" as const, duration: pat.hold2 }] : []),
      ];

      while (!cancelled) {
        for (const p of phases) {
          if (cancelled) break;
          setPhase(p.label);
          await new Promise<void>((res) => setTimeout(res, p.duration * 1000));
        }
      }
    }

    const anim = Animated.loop(runCycle());
    animRef.current = anim;
    anim.start();
    loop();

    return () => {
      cancelled = true;
      anim.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, patternIdx]);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[styles.header, { paddingTop: (Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top) + 12, borderBottomColor: BORDER }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={TERRA} />
        </TouchableOpacity>
        <Text style={[styles.title, { fontFamily: "Inter_600SemiBold" }]}>Breathe & Meditate</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, alignItems: "center" }}
      >
        <View style={styles.orbWrap}>
          <Animated.View
            style={[
              styles.orb,
              { transform: [{ scale }] },
            ]}
          />
        </View>
        <Text style={[styles.phaseLabel, { fontFamily: "Inter_600SemiBold" }]}>{phase}</Text>

        <View style={styles.patternRow}>
          {PATTERNS.map((p, i) => (
            <TouchableOpacity
              key={p.label}
              onPress={() => { setPatternIdx(i); setRunning(false); }}
              activeOpacity={0.7}
              style={[
                styles.pill,
                {
                  backgroundColor: patternIdx === i ? SAGE : CARD,
                  borderColor: patternIdx === i ? SAGE : BORDER,
                },
              ]}
            >
              <Text
                style={[
                  styles.pillText,
                  { color: patternIdx === i ? "#FFFFFF" : MUTED, fontFamily: "Inter_500Medium" },
                ]}
              >
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => setRunning((v) => !v)}
          activeOpacity={0.8}
          style={[styles.startBtn, { backgroundColor: running ? MUTED : SAGE }]}
        >
          <Text style={[styles.startBtnText, { fontFamily: "Inter_600SemiBold" }]}>
            {running ? "Stop" : "Start"}
          </Text>
        </TouchableOpacity>

        <View style={[styles.fullWidth, { marginTop: 32 }]}>
          <Text style={[styles.sectionLabel, { fontFamily: "Inter_600SemiBold" }]}>Sessions</Text>
          {SESSIONS.map((s) => (
            <TouchableOpacity
              key={s.label}
              activeOpacity={0.8}
              onPress={() => setStartingSession(s.label)}
              style={[styles.sessionCard, { borderColor: startingSession === s.label ? SAGE : BORDER }]}
            >
              <View style={[styles.sessionIcon, { backgroundColor: `${SAGE}22` }]}>
                <Feather name={s.icon} size={18} color={SAGE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sessionLabel, { fontFamily: "Inter_600SemiBold" }]}>
                  {s.label}
                </Text>
                {startingSession === s.label ? (
                  <Text style={[styles.sessionMeta, { color: SAGE, fontFamily: "Inter_400Regular" }]}>
                    Starting...
                  </Text>
                ) : (
                  <Text style={[styles.sessionMeta, { fontFamily: "Inter_400Regular" }]}>
                    {s.duration}
                  </Text>
                )}
              </View>
              <Feather name="play" size={16} color={SAGE} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: BG,
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, color: SLATE },
  orbWrap: { width: 180, height: 180, alignItems: "center", justifyContent: "center", marginTop: 32, marginBottom: 16 },
  orb: { width: 120, height: 120, borderRadius: 60, backgroundColor: `${SAGE}55`, borderWidth: 3, borderColor: SAGE },
  phaseLabel: { fontSize: 18, color: SAGE, marginBottom: 24 },
  patternRow: { flexDirection: "row", gap: 8, marginBottom: 24 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: { fontSize: 13 },
  startBtn: { paddingHorizontal: 48, paddingVertical: 14, borderRadius: 28 },
  startBtnText: { color: "#FFFFFF", fontSize: 16 },
  fullWidth: { width: "100%" },
  sectionLabel: { fontSize: 13, color: SLATE, marginBottom: 12 },
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
    gap: 12,
  },
  sessionIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sessionLabel: { fontSize: 14, color: SLATE },
  sessionMeta: { fontSize: 12, color: MUTED, marginTop: 2 },
});
