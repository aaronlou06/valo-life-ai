import React, { useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useVapiDebrief } from "@/hooks/useVapiDebrief";
import { useVoiceContext, type VoiceContextData } from "@/hooks/useVoiceContext";
import { useAuth } from "@clerk/expo";

const STEPS_GOAL = 10_000;
const VALO_BLUE = "#3B82F6";
const USER_GREEN = "#22C55E";
const GOOD_GREEN = "#4CAF50";
const OK_AMBER = "#F59E0B";
const LOW_RED = "#EF4444";

function sleepColor(hours: number | null, avg: number | null): string {
  if (hours == null || avg == null) return OK_AMBER;
  if (hours >= avg - 0.25) return GOOD_GREEN;
  if (hours >= avg - 0.75) return OK_AMBER;
  return LOW_RED;
}

function buildPersonalizedPrompts(ctx: VoiceContextData): string[] {
  const prompts: string[] = [];

  if (
    ctx.hrv_today != null &&
    ctx.hrv_avg != null &&
    ctx.hrv_today < ctx.hrv_avg - 10
  ) {
    const delta = Math.round(ctx.hrv_avg - ctx.hrv_today);
    prompts.push(
      `Your HRV is ${delta} below your average — Valo will ask what may have affected your recovery`
    );
  }

  if (
    ctx.sleep_hours != null &&
    ctx.sleep_avg_30d != null &&
    ctx.sleep_hours < ctx.sleep_avg_30d - 0.75
  ) {
    prompts.push(
      "You slept less than usual — Valo will check how your energy has been holding up"
    );
  }

  if (
    ctx.top_goal &&
    ctx.top_goal_progress != null &&
    ctx.top_goal_progress < 25
  ) {
    prompts.push(
      `Progress toward "${ctx.top_goal}" — Valo will check what has moved recently`
    );
  }

  const pendingHabit =
    ctx.habits_pending_today && ctx.habits_pending_today !== "none"
      ? ctx.habits_pending_today.split(",")[0]?.trim()
      : null;
  if (pendingHabit && prompts.length < 3) {
    prompts.push(
      `"${pendingHabit}" hasn't been logged yet — Valo will check if you got to it`
    );
  }

  if (ctx.workout_logged === "no" && prompts.length < 3) {
    prompts.push("No workout logged today — Valo will ask about your movement");
  }

  if (ctx.meeting_count > 4 && prompts.length < 3) {
    prompts.push(
      `You had ${ctx.meeting_count} meetings today — Valo will check how you handled the load`
    );
  }

  const fallbacks = [
    "What moved the needle for you today?",
    "What felt hard, and what felt easy?",
    "What would you do differently tomorrow?",
  ];
  while (prompts.length < 3) {
    prompts.push(fallbacks[prompts.length] ?? fallbacks[0]!);
  }

  return prompts.slice(0, 3);
}

