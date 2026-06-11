import React, { useEffect, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
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
const BLUE = "#5B7FA6";

const SOUNDS = ["None", "Rain", "Cafe", "White Noise", "Forest"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default function FocusTimerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [focusLen, setFocusLen] = useState(25);
  const [breakLen, setBreakLen] = useState(5);
  const [rounds, setRounds] = useState(4);
  const [currentRound, setCurrentRound] = useState(0);
  const [mode, setMode] = useState<"Focus" | "Break">("Focus");
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [sound, setSound] = useState("None");
  const [appBlock, setAppBlock] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (mode === "Focus") {
            setMode("Break");
            setCurrentRound((r) => r + 1);
            return breakLen * 60;
          } else {
            setMode("Focus");
            return focusLen * 60;
          }
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, mode, focusLen, breakLen]);

  function reset() {
    setRunning(false);
    setMode("Focus");
    setSecondsLeft(focusLen * 60);
    setCurrentRound(0);
  }

  function stepFocus(delta: number) {
    const next = Math.max(5, focusLen + delta);
    setFocusLen(next);
    if (!running) setSecondsLeft(next * 60);
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: BORDER }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={TERRA} />
        </TouchableOpacity>
        <Text style={[styles.title, { fontFamily: "Inter_600SemiBold" }]}>Focus Timer</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, alignItems: "center" }}
      >
        <View style={[styles.timerCard, { borderColor: BORDER }]}>
          <Text style={[styles.modeLabel, { color: mode === "Focus" ? BLUE : MUTED, fontFamily: "Inter_600SemiBold" }]}>
            {mode}
          </Text>
          <Text style={[styles.timerDisplay, { color: SLATE, fontFamily: "Inter_700Bold" }]}>
            {pad(Math.floor(secondsLeft / 60))}:{pad(secondsLeft % 60)}
          </Text>
          <View style={styles.roundDots}>
            {Array.from({ length: rounds }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { backgroundColor: i < currentRound ? BLUE : BORDER },
                ]}
              />
            ))}
          </View>
          <View style={styles.timerButtons}>
            <TouchableOpacity
              onPress={() => setRunning((v) => !v)}
              activeOpacity={0.8}
              style={[styles.mainBtn, { backgroundColor: running ? MUTED : BLUE }]}
            >
              <Text style={[styles.mainBtnText, { fontFamily: "Inter_600SemiBold" }]}>
                {running ? "Pause" : "Start"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={reset} activeOpacity={0.7} style={styles.resetBtn}>
              <Feather name="refresh-ccw" size={20} color={MUTED} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.fullWidth, { marginTop: 24 }]}>
          <Text style={[styles.sectionLabel, { fontFamily: "Inter_600SemiBold" }]}>Session Config</Text>
          {[
            { label: "Focus length", value: focusLen, unit: "min", onChange: (d: number) => stepFocus(d) },
            { label: "Break length", value: breakLen, unit: "min", onChange: (d: number) => setBreakLen((v) => Math.max(1, v + d)) },
            { label: "Rounds", value: rounds, unit: "", onChange: (d: number) => setRounds((v) => Math.max(1, v + d)) },
          ].map((row) => (
            <View key={row.label} style={[styles.configRow, { borderColor: BORDER }]}>
              <Text style={[styles.configLabel, { fontFamily: "Inter_400Regular" }]}>{row.label}</Text>
              <View style={styles.stepper}>
                <TouchableOpacity onPress={() => row.onChange(-1)} style={styles.stepBtn}>
                  <Feather name="minus" size={16} color={BLUE} />
                </TouchableOpacity>
                <Text style={[styles.stepValue, { fontFamily: "Inter_600SemiBold" }]}>
                  {row.value}{row.unit}
                </Text>
                <TouchableOpacity onPress={() => row.onChange(1)} style={styles.stepBtn}>
                  <Feather name="plus" size={16} color={BLUE} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        <View style={[styles.fullWidth, { marginTop: 24 }]}>
          <Text style={[styles.sectionLabel, { fontFamily: "Inter_600SemiBold" }]}>Ambient Sound</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
            {SOUNDS.map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => setSound(s)}
                activeOpacity={0.7}
                style={[
                  styles.soundChip,
                  { backgroundColor: sound === s ? BLUE : CARD, borderColor: sound === s ? BLUE : BORDER },
                ]}
              >
                <Text
                  style={[
                    styles.soundText,
                    { color: sound === s ? "#FFFFFF" : MUTED, fontFamily: "Inter_500Medium" },
                  ]}
                >
                  {s}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {/* TODO: wire ambient audio */}
        </View>

        <View style={[styles.fullWidth, { marginTop: 24 }]}>
          <View style={[styles.blockCard, { borderColor: BORDER }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.blockTitle, { fontFamily: "Inter_600SemiBold" }]}>
                Block distracting apps during focus
              </Text>
              <Text style={[styles.blockSub, { fontFamily: "Inter_400Regular" }]}>
                Blocks selected apps while the timer runs.
              </Text>
              {/* TODO: native app-blocking integration (Screen Time API) */}
            </View>
            <Switch
              value={appBlock}
              onValueChange={setAppBlock}
              trackColor={{ false: BORDER, true: `${BLUE}88` }}
              thumbColor={appBlock ? BLUE : "#FFFFFF"}
            />
          </View>
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
  timerCard: {
    width: "100%",
    backgroundColor: CARD,
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
    marginTop: 8,
  },
  modeLabel: { fontSize: 13, letterSpacing: 1, marginBottom: 8 },
  timerDisplay: { fontSize: 64, marginBottom: 20 },
  roundDots: { flexDirection: "row", gap: 8, marginBottom: 24 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  timerButtons: { flexDirection: "row", alignItems: "center", gap: 16 },
  mainBtn: { paddingHorizontal: 40, paddingVertical: 14, borderRadius: 28 },
  mainBtnText: { color: "#FFFFFF", fontSize: 16 },
  resetBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: `${MUTED}18`, alignItems: "center", justifyContent: "center" },
  fullWidth: { width: "100%" },
  sectionLabel: { fontSize: 13, color: SLATE, marginBottom: 12 },
  configRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: CARD,
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
  },
  configLabel: { fontSize: 14, color: SLATE },
  stepper: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: `${BLUE}18`, alignItems: "center", justifyContent: "center" },
  stepValue: { fontSize: 15, color: SLATE, minWidth: 32, textAlign: "center" },
  soundChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  soundText: { fontSize: 13 },
  blockCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  blockTitle: { fontSize: 14, color: SLATE, marginBottom: 4 },
  blockSub: { fontSize: 12, color: MUTED },
});
