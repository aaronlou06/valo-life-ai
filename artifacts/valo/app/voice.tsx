import React, { useRef, useEffect, useCallback, useState } from "react";
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
import { useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { consumeVoiceTrigger } from "@/lib/voiceTrigger";
import { trackEvent } from "@/services/telemetry";
import { useColors } from "@/hooks/useColors";
import { useVapiDebrief } from "@/hooks/useVapiDebrief";
import { useVoiceContext, type VoiceContextData } from "@/hooks/useVoiceContext";
import { useValoAuth } from "@/contexts/AuthContext";

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS_GOAL = 10_000;
const VALO_BLUE = "#3B82F6";
const USER_GREEN = "#22C55E";
const GOOD_GREEN = "#4CAF50";
const OK_AMBER = "#F59E0B";
const LOW_RED = "#EF4444";

const DAILY_PROMPTS = [
  "What would make today a win?",
  "What are you avoiding right now?",
  "Who deserves your attention today?",
  "What drained you most this week?",
  "What are you most proud of right now?",
  "What habit do you most want to build?",
  "Where are you overcomplicating things?",
  "What would you do if you couldn't fail?",
  "What are you tolerating that you shouldn't be?",
  "Who has shown up for you lately?",
  "What would make this week feel complete?",
  "What does your body need today?",
  "What are you grateful for right now?",
  "What's one thing you can let go of?",
  "What does your future self need from you today?",
  "Where is your energy leaking?",
  "What conversation are you putting off?",
  "What small win can you create today?",
  "What does your gut say you should do?",
  "What would you regret not doing?",
  "How did you take care of yourself today?",
  "What made you smile recently?",
  "What boundary do you need to set?",
  "Who are you becoming?",
  "What is your mind telling you that isn't true?",
  "What would you tell your younger self?",
  "Where do you need to ask for help?",
  "What are you learning about yourself?",
  "What does success feel like to you right now?",
  "What would rest look like for you today?",
] as const;

type Colors = ReturnType<typeof useColors>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleepColor(hours: number | null, avg: number | null): string {
  if (hours == null || avg == null) return OK_AMBER;
  if (hours >= avg - 0.25) return GOOD_GREEN;
  if (hours >= avg - 0.75) return OK_AMBER;
  return LOW_RED;
}

function getDailyPrompt(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return DAILY_PROMPTS[dayOfYear % DAILY_PROMPTS.length] ?? DAILY_PROMPTS[0];
}

function buildPersonalizedPrompts(ctx: VoiceContextData): string[] {
  const prompts: string[] = [];

  if (ctx.hrv_today != null && ctx.hrv_avg != null && ctx.hrv_today < ctx.hrv_avg - 10) {
    const delta = Math.round(ctx.hrv_avg - ctx.hrv_today);
    prompts.push(`Your HRV is ${delta} below your average — Valo will ask what may have affected your recovery`);
  }

  if (ctx.sleep_hours != null && ctx.sleep_avg_30d != null && ctx.sleep_hours < ctx.sleep_avg_30d - 0.75) {
    prompts.push("You slept less than usual — Valo will check how your energy has been holding up");
  }

  if (ctx.top_goal && ctx.top_goal_progress != null && ctx.top_goal_progress < 25) {
    prompts.push(`Progress toward "${ctx.top_goal}" — Valo will check what has moved recently`);
  }

  const pendingHabit =
    ctx.habits_pending_today && ctx.habits_pending_today !== "none"
      ? ctx.habits_pending_today.split(",")[0]?.trim()
      : null;
  if (pendingHabit && prompts.length < 3) {
    prompts.push(`"${pendingHabit}" hasn't been logged yet — Valo will check if you got to it`);
  }

  if (ctx.workout_logged === "no" && prompts.length < 3) {
    prompts.push("No workout logged today — Valo will ask about your movement");
  }

  if (ctx.meeting_count > 4 && prompts.length < 3) {
    prompts.push(`You had ${ctx.meeting_count} meetings today — Valo will check how you handled the load`);
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

// ─── Sub-components: Data tiles ───────────────────────────────────────────────

function DataTile({ label, value, sub, dotColor }: { label: string; value: string; sub?: string; dotColor?: string }) {
  const colors = useColors();
  return (
    <View style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.tileLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>{label}</Text>
      <View style={styles.tileValueRow}>
        {dotColor && <View style={[styles.tileDot, { backgroundColor: dotColor }]} />}
        <Text style={[styles.tileValue, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>{value}</Text>
      </View>
      {sub ? (
        <Text style={[styles.tileSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{sub}</Text>
      ) : null}
    </View>
  );
}

function DataTiles({ ctx }: { ctx: VoiceContextData }) {
  const sleepDot = sleepColor(ctx.sleep_hours, ctx.sleep_avg_30d);
  const sleepVal = ctx.sleep_hours != null ? `${ctx.sleep_hours}h` : "—";
  const sleepSub = ctx.sleep_avg_30d != null ? `avg ${ctx.sleep_avg_30d}h` : "no avg yet";

  const hrvDelta =
    ctx.hrv_today != null && ctx.hrv_avg != null ? Math.round(ctx.hrv_today - ctx.hrv_avg) : null;
  const hrvDeltaStr =
    hrvDelta != null
      ? `${hrvDelta >= 0 ? "↑" : "↓"}${Math.abs(hrvDelta)} vs avg`
      : ctx.hrv_avg != null
      ? `avg ${ctx.hrv_avg}`
      : undefined;

  const stepsVal = ctx.steps_today != null ? ctx.steps_today.toLocaleString() : "—";
  const stepsPct = ctx.steps_today != null ? Math.min(100, Math.round((ctx.steps_today / STEPS_GOAL) * 100)) : null;
  const stepsSub = stepsPct != null ? `${stepsPct}% of ${(STEPS_GOAL / 1000).toFixed(0)}k goal` : undefined;

  const workoutVal = ctx.workout_type
    ? `${ctx.workout_type}${ctx.workout_duration ? `, ${ctx.workout_duration}min` : ""}`
    : "Not logged";

  const moodVal = ctx.mood_avg_today != null ? `${ctx.mood_avg_today}/10` : "—";
  const moodSub =
    ctx.mood_count_today > 0
      ? `${ctx.mood_count_today} check-in${ctx.mood_count_today > 1 ? "s" : ""}`
      : "No check-ins";

  return (
    <View style={styles.tilesGrid}>
      <DataTile label="SLEEP" value={sleepVal} sub={sleepSub} dotColor={sleepDot} />
      <DataTile
        label="HRV"
        value={ctx.hrv_today != null ? `${ctx.hrv_today}` : "—"}
        sub={hrvDeltaStr}
        dotColor={
          hrvDelta != null ? (hrvDelta >= 5 ? GOOD_GREEN : hrvDelta >= -5 ? OK_AMBER : LOW_RED) : undefined
        }
      />
      <DataTile label="RECOVERY" value={ctx.recovery_score != null ? `${ctx.recovery_score}%` : "—"} />
      <DataTile label="WORKOUT" value={workoutVal} />
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
        <View key={i} style={[styles.promptCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.promptDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.promptText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>{p}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Daily prompt card ────────────────────────────────────────────────────────

function DailyPromptCard({ colors }: { colors: Colors }) {
  const prompt = getDailyPrompt();
  return (
    <View style={[styles.dailyPromptCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      <Text style={[styles.dailyPromptLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
        Valo's question today:
      </Text>
      <Text style={[styles.dailyPromptText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
        {prompt}
      </Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function VoiceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId, getToken, name } = useValoAuth();
  const safeUserId = userId ?? "";

  const { data: ctx, isLoading: ctxLoading } = useVoiceContext(safeUserId);
  const {
    callState,
    transcript,
    startCall,
    endCall,
    isMuted,
    toggleMute,
    isValoSpeaking,
    debriefExtraction,
    clearExtraction,
  } = useVapiDebrief(safeUserId, getToken as () => Promise<string | null>, ctx?.first_call_completed ?? true);

  const [currentSpeaker, setCurrentSpeaker] = useState<"assistant" | "user" | null>(null);
  const [currentText, setCurrentText] = useState("");

  const mountedAtRef = useRef<number>(Date.now());
  const firstActionTrackedRef = useRef(false);
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.5)).current;
  const processingDots = useRef(new Animated.Value(0)).current;
  const liveCardOpacity = useRef(new Animated.Value(1)).current;

  const isActive = callState === "active";
  const isLoading = callState === "loading";
  const isEnding = callState === "ending";
  const isIdle = callState === "idle";
  const showSummary = isIdle && debriefExtraction != null;

  const ringColor = isActive ? (isValoSpeaking ? VALO_BLUE : USER_GREEN) : colors.primary;

  const topPad = (Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top) + 12;

  // Mic pulse animation
  useEffect(() => {
    if (isActive || isLoading) {
      const loop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseScale, { toValue: 1.25, duration: 900, useNativeDriver: true }),
            Animated.timing(pulseScale, { toValue: 1, duration: 900, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(pulseOpacity, { toValue: 0.9, duration: 900, useNativeDriver: true }),
            Animated.timing(pulseOpacity, { toValue: 0.2, duration: 900, useNativeDriver: true }),
          ]),
        ])
      );
      loop.start();
      return () => { loop.stop(); pulseScale.setValue(1); pulseOpacity.setValue(0.5); };
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

  // Live transcript card
  useEffect(() => {
    if (!isActive) {
      setCurrentSpeaker(null);
      setCurrentText("");
      liveCardOpacity.setValue(1);
      return;
    }
    if (transcript.length === 0) return;
    const last = transcript[transcript.length - 1];
    if (!last) return;
    const role = last.role as "assistant" | "user";
    if (currentSpeaker === null) {
      setCurrentSpeaker(role);
      setCurrentText(last.text);
    } else if (role === currentSpeaker) {
      setCurrentText(last.text);
    } else {
      Animated.timing(liveCardOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        setCurrentSpeaker(role);
        setCurrentText(last.text);
        Animated.timing(liveCardOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      });
    }
  }, [isActive, transcript.length, transcript[transcript.length - 1]?.text]);

  useFocusEffect(
    useCallback(() => {
      mountedAtRef.current = Date.now();
      firstActionTrackedRef.current = false;
      trackEvent("checkin.screen_view");
      if (consumeVoiceTrigger()) startCall();
    }, [startCall])
  );

  const handleMicPress = useCallback(() => {
    if (isLoading || isEnding) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    trackEvent("today.primary_cta_click", { action: isActive ? "end_call" : "start_call" });
    if (!firstActionTrackedRef.current) {
      firstActionTrackedRef.current = true;
      trackEvent("today.time_to_first_action", { ms: Date.now() - mountedAtRef.current });
    }
    if (isActive) endCall();
    else startCall();
  }, [isActive, isLoading, isEnding, startCall, endCall]);

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.headerBtn}>
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Voice
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: Math.max(insets.bottom, 16) + 32,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        {name ? (
          <Text style={[styles.greeting, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Let's talk, {name}.
          </Text>
        ) : null}

        {/* Processing */}
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

        {/* Summary card */}
        {showSummary && debriefExtraction != null && (
          <View style={{ gap: 12 }}>
            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.summaryTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                Debrief complete
              </Text>
              <View style={styles.summaryMeta}>
                {debriefExtraction.mood_score != null && (
                  <View style={[styles.summaryChip, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.summaryChipText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                      Mood {debriefExtraction.mood_score}/10
                    </Text>
                  </View>
                )}
                {debriefExtraction.energy_level != null && (
                  <View style={[styles.summaryChip, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.summaryChipText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                      {debriefExtraction.energy_level} energy
                    </Text>
                  </View>
                )}
                {debriefExtraction.primary_emotion != null && (
                  <View style={[styles.summaryChip, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.summaryChipText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                      {debriefExtraction.primary_emotion}
                    </Text>
                  </View>
                )}
              </View>

              {debriefExtraction.valo_observation != null && (
                <View style={{ gap: 6 }}>
                  <Text style={[styles.summarySubheading, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                    VALO'S OBSERVATION
                  </Text>
                  <Text style={[styles.summaryObservation, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                    {debriefExtraction.valo_observation}
                  </Text>
                </View>
              )}

              {(debriefExtraction.one_win != null ||
                debriefExtraction.one_struggle != null ||
                debriefExtraction.tomorrow_intention != null) && (
                <View style={{ gap: 8, marginTop: 4 }}>
                  <Text style={[styles.summarySubheading, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                    KEY POINTS
                  </Text>
                  {debriefExtraction.one_win != null && (
                    <View style={styles.summaryPoint}>
                      <View style={[styles.summaryDot, { backgroundColor: GOOD_GREEN }]} />
                      <Text style={[styles.summaryPointText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                        {debriefExtraction.one_win}
                      </Text>
                    </View>
                  )}
                  {debriefExtraction.one_struggle != null && (
                    <View style={styles.summaryPoint}>
                      <View style={[styles.summaryDot, { backgroundColor: OK_AMBER }]} />
                      <Text style={[styles.summaryPointText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                        {debriefExtraction.one_struggle}
                      </Text>
                    </View>
                  )}
                  {debriefExtraction.tomorrow_intention != null && (
                    <View style={styles.summaryPoint}>
                      <View style={[styles.summaryDot, { backgroundColor: colors.primary }]} />
                      <Text style={[styles.summaryPointText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                        Tomorrow: {debriefExtraction.tomorrow_intention}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {debriefExtraction.flags.length > 0 && (
                <View style={{ gap: 6, marginTop: 4 }}>
                  <Text style={[styles.summarySubheading, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                    VALO NOTED
                  </Text>
                  <View style={styles.summaryMeta}>
                    {debriefExtraction.flags.map((flag, i) => (
                      <View key={i} style={[styles.summaryChip, { backgroundColor: colors.muted }]}>
                        <Text style={[styles.summaryChipText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                          {flag}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.newDebriefBtn, { borderColor: colors.border }]}
              onPress={() => clearExtraction()}
            >
              <Text style={[styles.newDebriefText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                Start a new debrief
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Pre-call: prompt + context + start button */}
        {isIdle && !showSummary && (
          <>
            <DailyPromptCard colors={colors} />
            {ctxLoading ? (
              <View style={styles.ctxLoading}>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={[styles.ctxLoadingText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  Loading your context…
                </Text>
              </View>
            ) : ctx ? (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                  WHAT VALO SEES TODAY
                </Text>
                <DataTiles ctx={ctx} />
              </>
            ) : null}
            <TouchableOpacity
              style={[styles.debriefStartBtn, { backgroundColor: colors.primary }]}
              onPress={handleMicPress}
              activeOpacity={0.85}
            >
              <Feather name="mic" size={20} color={colors.primaryForeground} />
              <Text style={[styles.debriefStartText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                Start voice conversation
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* Connecting */}
        {isLoading && (
          <View style={styles.processingContainer}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.processingTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              Connecting to Valo…
            </Text>
          </View>
        )}

        {/* Active call: pulsing mic ring */}
        {isActive && (
          <View style={styles.micSection}>
            <TouchableOpacity activeOpacity={0.85} onPress={handleMicPress} style={styles.micWrapper}>
              <Animated.View
                style={[
                  styles.pulseRing,
                  { borderColor: ringColor, transform: [{ scale: pulseScale }], opacity: pulseOpacity },
                ]}
              />
              <View style={[styles.micButton, { backgroundColor: colors.card, borderColor: ringColor }]}>
                <Feather name="mic" size={36} color={ringColor} />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Active call: speaker + live transcript */}
        {isActive && (
          <View style={styles.speakerStatus}>
            <View style={[styles.speakerDot, { backgroundColor: isValoSpeaking ? VALO_BLUE : USER_GREEN }]} />
            <Text style={[styles.speakerLabel, { color: isValoSpeaking ? VALO_BLUE : USER_GREEN, fontFamily: "Inter_600SemiBold" }]}>
              {isValoSpeaking ? "Valo is speaking" : "Listening to you"}
            </Text>
          </View>
        )}

        {isActive && currentSpeaker !== null && currentText.length > 0 && (
          <Animated.View
            style={[styles.liveCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: liveCardOpacity }]}
          >
            <Text
              style={[
                styles.liveCardLabel,
                { color: currentSpeaker === "assistant" ? VALO_BLUE : USER_GREEN, fontFamily: "Inter_600SemiBold" },
              ]}
            >
              {currentSpeaker === "assistant" ? "Valo" : "You"}
            </Text>
            <Text
              style={[styles.liveCardText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
              numberOfLines={5}
              ellipsizeMode="tail"
            >
              {currentText}
            </Text>
          </Animated.View>
        )}

        {isActive && (
          <View style={styles.callControls}>
            <TouchableOpacity
              style={[
                styles.controlBtn,
                { backgroundColor: isMuted ? colors.muted : colors.card, borderColor: colors.border },
              ]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleMute(); }}
            >
              <Feather name={isMuted ? "mic-off" : "mic"} size={18} color={isMuted ? colors.mutedForeground : colors.foreground} />
              <Text style={[styles.controlBtnText, { color: isMuted ? colors.mutedForeground : colors.foreground, fontFamily: "Inter_500Medium" }]}>
                {isMuted ? "Unmute" : "Mute"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.controlBtn, styles.endBtn]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); endCall(); }}
            >
              <Feather name="phone-off" size={18} color="#fff" />
              <Text style={[styles.controlBtnText, { color: "#fff", fontFamily: "Inter_500Medium" }]}>End call</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Post-call transcript */}
        {isIdle && transcript.length > 0 && !showSummary && (
          <View style={{ gap: 8 }}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              TRANSCRIPT
            </Text>
            {transcript.map((entry, i) => (
              <View key={i} style={styles.transcriptRow}>
                <Text
                  style={[
                    styles.transcriptSpeaker,
                    { color: entry.role === "assistant" ? VALO_BLUE : colors.primary, fontFamily: "Inter_600SemiBold" },
                  ]}
                >
                  {entry.role === "assistant" ? "Valo" : "You"}
                </Text>
                <View
                  style={[
                    styles.transcriptBubble,
                    { backgroundColor: entry.role === "assistant" ? colors.card : colors.secondary, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.transcriptText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                    {entry.text}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    minWidth: 44,
    height: 32,
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
  },
  greeting: { fontSize: 24, lineHeight: 30 },

  // Evening debrief button
  debriefStartBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 54,
    borderRadius: 14,
    marginTop: 4,
  },
  debriefStartText: { fontSize: 16 },

  // Section label
  sectionLabel: { fontSize: 11, letterSpacing: 0.9 },

  // Daily prompt
  dailyPromptCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
    width: "100%",
  },
  dailyPromptLabel: { fontSize: 11, letterSpacing: 0.7 },
  dailyPromptText: { fontSize: 15, lineHeight: 22 },

  // Data tiles
  tilesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 4 },
  tile: { flex: 1, minWidth: "45%", maxWidth: "49%", borderRadius: 14, borderWidth: 1, padding: 14, gap: 4 },
  tileLabel: { fontSize: 10, letterSpacing: 0.7 },
  tileValueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tileDot: { width: 8, height: 8, borderRadius: 4 },
  tileValue: { fontSize: 20 },
  tileSub: { fontSize: 12 },

  // Prompt cards
  promptCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, borderWidth: 1, padding: 14 },
  promptDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  promptText: { flex: 1, fontSize: 14, lineHeight: 20 },

  // Processing
  processingContainer: { alignItems: "center", paddingVertical: 40, gap: 12 },
  processingTitle: { fontSize: 18 },
  processingSub: { fontSize: 14 },

  // Context loading
  ctxLoading: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 16 },
  ctxLoadingText: { fontSize: 14 },

  // Mic
  micSection: { alignItems: "center", gap: 16, marginVertical: 8 },
  micWrapper: { width: 140, height: 140, justifyContent: "center", alignItems: "center" },
  pulseRing: { position: "absolute", width: 140, height: 140, borderRadius: 70, borderWidth: 3 },
  micButton: {
    width: 100, height: 100, borderRadius: 50, borderWidth: 2,
    justifyContent: "center", alignItems: "center",
  },

  // Speaker
  speakerStatus: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, justifyContent: "center" },
  speakerDot: { width: 8, height: 8, borderRadius: 4 },
  speakerLabel: { fontSize: 13 },

  // Live card
  liveCard: {
    borderRadius: 16, borderWidth: 1, paddingHorizontal: 18, paddingVertical: 16,
    gap: 6, marginVertical: 8, alignItems: "center",
  },
  liveCardLabel: { fontSize: 11, letterSpacing: 0.8, alignSelf: "center" },
  liveCardText: { fontSize: 17, lineHeight: 26, textAlign: "center" },

  // Call controls
  callControls: { flexDirection: "row", gap: 12, justifyContent: "center" },
  controlBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24, borderWidth: 1,
  },
  endBtn: { backgroundColor: "#EF4444", borderColor: "#EF4444" },
  controlBtnText: { fontSize: 14 },

  // Transcript
  transcriptRow: { gap: 4 },
  transcriptSpeaker: { fontSize: 11, letterSpacing: 0.5, paddingLeft: 4 },
  transcriptBubble: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  transcriptText: { fontSize: 14, lineHeight: 21 },

  // Summary
  summaryCard: { borderRadius: 16, borderWidth: 1, padding: 18, gap: 14 },
  summaryTitle: { fontSize: 18 },
  summaryMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 4 },
  summaryChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  summaryChipText: { fontSize: 12 },
  summarySubheading: { fontSize: 11, letterSpacing: 0.7 },
  summaryObservation: { fontSize: 15, lineHeight: 23 },
  summaryPoint: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  summaryDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  summaryPointText: { flex: 1, fontSize: 14, lineHeight: 21 },
  newDebriefBtn: {
    alignItems: "center", paddingVertical: 14, borderRadius: 14, borderWidth: 1,
  },
  newDebriefText: { fontSize: 14 },
});