function DataTile({
  label,
  value,
  sub,
  dotColor,
}: {
  label: string;
  value: string;
  sub?: string;
  dotColor?: string;
}) {
  const colors = useColors();
  return (
    <View style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.tileLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
        {label}
      </Text>
      <View style={styles.tileValueRow}>
        {dotColor && <View style={[styles.tileDot, { backgroundColor: dotColor }]} />}
        <Text style={[styles.tileValue, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {value}
        </Text>
      </View>
      {sub ? (
        <Text style={[styles.tileSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

function DataTiles({ ctx }: { ctx: VoiceContextData }) {
  const sleepDot = sleepColor(ctx.sleep_hours, ctx.sleep_avg_30d);
  const sleepVal = ctx.sleep_hours != null ? `${ctx.sleep_hours}h` : "—";
  const sleepSub =
    ctx.sleep_avg_30d != null
      ? `avg ${ctx.sleep_avg_30d}h`
      : "no avg yet";

  const hrvDelta =
    ctx.hrv_today != null && ctx.hrv_avg != null
      ? Math.round(ctx.hrv_today - ctx.hrv_avg)
      : null;
  const hrvDeltaStr =
    hrvDelta != null
      ? `${hrvDelta >= 0 ? "↑" : "↓"}${Math.abs(hrvDelta)} vs avg`
      : ctx.hrv_avg != null
      ? `avg ${ctx.hrv_avg}`
      : undefined;

  const stepsVal =
    ctx.steps_today != null
      ? ctx.steps_today.toLocaleString()
      : "—";
  const stepsPct =
    ctx.steps_today != null
      ? Math.min(100, Math.round((ctx.steps_today / STEPS_GOAL) * 100))
      : null;
  const stepsSub =
    stepsPct != null ? `${stepsPct}% of ${(STEPS_GOAL / 1000).toFixed(0)}k goal` : undefined;

  const workoutVal =
    ctx.workout_type
      ? `${ctx.workout_type}${ctx.workout_duration ? `, ${ctx.workout_duration}min` : ""}`
      : "Not logged";

  const moodVal =
    ctx.mood_avg_today != null
      ? `${ctx.mood_avg_today}/10`
      : "—";
  const moodSub =
    ctx.mood_count_today > 0
      ? `${ctx.mood_count_today} check-in${ctx.mood_count_today > 1 ? "s" : ""}`
      : "No check-ins";

  return (
    <View style={styles.tilesGrid}>
      <DataTile
        label="SLEEP"
        value={sleepVal}
        sub={sleepSub}
        dotColor={sleepDot}
      />
      <DataTile
        label="HRV"
        value={ctx.hrv_today != null ? `${ctx.hrv_today}` : "—"}
        sub={hrvDeltaStr}
        dotColor={
          hrvDelta != null
            ? hrvDelta >= 5
              ? GOOD_GREEN
              : hrvDelta >= -5
              ? OK_AMBER
              : LOW_RED
            : undefined
        }
      />
      <DataTile
        label="RECOVERY"
        value={ctx.recovery_score != null ? `${ctx.recovery_score}%` : "—"}
      />
      <DataTile
        label="WORKOUT"
        value={workoutVal}
        sub={ctx.workout_duration ? undefined : ctx.workout_type ? undefined : undefined}
      />
      <DataTile label="MOOD" value={moodVal} sub={moodSub} />
      <DataTile label="STEPS" value={stepsVal} sub={stepsSub} />
    </View>
  );
}

function PromptCards({ ctx }: { ctx: VoiceContextData }) {
  const colors = useColors();
  const prompts = buildPersonalizedPrompts(ctx);
  return (
    <View style={{ gap: 8 }}>
      {prompts.map((p, i) => (
        <View
          key={i}
          style={[styles.promptCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={[styles.promptDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.promptText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
            {p}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function VoiceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId, getToken } = useAuth();
  const safeUserId = userId ?? "";

  const { data: ctx, isLoading: ctxLoading } = useVoiceContext(safeUserId);

  const { callState, transcript, startCall, endCall, isMuted, toggleMute, isValoSpeaking, summary, clearSummary } =
    useVapiDebrief(safeUserId, getToken as () => Promise<string | null>);

  const scrollRef = useRef<ScrollView>(null);
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.5)).current;
  const processingDots = useRef(new Animated.Value(0)).current;

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const tabBarH = Platform.OS === "web" ? 84 : 83;

  const isActive = callState === "active";
  const isLoading = callState === "loading";
  const isEnding = callState === "ending";
  const isIdle = callState === "idle";
  const showSummary = isIdle && summary.length > 0;

  useEffect(() => {
    if (isActive || isLoading) {
      const loop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseScale, {
              toValue: 1.25,
              duration: 900,
              useNativeDriver: true,
            }),
            Animated.timing(pulseScale, {
              toValue: 1,
              duration: 900,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(pulseOpacity, {
              toValue: 0.9,
              duration: 900,
              useNativeDriver: true,
            }),
            Animated.timing(pulseOpacity, {
              toValue: 0.2,
              duration: 900,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      loop.start();
      return () => {
        loop.stop();
        pulseScale.setValue(1);
        pulseOpacity.setValue(0.5);
      };
    }
  }, [isActive, isLoading]);

  useEffect(() => {
    if (isEnding) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(processingDots, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(processingDots, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [isEnding]);

  useEffect(() => {
    if (transcript.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [transcript.length]);

  const handleMicPress = useCallback(() => {
    if (isLoading || isEnding) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (isActive) {
      endCall();
    } else {
      startCall();
    }
  }, [isActive, isLoading, isEnding, startCall, endCall]);

  const ringColor = isActive
    ? isValoSpeaking
      ? VALO_BLUE
      : USER_GREEN
    : colors.primary;

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: topPad + 16,
        paddingBottom: bottomPad + tabBarH + 24,
        paddingHorizontal: 20,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Text style={[styles.header, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        Voice debrief
      </Text>

      {/* ── ENDING STATE: processing ────────────────────────────────────── */}
      {isEnding && (
        <View style={styles.processingContainer}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.processingTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Processing your debrief…
          </Text>
          <Text style={[styles.processingSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Valo is extracting your insights
          </Text>
        </View>
      )}

      {/* ── SUMMARY CARD ────────────────────────────────────────────────── */}
      {showSummary && (
        <View style={{ gap: 12 }}>
          <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.summaryTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              Debrief complete
            </Text>
            <Text style={[styles.summarySubheading, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              KEY TAKEAWAYS FROM VALO
            </Text>
            <View style={{ gap: 10 }}>
              {summary.map((point, i) => (
                <View key={i} style={styles.summaryPoint}>
                  <View style={[styles.summaryDot, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.summaryPointText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                    {point}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          <TouchableOpacity
            style={[styles.newDebriefBtn, { borderColor: colors.border }]}
            onPress={() => { clearSummary(); }}
          >
            <Text style={[styles.newDebriefText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              Start a new debrief
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── PRE-CALL: data tiles + prompts ──────────────────────────────── */}
      {(isIdle && !showSummary) && (
        <>
          {ctxLoading ? (
            <View style={styles.ctxLoading}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={[styles.ctxLoadingText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Loading your data…
              </Text>
            </View>
          ) : ctx ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                WHAT VALO SEES TODAY
              </Text>
              <DataTiles ctx={ctx} />

              <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 20 }]}>
                VALO WILL ASK ABOUT
              </Text>
              <PromptCards ctx={ctx} />
            </>
          ) : null}
        </>
      )}

      {/* ── LOADING: connecting ─────────────────────────────────────────── */}
      {isLoading && (
        <View style={styles.processingContainer}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.processingTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Connecting to Valo…
          </Text>
        </View>
      )}

      {/* ── ACTIVE CALL: speaker status ─────────────────────────────────── */}
      {isActive && (
        <View style={styles.speakerStatus}>
          <View style={[styles.speakerDot, { backgroundColor: isValoSpeaking ? VALO_BLUE : USER_GREEN }]} />
          <Text style={[styles.speakerLabel, { color: isValoSpeaking ? VALO_BLUE : USER_GREEN, fontFamily: "Inter_600SemiBold" }]}>
            {isValoSpeaking ? "Valo is speaking" : "Listening to you"}
          </Text>
        </View>
      )}

      {/* ── MIC BUTTON (idle + active + loading) ────────────────────────── */}
      {!isEnding && !showSummary && (
        <View style={styles.micSection}>
          <View style={styles.micWrapper}>
            {(isActive || isLoading) && (
              <Animated.View
                style={[
                  styles.pulseRing,
                  {
                    borderColor: ringColor,
                    transform: [{ scale: pulseScale }],
                    opacity: pulseOpacity,
                  },
                ]}
              />
            )}
            <TouchableOpacity
              onPress={handleMicPress}
              disabled={isLoading || isEnding}
              activeOpacity={0.8}
              style={[
                styles.micButton,
                {
                  backgroundColor: isActive
                    ? colors.primary
                    : colors.card,
                  borderColor: isActive ? colors.primary : colors.border,
                },
              ]}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.primary} size="large" />
              ) : (
                <Feather
                  name={isActive ? "square" : "mic"}
                  size={34}
                  color={isActive ? colors.primaryForeground : colors.foreground}
                />
              )}
            </TouchableOpacity>
          </View>

          {!isActive && !isLoading && (
            <Text style={[styles.micHint, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Tap to begin your evening debrief
            </Text>
          )}

          {/* Active call controls */}
          {isActive && (
            <View style={styles.callControls}>
              <TouchableOpacity
                style={[
                  styles.controlBtn,
                  {
                    backgroundColor: isMuted ? colors.muted : colors.card,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  toggleMute();
                }}
              >
                <Feather
                  name={isMuted ? "mic-off" : "mic"}
                  size={18}
                  color={isMuted ? colors.mutedForeground : colors.foreground}
                />
                <Text style={[styles.controlBtnText, { color: isMuted ? colors.mutedForeground : colors.foreground, fontFamily: "Inter_500Medium" }]}>
                  {isMuted ? "Unmute" : "Mute"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.controlBtn, styles.endBtn]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                  endCall();
                }}
              >
                <Feather name="phone-off" size={18} color="#fff" />
                <Text style={[styles.controlBtnText, { color: "#fff", fontFamily: "Inter_500Medium" }]}>
                  End call
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* ── LIVE TRANSCRIPT ─────────────────────────────────────────────── */}
      {(isActive || (isIdle && transcript.length > 0 && !showSummary)) &&
        transcript.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              TRANSCRIPT
            </Text>
            {transcript.map((entry, i) => (
              <View key={i} style={styles.transcriptRow}>
                <Text
                  style={[
                    styles.transcriptSpeaker,
                    {
                      color:
                        entry.role === "assistant" ? VALO_BLUE : colors.primary,
                      fontFamily: "Inter_600SemiBold",
                    },
                  ]}
                >
                  {entry.role === "assistant" ? "Valo" : "You"}
                </Text>
                <View
                  style={[
                    styles.transcriptBubble,
                    {
                      backgroundColor:
                        entry.role === "assistant" ? colors.card : colors.secondary,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.transcriptText,
                      { color: colors.foreground, fontFamily: "Inter_400Regular" },
                    ]}
                  >
                    {entry.text}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 28, marginBottom: 20 },

  sectionTitle: {
    fontSize: 11,
    letterSpacing: 0.9,
    marginBottom: 10,
  },

  // Data tiles
  tilesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 4,
  },
  tile: {
    flex: 1,
    minWidth: "45%",
    maxWidth: "49%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  tileLabel: { fontSize: 10, letterSpacing: 0.7 },
  tileValueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tileDot: { width: 8, height: 8, borderRadius: 4 },
  tileValue: { fontSize: 20 },
  tileSub: { fontSize: 12 },

  // Prompts
  promptCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  promptDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  promptText: { flex: 1, fontSize: 14, lineHeight: 20 },

  // Processing / loading states
  processingContainer: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  processingTitle: { fontSize: 18 },
  processingSub: { fontSize: 14 },

  // Context loading
  ctxLoading: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 16 },
  ctxLoadingText: { fontSize: 14 },

  // Speaker status
  speakerStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  speakerDot: { width: 8, height: 8, borderRadius: 4 },
  speakerLabel: { fontSize: 13 },

  // Mic
  micSection: { alignItems: "center", gap: 16, marginVertical: 24 },
  micWrapper: {
    width: 140,
    height: 140,
    justifyContent: "center",
    alignItems: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
  },
  micButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  micHint: { fontSize: 14, textAlign: "center" },

  // Call controls
  callControls: { flexDirection: "row", gap: 12 },
  controlBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
  },
  endBtn: { backgroundColor: "#EF4444", borderColor: "#EF4444" },
  controlBtnText: { fontSize: 14 },

  // Transcript
  transcriptRow: { gap: 4 },
  transcriptSpeaker: { fontSize: 11, letterSpacing: 0.5, paddingLeft: 4 },
  transcriptBubble: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  transcriptText: { fontSize: 14, lineHeight: 21 },

  // Summary
  summaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  summaryTitle: { fontSize: 20 },
  summarySubheading: { fontSize: 11, letterSpacing: 0.8 },
  summaryPoint: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  summaryDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  summaryPointText: { flex: 1, fontSize: 15, lineHeight: 22 },
  newDebriefBtn: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
  },
  newDebriefText: { fontSize: 14 },
});
