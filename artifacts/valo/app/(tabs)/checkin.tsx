import React, { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { useFocusEffect } from "expo-router";
import { consumeVoiceTrigger } from "@/lib/voiceTrigger";
import { trackEvent } from "@/services/telemetry";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Animated,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  PanResponder,
  Image,
} from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpsertDailyLog,
  useCreateMood,
  useGetSettings,
  useGetDashboard,
  useListHabits,
  useListMoods,
  useUpdateHabit,
  useGetTodayLog,
  getListMoodsQueryKey,
  useListDailyLogHistory,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useVapiDebrief, type DebriefExtraction } from "@/hooks/useVapiDebrief";
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

type QuickLogType = "mood" | "energy" | "workout" | "sleep" | "habits";
type UploadType = "food" | "screentime" | "progress" | "other";
type Colors = ReturnType<typeof useColors>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

function getTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function getDailyPrompt(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return DAILY_PROMPTS[dayOfYear % DAILY_PROMPTS.length] ?? DAILY_PROMPTS[0];
}

function getQuickLogCards(lifePriorities: string | null | undefined): QuickLogType[] {
  if (!lifePriorities?.trim()) {
    return ["mood", "energy", "workout", "habits"];
  }
  const p = lifePriorities.toLowerCase();
  const cards: QuickLogType[] = ["mood"];
  if (p.includes("health") || p.includes("fitness")) cards.push("workout");
  if (p.includes("health")) cards.push("sleep");
  cards.push("energy");
  const extras: QuickLogType[] = ["habits", "workout", "sleep"];
  for (const e of extras) {
    if (!cards.includes(e) && cards.length < 4) cards.push(e);
  }
  return cards.slice(0, 4);
}

function getCompletionPct(
  voiceDone: boolean,
  quickLogCount: number,
  habitsCompleted: number,
  habitsTotal: number
): number {
  let pct = 0;
  if (voiceDone) pct += 40;
  if (quickLogCount >= 2) pct += 30;
  if (habitsTotal > 0) {
    pct += Math.round((habitsCompleted / habitsTotal) * 30);
  } else if (quickLogCount >= 1) {
    pct += 10;
  }
  return Math.min(100, pct);
}

function sleepColor(hours: number | null, avg: number | null): string {
  if (hours == null || avg == null) return OK_AMBER;
  if (hours >= avg - 0.25) return GOOD_GREEN;
  if (hours >= avg - 0.75) return OK_AMBER;
  return LOW_RED;
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

// ─── Completion Ring ──────────────────────────────────────────────────────────

function CompletionRing({
  pct,
  colors,
}: {
  pct: number;
  colors: Colors;
}) {
  const SIZE = 52;
  const p = Math.min(100, Math.max(0, Math.round(pct)));
  const isComplete = p >= 100;
  const ringColor = isComplete ? USER_GREEN : colors.primary;

  return (
    <View style={{ width: SIZE, height: SIZE }}>
      {/* Track */}
      <View
        style={{
          position: "absolute",
          width: SIZE,
          height: SIZE,
          borderRadius: SIZE / 2,
          borderWidth: 3.5,
          borderColor: colors.border,
        }}
      />
      {/* Progress arcs — 4-quadrant, clockwise from 12 o'clock (rotate 45deg aligns borders) */}
      <View
        style={{
          position: "absolute",
          width: SIZE,
          height: SIZE,
          borderRadius: SIZE / 2,
          borderWidth: 3.5,
          borderTopColor: p >= 25 ? ringColor : "transparent",
          borderRightColor: p >= 50 ? ringColor : "transparent",
          borderBottomColor: p >= 75 ? ringColor : "transparent",
          borderLeftColor: p >= 100 ? ringColor : "transparent",
          transform: [{ rotate: "45deg" }],
        }}
      />
      {/* Center percentage */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontSize: 11,
            color: isComplete ? USER_GREEN : colors.foreground,
            fontFamily: "Inter_700Bold",
          }}
        >
          {p}%
        </Text>
      </View>
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

// ─── Quick Log cards + modal ──────────────────────────────────────────────────

const QUICK_LOG_CONFIG: Record<QuickLogType, { icon: string; label: string }> = {
  mood:    { icon: "smile",         label: "Mood" },
  energy:  { icon: "zap",           label: "Energy" },
  workout: { icon: "activity",      label: "Workout" },
  sleep:   { icon: "moon",          label: "Sleep" },
  habits:  { icon: "check-circle",  label: "Habits" },
};

function QuickLogCard({
  type,
  value,
  colors,
  onPress,
}: {
  type: QuickLogType;
  value: string;
  colors: Colors;
  onPress: () => void;
}) {
  const cfg = QUICK_LOG_CONFIG[type];
  const hasValue = value !== "—" && value !== "Not logged";
  return (
    <TouchableOpacity
      style={[
        styles.quickCard,
        {
          backgroundColor: colors.card,
          borderColor: hasValue ? colors.primary : colors.border,
          borderWidth: hasValue ? 1.5 : 1,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.quickCardIconWrap, { backgroundColor: hasValue ? colors.primary + "22" : colors.muted }]}>
        <Feather name={cfg.icon as any} size={18} color={hasValue ? colors.primary : colors.mutedForeground} />
      </View>
      <Text style={[styles.quickCardLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
        {cfg.label}
      </Text>
      <Text
        style={[
          styles.quickCardValue,
          {
            color: hasValue ? colors.foreground : colors.mutedForeground,
            fontFamily: hasValue ? "Inter_600SemiBold" : "Inter_400Regular",
          },
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
      {hasValue && (
        <View style={[styles.quickCardDot, { backgroundColor: colors.primary }]} />
      )}
    </TouchableOpacity>
  );
}

// ── Modal sub-loggers ─────────────────────────────────────────────────────────

const MOOD_OPTIONS = [
  { score: 2,  label: "Low"     },
  { score: 4,  label: "Okay"    },
  { score: 6,  label: "Neutral" },
  { score: 8,  label: "Good"    },
  { score: 10, label: "Great"   },
];

const ENERGY_OPTIONS = [
  { label: "Drained", score: 2  },
  { label: "Low",     score: 4  },
  { label: "Okay",    score: 6  },
  { label: "Good",    score: 8  },
  { label: "High",    score: 10 },
];

const WORKOUT_TYPES = ["Strength", "Cardio", "Yoga", "Walk", "Sport", "Rest"];

// ─── Custom PanResponder slider ───────────────────────────────────────────────

const SLIDER_THUMB = 24;
const SLIDER_TRACK_H = 6;
const SLIDER_ANCHOR_W = 44;

function ValueSlider({
  colors,
  value,
  onChange,
  anchors,
  onScrollEnabled,
}: {
  colors: Colors;
  value: number | null;
  onChange: (v: number) => void;
  anchors: Array<{ label: string; position: number }>;
  onScrollEnabled?: (enabled: boolean) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onScrollEnabledRef = useRef(onScrollEnabled);
  onScrollEnabledRef.current = onScrollEnabled;
  const effectiveValue = value ?? 5;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        onScrollEnabledRef.current?.(false);
        const tw = trackWidthRef.current;
        if (tw === 0) return;
        const x = Math.max(0, Math.min(tw, evt.nativeEvent.locationX));
        const newVal = Math.max(1, Math.min(10, Math.round((x / tw) * 9) + 1));
        onChangeRef.current(newVal);
      },
      onPanResponderMove: (evt) => {
        const tw = trackWidthRef.current;
        if (tw === 0) return;
        const x = Math.max(0, Math.min(tw, evt.nativeEvent.locationX));
        const newVal = Math.max(1, Math.min(10, Math.round((x / tw) * 9) + 1));
        onChangeRef.current(newVal);
      },
      onPanResponderRelease: () => {
        onScrollEnabledRef.current?.(true);
      },
      onPanResponderTerminate: () => {
        onScrollEnabledRef.current?.(true);
      },
    }),
  ).current;

  const thumbLeft = trackWidth > 0 ? ((effectiveValue - 1) / 9) * trackWidth : 0;
  const fillWidth  = trackWidth > 0 ? ((effectiveValue - 1) / 9) * trackWidth : 0;

  return (
    <View style={{ gap: 10 }}>
      <View
        style={{ height: SLIDER_THUMB, position: "relative" }}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          trackWidthRef.current = w;
          setTrackWidth(w);
        }}
        {...panResponder.panHandlers}
      >
        <View
          style={{
            position: "absolute",
            top: (SLIDER_THUMB - SLIDER_TRACK_H) / 2,
            left: 0,
            right: 0,
            height: SLIDER_TRACK_H,
            backgroundColor: colors.muted,
            borderRadius: SLIDER_TRACK_H / 2,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: fillWidth,
              height: SLIDER_TRACK_H,
              backgroundColor: colors.primary,
              borderRadius: SLIDER_TRACK_H / 2,
            }}
          />
        </View>
        <View
          style={{
            position: "absolute",
            top: 0,
            left: thumbLeft,
            width: SLIDER_THUMB,
            height: SLIDER_THUMB,
            borderRadius: SLIDER_THUMB / 2,
            backgroundColor: colors.primary,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.18,
            shadowRadius: 4,
            elevation: 4,
          }}
        />
      </View>
      {trackWidth > 0 && (
        <View style={{ height: 36, position: "relative" }}>
          {anchors.map(({ label, position }) => {
            const centerX = ((position - 1) / 9) * trackWidth;
            return (
              <View
                key={position}
                style={{
                  position: "absolute",
                  left: centerX - SLIDER_ANCHOR_W / 2,
                  width: SLIDER_ANCHOR_W,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    color: colors.mutedForeground,
                    fontFamily: "Inter_400Regular",
                    textAlign: "center",
                  }}
                >
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function MoodLogger({
  colors,
  onSave,
  registerSave,
  onScrollEnabled,
}: {
  colors: Colors;
  onSave: (score: number, note: string) => void;
  registerSave: (canSave: boolean, saveFn: (() => void) | null) => void;
  onScrollEnabled?: (enabled: boolean) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const noteRef = useRef(note);
  noteRef.current = note;

  useEffect(() => {
    if (selected != null) {
      const s = selected;
      registerSave(true, () => onSave(s, noteRef.current));
    } else {
      registerSave(false, null);
    }
  }, [selected]);

  return (
    <View style={{ gap: 20 }}>
      <Text
        style={{
          textAlign: "center",
          fontSize: 36,
          fontFamily: "Inter_700Bold",
          color: selected != null ? colors.primary : colors.mutedForeground,
        }}
      >
        {selected ?? "—"}
      </Text>
      <ValueSlider
        colors={colors}
        value={selected}
        onChange={(v) => { Haptics.selectionAsync(); setSelected(v); }}
        onScrollEnabled={onScrollEnabled}
        anchors={[
          { label: "Low",     position: 1  },
          { label: "Okay",    position: 3  },
          { label: "Neutral", position: 5  },
          { label: "Good",    position: 7  },
          { label: "Great",   position: 10 },
        ]}
      />
      <TextInput
        style={[
          styles.modalInput,
          { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border, fontFamily: "Inter_400Regular" },
        ]}
        placeholder="Add a note (optional)"
        placeholderTextColor={colors.mutedForeground}
        value={note}
        onChangeText={setNote}
        multiline
      />
    </View>
  );
}

function EnergyLogger({
  colors,
  onSave,
  registerSave,
  onScrollEnabled,
}: {
  colors: Colors;
  onSave: (score: number) => void;
  registerSave: (canSave: boolean, saveFn: (() => void) | null) => void;
  onScrollEnabled?: (enabled: boolean) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (selected != null) {
      const s = selected;
      registerSave(true, () => onSave(s));
    } else {
      registerSave(false, null);
    }
  }, [selected]);

  return (
    <View style={{ gap: 20 }}>
      <Text
        style={{
          textAlign: "center",
          fontSize: 36,
          fontFamily: "Inter_700Bold",
          color: selected != null ? colors.primary : colors.mutedForeground,
        }}
      >
        {selected ?? "—"}
      </Text>
      <ValueSlider
        colors={colors}
        value={selected}
        onChange={(v) => { Haptics.selectionAsync(); setSelected(v); }}
        onScrollEnabled={onScrollEnabled}
        anchors={[
          { label: "Drained", position: 1  },
          { label: "Low",     position: 3  },
          { label: "Okay",    position: 5  },
          { label: "Good",    position: 7  },
          { label: "High",    position: 10 },
        ]}
      />
    </View>
  );
}

function WorkoutLogger({
  colors,
  onSave,
  registerSave,
}: {
  colors: Colors;
  onSave: (type: string, duration: number, effort: number) => void;
  registerSave: (canSave: boolean, saveFn: (() => void) | null) => void;
}) {
  const [workoutType, setWorkoutType] = useState<string | null>(null);
  const [duration, setDuration] = useState(30);
  const [effort, setEffort] = useState(0);

  useEffect(() => {
    if (workoutType != null && effort > 0) {
      const t = workoutType; const d = duration; const e = effort;
      registerSave(true, () => onSave(t, d, e));
    } else {
      registerSave(false, null);
    }
  }, [workoutType, duration, effort]);

  return (
    <View style={{ gap: 20 }}>
      <View>
        <Text style={[styles.modalFieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          Type
        </Text>
        <View style={styles.chipsWrap}>
          {WORKOUT_TYPES.map((t) => (
            <TouchableOpacity
              key={t}
              style={[
                styles.chip,
                {
                  backgroundColor: workoutType === t ? colors.primary : colors.muted,
                  borderColor: workoutType === t ? colors.primary : colors.border,
                },
              ]}
              onPress={() => { Haptics.selectionAsync(); setWorkoutType(t); }}
              activeOpacity={0.75}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color: workoutType === t ? colors.primaryForeground : colors.foreground,
                    fontFamily: workoutType === t ? "Inter_600SemiBold" : "Inter_400Regular",
                  },
                ]}
              >
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View>
        <Text style={[styles.modalFieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          Duration
        </Text>
        <View style={styles.stepper}>
          <TouchableOpacity
            style={[styles.stepBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
            onPress={() => setDuration((d) => Math.max(5, d - 5))}
          >
            <Feather name="minus" size={16} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.stepValue, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            {duration} min
          </Text>
          <TouchableOpacity
            style={[styles.stepBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
            onPress={() => setDuration((d) => Math.min(300, d + 5))}
          >
            <Feather name="plus" size={16} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      <View>
        <Text style={[styles.modalFieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          Effort
        </Text>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((s) => (
            <TouchableOpacity key={s} onPress={() => { Haptics.selectionAsync(); setEffort(s); }} style={{ padding: 4 }}>
              <Feather name="star" size={26} color={s <= effort ? colors.primary : colors.border} />
            </TouchableOpacity>
          ))}
        </View>
      </View>

    </View>
  );
}

function SleepLogger({
  colors,
  onSave,
  registerSave,
}: {
  colors: Colors;
  onSave: (hours: number, quality: number) => void;
  registerSave: (canSave: boolean, saveFn: (() => void) | null) => void;
}) {
  const [hours, setHours] = useState(7.5);
  const [quality, setQuality] = useState(0);

  useEffect(() => {
    if (quality > 0) {
      const h = hours; const q = quality;
      registerSave(true, () => onSave(h, q));
    } else {
      registerSave(false, null);
    }
  }, [hours, quality]);

  return (
    <View style={{ gap: 20 }}>
      <View>
        <Text style={[styles.modalFieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          Duration
        </Text>
        <View style={styles.stepper}>
          <TouchableOpacity
            style={[styles.stepBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
            onPress={() => setHours((h) => Math.max(4, Math.round((h - 0.5) * 2) / 2))}
          >
            <Feather name="minus" size={16} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.stepValue, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            {hours}h
          </Text>
          <TouchableOpacity
            style={[styles.stepBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
            onPress={() => setHours((h) => Math.min(12, Math.round((h + 0.5) * 2) / 2))}
          >
            <Feather name="plus" size={16} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      <View>
        <Text style={[styles.modalFieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          Quality
        </Text>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((s) => (
            <TouchableOpacity key={s} onPress={() => { Haptics.selectionAsync(); setQuality(s); }} style={{ padding: 4 }}>
              <Feather name="star" size={26} color={s <= quality ? colors.primary : colors.border} />
            </TouchableOpacity>
          ))}
        </View>
      </View>

    </View>
  );
}

function HabitsLogger({
  habits,
  colors,
  onToggle,
}: {
  habits: { id: number; name: string; completedToday: boolean }[];
  colors: Colors;
  onToggle: (id: number, currentValue: boolean) => void;
}) {
  if (habits.length === 0) {
    return (
      <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 22 }}>
        No habits set up yet. Add habits in the Goals tab to track them here.
      </Text>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {habits.map((h) => (
        <TouchableOpacity
          key={h.id}
          style={[
            styles.habitRow,
            {
              backgroundColor: h.completedToday ? colors.primary + "12" : colors.card,
              borderColor: h.completedToday ? colors.primary : colors.border,
            },
          ]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onToggle(h.id, h.completedToday); }}
          activeOpacity={0.75}
        >
          <View
            style={[
              styles.habitCheck,
              {
                borderColor: h.completedToday ? colors.primary : colors.border,
                backgroundColor: h.completedToday ? colors.primary : "transparent",
              },
            ]}
          >
            {h.completedToday && <Feather name="check" size={12} color={colors.primaryForeground} />}
          </View>
          <Text
            style={[
              styles.habitName,
              {
                color: colors.foreground,
                fontFamily: h.completedToday ? "Inter_600SemiBold" : "Inter_400Regular",
              },
            ]}
          >
            {h.name}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Smart upload section ─────────────────────────────────────────────────────

const UPLOAD_CARDS: { type: UploadType; icon: string; title: string; subtitle: string }[] = [
  { type: "food",       icon: "camera",      title: "Food photo",      subtitle: "Snap your meal, Valo handles the rest"              },
  { type: "screentime", icon: "smartphone",  title: "Screen Time",     subtitle: "Share your weekly report, we'll find the patterns"  },
  { type: "progress",   icon: "trending-up", title: "Progress photos", subtitle: "Document your journey, one photo at a time"         },
  { type: "other",      icon: "paperclip",   title: "Everything else", subtitle: "Bloodwork, receipts, notes — if it matters, log it" },
];

function SmartUploadCard({
  card,
  saving,
  thumbnailUri,
  colors,
  onPress,
}: {
  card: (typeof UPLOAD_CARDS)[number];
  saving: boolean;
  thumbnailUri?: string;
  colors: Colors;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.uploadCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.75}
      disabled={saving}
    >
      {saving ? (
        <ActivityIndicator color={colors.primary} style={{ marginBottom: 8 }} />
      ) : thumbnailUri ? (
        <Image
          source={{ uri: thumbnailUri }}
          style={{ width: 44, height: 44, borderRadius: 8, marginBottom: 2 }}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.uploadIconWrap, { backgroundColor: colors.muted }]}>
          <Feather name={card.icon as any} size={20} color={colors.primary} />
        </View>
      )}
      <Text style={[styles.uploadTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
        {saving ? "Saving..." : card.title}
      </Text>
      <Text style={[styles.uploadSubtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        {thumbnailUri ? "Tap to update" : card.subtitle}
      </Text>
    </TouchableOpacity>
  );
}

function AnalysisResultCard({
  result,
  colors,
  onDismiss,
}: {
  result: { type: UploadType; data: Record<string, unknown> };
  colors: Colors;
  onDismiss: () => void;
}) {
  const TYPE_LABELS: Record<UploadType, string> = {
    food:       "Meal analysis",
    screentime: "Screen time report",
    progress:   "Progress notes",
    other:      "Document analysis",
  };

  function renderEntry(key: string, val: unknown, i: number): React.ReactNode {
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
      return (
        <View key={`${key}-${i}`} style={styles.resultRow}>
          <Text style={[styles.resultKey, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            {key.replace(/_/g, " ")}
          </Text>
          <Text
            style={[styles.resultVal, { color: colors.foreground, fontFamily: "Inter_400Regular", flex: 1, textAlign: "right" }]}
            numberOfLines={3}
          >
            {String(val)}
          </Text>
        </View>
      );
    }
    if (Array.isArray(val)) {
      return (
        <View key={`${key}-${i}`} style={{ gap: 6 }}>
          <Text style={[styles.resultKey, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            {key.replace(/_/g, " ")}
          </Text>
          {val.map((item, j) => (
            <View
              key={j}
              style={[styles.resultArrayItem, { backgroundColor: colors.muted, borderColor: colors.border }]}
            >
              {typeof item === "object" && item !== null
                ? Object.entries(item as Record<string, unknown>).map(([k, v]) => (
                    <Text key={k} style={[styles.resultVal, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                      {k.replace(/_/g, " ")}: {String(v)}
                    </Text>
                  ))
                : (
                  <Text style={[styles.resultVal, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                    {String(item)}
                  </Text>
                )}
            </View>
          ))}
        </View>
      );
    }
    return null;
  }

  return (
    <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.primary }]}>
      <View style={styles.resultHeader}>
        <Text style={[styles.resultTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {TYPE_LABELS[result.type]}
        </Text>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="x" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
      <View style={{ gap: 12, marginTop: 8 }}>
        {Object.entries(result.data).map(([key, val], i) => renderEntry(key, val, i))}
      </View>
    </View>
  );
}

// ─── Guided check-in types & config ──────────────────────────────────────────

type GuidedCardDef =
  | { id: string; question: string; type: "choice"; options: string[]; category: string }
  | { id: string; question: string; type: "text"; category: string };

const GUIDED_CARDS: GuidedCardDef[] = [
  { id: "sleep",            question: "How did you sleep last night?",               type: "choice", options: ["Great", "Good", "Fair", "Poor"],                       category: "Health"        },
  { id: "energy",           question: "How's your energy today?",                    type: "choice", options: ["High", "Good", "Low", "Drained"],                      category: "Health"        },
  { id: "mood",             question: "How are you feeling overall?",                type: "choice", options: ["Great", "Good", "Okay", "Rough"],                      category: "Health"        },
  { id: "stress",           question: "How was your stress today?",                  type: "choice", options: ["Low", "Moderate", "High", "Very high"],                category: "Health"        },
  { id: "water",            question: "How's your water intake?",                    type: "choice", options: ["On track", "Behind"],                                  category: "Health"        },
  { id: "workout",          question: "Did you work out today?",                     type: "choice", options: ["Yes", "No", "Rest day"],                               category: "Fitness"       },
  { id: "steps",            question: "How many steps did you get today?",           type: "choice", options: ["10k+", "7–10k", "5–7k", "Under 5k"],                  category: "Fitness"       },
  { id: "nutrition",        question: "How did you eat today?",                      type: "choice", options: ["Clean", "Pretty good", "Could be better", "Off track"], category: "Nutrition"   },
  { id: "productivity",     question: "How productive were you today?",              type: "choice", options: ["Very", "Somewhat", "Not really", "Not at all"],        category: "Productivity"  },
  { id: "connections",      question: "Did you have any meaningful conversations?",  type: "choice", options: ["Yes", "No"],                                            category: "Relationships" },
  { id: "habits",           question: "Did you complete your habits?",               type: "choice", options: ["All of them", "Most of them", "A few", "None"],        category: "Mindset"       },
  { id: "gratitude",        question: "What are you grateful for today?",            type: "text",                                                                      category: "Mindset"       },
  { id: "win",              question: "What was one win today?",                     type: "text",                                                                      category: "Mindset"       },
  { id: "tomorrow",         question: "What's your intention for tomorrow?",         type: "text",                                                                      category: "Mindset"       },
  { id: "spiritual_habits", question: "Did you complete your spiritual habits?",     type: "choice", options: ["All of them", "Most of them", "A few", "None"],        category: "Spirituality"  },
];

const CATEGORY_ORDER = ["Health", "Fitness", "Nutrition", "Productivity", "Relationships", "Mindset", "Spirituality"] as const;

const CATEGORY_META: Record<string, { color: string }> = {
  Health:        { color: "#D47A5A" },
  Fitness:       { color: "#5A9B6A" },
  Nutrition:     { color: "#C49040" },
  Productivity:  { color: "#5A7EAF" },
  Relationships: { color: "#AF5A88" },
  Mindset:       { color: "#8A5AAF" },
  Spirituality:  { color: "#C4A07A" },
};

interface StoredGuidedConfig {
  order: string[];
  hidden: string[];
}

const PRIORITY_CARD_MAP: Record<string, string[]> = {
  health:        ["sleep", "energy", "workout", "water", "nutrition"],
  fitness:       ["workout", "energy", "water", "nutrition", "sleep"],
  career:        ["productivity", "habits", "win", "tomorrow"],
  work:          ["productivity", "habits", "win", "tomorrow"],
  relationships: ["connections"],
  family:        ["connections"],
  social:        ["connections"],
  faith:         ["habits"],
  spirituality:  ["habits"],
  finance:       ["productivity", "win", "tomorrow"],
  learning:      ["habits", "productivity", "win"],
  lifestyle:     ["sleep", "energy", "water", "nutrition"],
  mental:        ["mood", "stress"],
  wellbeing:     ["mood", "stress"],
};

const ALWAYS_SHOW_IDS = ["mood", "stress"];

function deriveCardOrder(lifePriorities: string | null): string[] {
  const allIds = GUIDED_CARDS.map((c) => c.id);
  if (!lifePriorities) return allIds;

  const priorities = lifePriorities
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  const ordered: string[] = [];
  const added = new Set<string>();

  for (const priority of priorities) {
    const cards = PRIORITY_CARD_MAP[priority] ?? [];
    for (const id of cards) {
      if (!added.has(id) && allIds.includes(id)) {
        ordered.push(id);
        added.add(id);
      }
    }
  }
  for (const id of ALWAYS_SHOW_IDS) {
    if (!added.has(id) && allIds.includes(id)) {
      ordered.push(id);
      added.add(id);
    }
  }
  for (const id of allIds) {
    if (!added.has(id)) {
      ordered.push(id);
      added.add(id);
    }
  }

  return ordered;
}

// ─── Guided config modal ──────────────────────────────────────────────────────

function CategoryTag({ category }: { category: string }) {
  const meta = CATEGORY_META[category];
  const color = meta?.color ?? "#999";
  return (
    <View style={[configStyles.catTag, { backgroundColor: color + "25" }]}>
      <Text style={[configStyles.catTagText, { color, fontFamily: "Inter_600SemiBold" }]}>{category}</Text>
    </View>
  );
}

function GuidedConfigModal({
  visible,
  config,
  onChange,
  onClose,
}: {
  visible: boolean;
  config: StoredGuidedConfig;
  onChange: (c: StoredGuidedConfig) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const [localActive, setLocalActive] = useState<string[]>([]);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible) return;
    const hiddenSet = new Set(config.hidden);
    const activeFromOrder = config.order.filter((id) => !hiddenSet.has(id));
    const activeSet = new Set(activeFromOrder);
    const withAlways = [...activeFromOrder];
    for (const id of ALWAYS_SHOW_IDS) {
      if (!activeSet.has(id)) withAlways.unshift(id);
    }
    setLocalActive(withAlways);
    setExpandedCats(new Set());
  }, [visible]);

  const handleDone = () => {
    const activeSet = new Set(localActive);
    const inactive = GUIDED_CARDS.map((c) => c.id).filter((id) => !activeSet.has(id));
    onChange({ order: localActive, hidden: inactive });
    onClose();
  };

  const disableCard = (id: string) => {
    if (ALWAYS_SHOW_IDS.includes(id)) return;
    setLocalActive((prev) => prev.filter((d) => d !== id));
  };

  const enableCard = (id: string) => {
    setLocalActive((prev) => [...prev, id]);
    const card = GUIDED_CARDS.find((c) => c.id === id);
    if (card) {
      setExpandedCats((prev) => {
        const next = new Set(prev);
        next.delete(card.category);
        return next;
      });
    }
  };

  const toggleCat = (cat: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const activeItems = localActive
    .map((id) => GUIDED_CARDS.find((c) => c.id === id))
    .filter((c): c is GuidedCardDef => c !== undefined);

  const activeSet = new Set(localActive);

  const inactiveByCategory: Partial<Record<string, GuidedCardDef[]>> = {};
  for (const cat of CATEGORY_ORDER) {
    const cards = GUIDED_CARDS.filter((c) => c.category === cat && !activeSet.has(c.id));
    if (cards.length > 0) inactiveByCategory[cat] = cards;
  }
  const hasInactive = Object.keys(inactiveByCategory).length > 0;

  const renderActiveItem = ({ item, drag, isActive }: RenderItemParams<GuidedCardDef>) => {
    const isAlways = ALWAYS_SHOW_IDS.includes(item.id);
    return (
      <ScaleDecorator activeScale={0.97}>
        <View
          style={[
            configStyles.activeRow,
            { backgroundColor: isActive ? colors.muted : colors.card, borderBottomColor: colors.border },
          ]}
        >
          <TouchableOpacity
            onLongPress={drag}
            delayLongPress={120}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ opacity: isAlways ? 0.3 : 0.6 }}
            disabled={isAlways}
          >
            <Feather name="menu" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={[configStyles.rowQuestion, { color: colors.foreground, fontFamily: "Inter_400Regular" }]} numberOfLines={2}>
              {item.question}
            </Text>
            <CategoryTag category={item.category} />
          </View>
          <TouchableOpacity
            onPress={() => disableCard(item.id)}
            disabled={isAlways}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ opacity: isAlways ? 0.3 : 1 }}
          >
            <View style={[configStyles.checkCircle, { borderColor: colors.primary, backgroundColor: colors.primary + "18" }]}>
              <Feather name="check" size={13} color={colors.primary} />
            </View>
          </TouchableOpacity>
        </View>
      </ScaleDecorator>
    );
  };

  const ListHeader = (
    <View style={[configStyles.sectionBand, { backgroundColor: colors.muted, borderBottomColor: colors.border }]}>
      <Text style={[configStyles.sectionBandTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
        Active questions
      </Text>
      <Text style={[configStyles.sectionBandCount, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        {activeItems.length}
      </Text>
    </View>
  );

  const ListFooter = hasInactive ? (
    <View>
      <View
        style={[
          configStyles.sectionBand,
          {
            backgroundColor: colors.muted,
            borderTopColor: colors.border,
            borderBottomColor: colors.border,
            borderTopWidth: StyleSheet.hairlineWidth,
            marginTop: 20,
          },
        ]}
      >
        <Text style={[configStyles.sectionBandTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Add more questions
        </Text>
      </View>
      {CATEGORY_ORDER.map((cat) => {
        const cards = inactiveByCategory[cat];
        if (!cards || cards.length === 0) return null;
        const expanded = expandedCats.has(cat);
        const catColor = CATEGORY_META[cat]?.color ?? colors.primary;
        return (
          <View key={cat}>
            <TouchableOpacity
              style={[configStyles.folderRow, { borderBottomColor: colors.border, backgroundColor: colors.card }]}
              onPress={() => toggleCat(cat)}
              activeOpacity={0.7}
            >
              <View style={[configStyles.folderDot, { backgroundColor: catColor }]} />
              <Text style={[configStyles.folderName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>{cat}</Text>
              <Text style={[configStyles.folderCount, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {cards.length}
              </Text>
              <Feather
                name="chevron-right"
                size={15}
                color={colors.mutedForeground}
                style={{ transform: [{ rotate: expanded ? "90deg" : "0deg" }] }}
              />
            </TouchableOpacity>
            {expanded &&
              cards.map((card) => (
                <TouchableOpacity
                  key={card.id}
                  style={[configStyles.inactiveRow, { borderBottomColor: colors.border, backgroundColor: colors.background }]}
                  onPress={() => enableCard(card.id)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1, gap: 5 }}>
                    <Text style={[configStyles.rowQuestion, { color: colors.foreground, fontFamily: "Inter_400Regular" }]} numberOfLines={2}>
                      {card.question}
                    </Text>
                    <CategoryTag category={card.category} />
                  </View>
                  <View style={[configStyles.addBtn, { borderColor: colors.border }]}>
                    <Feather name="plus" size={16} color={colors.primary} />
                  </View>
                </TouchableOpacity>
              ))}
          </View>
        );
      })}
      <View style={{ height: 48 }} />
    </View>
  ) : (
    <View style={{ height: 48 }} />
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={configStyles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={[configStyles.sheet, { backgroundColor: colors.background }]}>
            <View style={configStyles.handleWrap}>
              <View style={[configStyles.handle, { backgroundColor: colors.border }]} />
            </View>
            <View style={[configStyles.sheetHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[configStyles.headerAction, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <Text style={[configStyles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                Customize
              </Text>
              <TouchableOpacity onPress={handleDone} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[configStyles.headerAction, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                  Done
                </Text>
              </TouchableOpacity>
            </View>
            <DraggableFlatList
              data={activeItems}
              keyExtractor={(item) => item.id}
              onDragEnd={({ data }) => setLocalActive(data.map((c) => c.id))}
              renderItem={renderActiveItem}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={ListHeader}
              ListFooterComponent={ListFooter}
            />
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const configStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.38)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%", overflow: "hidden" },
  handleWrap: { alignItems: "center", paddingTop: 10, paddingBottom: 4 },
  handle: { width: 36, height: 4, borderRadius: 2 },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16 },
  headerAction: { fontSize: 15 },
  sectionBand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionBandTitle: { flex: 1, fontSize: 12, letterSpacing: 0.5 },
  sectionBandCount: { fontSize: 12 },
  activeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowQuestion: { fontSize: 14, lineHeight: 20 },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  catTag: {
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  catTagText: { fontSize: 10, letterSpacing: 0.4 },
  folderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  folderDot: { width: 8, height: 8, borderRadius: 4 },
  folderName: { flex: 1, fontSize: 14 },
  folderCount: { fontSize: 13, marginRight: 2 },
  inactiveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingLeft: 36,
    paddingRight: 20,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  addBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

// ─── GuidedCheckin component ──────────────────────────────────────────────────

function GuidedCheckin({
  cards,
  answers,
  onAnswer,
  isSaving,
  saved,
  onSave,
}: {
  cards: GuidedCardDef[];
  answers: Record<string, string>;
  onAnswer: (id: string, value: string) => void;
  isSaving: boolean;
  saved: boolean;
  onSave: () => void;
}) {
  const colors = useColors();
  const answerCount = Object.values(answers).filter((v) => v.trim().length > 0).length;
  const canSave = answerCount >= 3 && !isSaving && !saved;

  return (
    <View style={{ gap: 12 }}>
      {cards.map((card) => {
        if (card.type === "choice") {
          return (
            <View key={card.id} style={[styles.guidedCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.guidedQuestion, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                {card.question}
              </Text>
              <View style={styles.guidedOptions}>
                {card.options.map((opt) => {
                  const selected = answers[card.id] === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onAnswer(card.id, opt); }}
                      style={[
                        styles.guidedOption,
                        {
                          backgroundColor: selected ? colors.primary : colors.muted,
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.guidedOptionText,
                          {
                            color: selected ? colors.primaryForeground : colors.foreground,
                            fontFamily: selected ? "Inter_600SemiBold" : "Inter_400Regular",
                          },
                        ]}
                      >
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        }
        return (
          <View key={card.id} style={[styles.guidedCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.guidedQuestion, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
              {card.question}
            </Text>
            <TextInput
              style={[
                styles.guidedTextInput,
                {
                  color: colors.foreground,
                  borderColor: answers[card.id]?.trim() ? colors.primary : colors.border,
                  backgroundColor: colors.background,
                  fontFamily: "Inter_400Regular",
                },
              ]}
              placeholder="Type here…"
              placeholderTextColor={colors.mutedForeground}
              value={answers[card.id] ?? ""}
              onChangeText={(text) => onAnswer(card.id, text)}
              multiline
            />
          </View>
        );
      })}

      {saved ? (
        <View style={[styles.saveBtn, { backgroundColor: USER_GREEN }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="check-circle" size={20} color="#fff" />
            <Text style={[styles.saveBtnText, { color: "#fff", fontFamily: "Inter_600SemiBold" }]}>
              Check-in saved!
            </Text>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: canSave ? colors.primary : colors.muted }]}
          onPress={onSave}
          disabled={!canSave}
          activeOpacity={0.8}
        >
          {isSaving ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text
              style={[
                styles.saveBtnText,
                {
                  color: canSave ? colors.primaryForeground : colors.mutedForeground,
                  fontFamily: "Inter_600SemiBold",
                },
              ]}
            >
              Save check-in
            </Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── PillarCard ───────────────────────────────────────────────────────────────

function PillarCard({ title, score, status, colors }: {
  title: string; score: number; status?: string | null; colors: Colors;
}) {
  const pct = Math.min(100, Math.max(0, score));
  const barColor = pct >= 70 ? GOOD_GREEN : pct >= 40 ? OK_AMBER : LOW_RED;
  return (
    <View style={[pillarCard.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={pillarCard.row}>
        <Text style={[pillarCard.title, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          {title}
        </Text>
        <Text style={[pillarCard.score, { color: barColor, fontFamily: "Inter_700Bold" }]}>
          {score}
        </Text>
      </View>
      <View style={[pillarCard.track, { backgroundColor: colors.muted }]}>
        <View style={[pillarCard.fill, { width: `${pct}%` as any, backgroundColor: barColor }]} />
      </View>
      {!!status && (
        <Text style={[pillarCard.status, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {status}
        </Text>
      )}
    </View>
  );
}

const pillarCard = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 15 },
  score: { fontSize: 22 },
  track: { height: 5, borderRadius: 3, overflow: "hidden" },
  fill: { height: 5, borderRadius: 3 },
  status: { fontSize: 13, lineHeight: 18 },
});

// ─── ActiveCalSparkline ────────────────────────────────────────────────────────

function activeCalBarColor(val: number | null, border: string): string {
  if (val == null) return border;
  if (val >= 500) return GOOD_GREEN;
  if (val >= 300) return OK_AMBER;
  return LOW_RED;
}

function ActiveCalSparkline({ history, colors }: { history: (number | null)[]; colors: Colors }) {
  const CHART_H = 28;
  const BAR_W = 14;
  const BAR_GAP = 3;

  const nums = history.filter((v): v is number => v != null);
  if (nums.length === 0) return null;

  const max = Math.max(...nums);
  const min = Math.min(...nums);
  const range = max === min ? 1 : max - min;

  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{
          fontSize: 10,
          letterSpacing: 0.8,
          color: colors.mutedForeground,
          fontFamily: "Inter_500Medium",
        }}
      >
        ACTIVE CAL · 7 DAYS
      </Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: CHART_H, gap: BAR_GAP }}>
        {history.map((val, i) => {
          const isLast = i === history.length - 1;
          const height =
            val != null
              ? Math.max(3, Math.round(((val - min) / range) * CHART_H))
              : 3;
          return (
            <View
              key={i}
              style={{
                width: BAR_W,
                height,
                backgroundColor: activeCalBarColor(val, colors.border),
                borderRadius: 3,
                opacity: isLast ? 1 : 0.55,
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

// ─── MetricTilesGrid ──────────────────────────────────────────────────────────

function MetricTilesGrid({ sleepHours, hrv, steps, rhr, activeCalories, respiratoryRate, colors, onLogSleep, onLogHrv, onLogSteps, onLogRhr, onLogActiveCal, onLogRespRate }: {
  sleepHours: number | null; hrv: number | null; steps: number | null; rhr: number | null; activeCalories: number | null; respiratoryRate: number | null;
  colors: Colors;
  onLogSleep: () => void; onLogHrv: () => void; onLogSteps: () => void; onLogRhr: () => void; onLogActiveCal: () => void; onLogRespRate: () => void;
}) {
  const tiles = [
    { label: "SLEEP", value: sleepHours != null ? `${sleepHours}h` : null, icon: "moon" as const, onPress: onLogSleep },
    { label: "HRV", value: hrv != null ? `${hrv} ms` : null, icon: "activity" as const, onPress: onLogHrv },
    { label: "STEPS", value: steps != null ? steps.toLocaleString() : null, icon: "trending-up" as const, onPress: onLogSteps },
    { label: "RHR", value: rhr != null ? `${rhr} bpm` : null, icon: "heart" as const, onPress: onLogRhr },
    { label: "ACTIVE CAL", value: activeCalories != null ? `${activeCalories.toLocaleString()} kcal` : null, icon: "zap" as const, onPress: onLogActiveCal },
    { label: "RESP. RATE", value: respiratoryRate != null ? `${respiratoryRate} brpm` : null, icon: "wind" as const, onPress: onLogRespRate },
  ];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {tiles.map((t) => (
        <TouchableOpacity
          key={t.label}
          style={[metricTile.tile, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={t.onPress}
          activeOpacity={0.75}
        >
          <Feather name={t.icon} size={16} color={t.value ? colors.foreground : colors.primary} />
          <Text style={[metricTile.label, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            {t.label}
          </Text>
          {t.value ? (
            <Text style={[metricTile.value, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {t.value}
            </Text>
          ) : (
            <Text style={[metricTile.logIt, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
              Log it
            </Text>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const metricTile = StyleSheet.create({
  tile: { flex: 1, minWidth: "44%", maxWidth: "48%", borderRadius: 14, borderWidth: 1, padding: 16, gap: 4 },
  label: { fontSize: 10, letterSpacing: 0.7 },
  value: { fontSize: 22 },
  logIt: { fontSize: 13 },
});

// ─── MorningCheckInRow ────────────────────────────────────────────────────────

function MorningCheckInRow({ moodValue, sleepValue, energyValue, onMood, onSleep, onEnergy, colors }: {
  moodValue: string; sleepValue: string; energyValue: string;
  onMood: () => void; onSleep: () => void; onEnergy: () => void;
  colors: Colors;
}) {
  const items = [
    { label: "Mood", value: moodValue, onPress: onMood, icon: "smile" as const },
    { label: "Sleep", value: sleepValue, onPress: onSleep, icon: "moon" as const },
    { label: "Energy", value: energyValue, onPress: onEnergy, icon: "zap" as const },
  ];
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      {items.map((item) => {
        const logged = item.value !== "—";
        return (
          <TouchableOpacity
            key={item.label}
            style={[morningCard.card, {
              backgroundColor: logged ? colors.primary + "18" : colors.card,
              borderColor: logged ? colors.primary + "44" : colors.border,
            }]}
            onPress={item.onPress}
            activeOpacity={0.75}
          >
            <Feather name={item.icon} size={18} color={logged ? colors.primary : colors.mutedForeground} />
            <Text style={[morningCard.label, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              {item.label}
            </Text>
            <Text style={[morningCard.value, {
              color: logged ? colors.foreground : colors.mutedForeground,
              fontFamily: logged ? "Inter_700Bold" : "Inter_400Regular",
            }]}>
              {item.value}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const morningCard = StyleSheet.create({
  card: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14, gap: 5, alignItems: "center" },
  label: { fontSize: 11, letterSpacing: 0.5 },
  value: { fontSize: 18 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

type HabitItem = { id: number; name: string; completedToday: boolean; streak: number; category: string };

export default function CheckInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId, getToken, name } = useValoAuth();
  const safeUserId = userId ?? "";

  // ── Data hooks ──────────────────────────────────────────────────────────────
  const { data: ctx, isLoading: ctxLoading } = useVoiceContext(safeUserId);
  const { callState, transcript, startCall, endCall, isMuted, toggleMute, isValoSpeaking, debriefExtraction, clearExtraction } =
    useVapiDebrief(safeUserId, getToken as () => Promise<string | null>, ctx?.first_call_completed ?? true);

  const { data: settings } = useGetSettings();
  const { data: dashboard, refetch: refetchDashboard } = useGetDashboard();
  const { data: habits } = useListHabits();
  const { data: moods } = useListMoods();
  const { data: todayLog } = useGetTodayLog();
  const { data: logHistory } = useListDailyLogHistory();

  const activeCalHistory = useMemo((): (number | null)[] => {
    if (!logHistory || logHistory.length === 0) return Array(7).fill(null) as null[];
    const sorted = [...logHistory].sort((a, b) => a.date.localeCompare(b.date));
    const last7 = sorted.slice(-7);
    const pad: null[] = Array(Math.max(0, 7 - last7.length)).fill(null);
    return [...pad, ...last7.map((l) => l.activeCalories ?? null)];
  }, [logHistory]);

  const queryClient = useQueryClient();
  const upsertLog = useUpsertDailyLog();
  const createMood = useCreateMood();
  const updateHabitMutation = useUpdateHabit();

  // ── Guided check-in state ───────────────────────────────────────────────────
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [guidedConfig, setGuidedConfig] = useState<StoredGuidedConfig | null>(null);
  const [showFullLog, setShowFullLog] = useState(false);

  // ── Quick log state ─────────────────────────────────────────────────────────
  const [activeModal, setActiveModal] = useState<QuickLogType | null>(null);
  const [isSavingLog, setIsSavingLog] = useState(false);
  const [localHabits, setLocalHabits] = useState<HabitItem[] | null>(null);
  const [modalCanSave, setModalCanSave] = useState(false);
  const [modalScrollEnabled, setModalScrollEnabled] = useState(true);
  const modalSaveFnRef = useRef<(() => void) | null>(null);
  // ── Smart upload state ──────────────────────────────────────────────────────
  const [todayMood, setTodayMood] = useState<number | null>(null);
  const [todayEnergy, setTodayEnergy] = useState<number | null>(null);
  const [savingUpload, setSavingUpload] = useState<UploadType | null>(null);
  const [uploadedPhotos, setUploadedPhotos] = useState<Partial<Record<UploadType, string>>>({});

  // ── Voice call state ────────────────────────────────────────────────────────
  const [callCompletedToday, setCallCompletedToday] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<"assistant" | "user" | null>(null);
  const [currentText, setCurrentText] = useState("");

  // ── Animation refs ──────────────────────────────────────────────────────────
  const scrollRef = useRef<ScrollView>(null);
  const mountedAtRef = useRef<number>(Date.now());
  const firstActionTrackedRef = useRef(false);
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.5)).current;
  const processingDots = useRef(new Animated.Value(0)).current;
  const liveCardOpacity = useRef(new Animated.Value(1)).current;
  const celebrateScale = useRef(new Animated.Value(1)).current;
  const celebrateOpacity = useRef(new Animated.Value(1)).current;
  const streakBounce = useRef(new Animated.Value(1)).current;
  const ringPulseSaved = useRef(new Animated.Value(1)).current;

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const tabBarH = Platform.OS === "web" ? 84 : 83;

  const GUIDED_CONFIG_KEY = `@valo/guided-config-${safeUserId}`;

  // ── Derived data ────────────────────────────────────────────────────────────
  const todayISO = getTodayISO();
  const todayMoods = moods?.filter((m) => (m as any).date === todayISO) ?? [];
  const allHabits = localHabits ?? (habits as HabitItem[] | undefined) ?? [];
  const habitsCompleted = allHabits.filter((h) => h.completedToday).length;
  const habitsTotal = allHabits.length;
  const quickLogCount = todayMoods.length + (todayLog != null ? 1 : 0);
  const completionPct = getCompletionPct(callCompletedToday, quickLogCount, habitsCompleted, habitsTotal);

  const quickLogCards = getQuickLogCards(settings?.lifePriorities);
  const latestMood = todayMoods.filter((m) => (m as any).note !== "energy" && (m as any).note !== "sleep-quality").at(-1);
  const latestEnergy = todayMoods.filter((m) => (m as any).note === "energy").at(-1);

  const quickLogValues: Record<QuickLogType, string> = {
    mood:    todayMood    != null ? `${todayMood}/10`    : latestMood    ? `${(latestMood as any).score}/10`    : "—",
    energy:  todayEnergy  != null ? `${todayEnergy}/10`  : latestEnergy  ? `${(latestEnergy as any).score}/10`  : "—",
    workout: (todayLog as any)?.workoutType || "Not logged",
    sleep:   (todayLog as any)?.sleepHours != null ? `${(todayLog as any).sleepHours}h` : "—",
    habits:  habitsTotal > 0 ? `${habitsCompleted}/${habitsTotal}` : "—",
  };

  const isActive  = callState === "active";
  const isLoading = callState === "loading";
  const isEnding  = callState === "ending";
  const isIdle    = callState === "idle";
  const showSummary = isIdle && debriefExtraction != null;

  // ── Effects ─────────────────────────────────────────────────────────────────

  // Mark voice call as completed once extraction arrives
  useEffect(() => {
    if (debriefExtraction != null) setCallCompletedToday(true);
  }, [debriefExtraction != null]);

  // Sync habits to local state
  useEffect(() => {
    if (habits) setLocalHabits(habits as HabitItem[]);
  }, [habits]);

  // Reset modal save state when log type changes
  useEffect(() => {
    setModalCanSave(false);
    modalSaveFnRef.current = null;
  }, [activeModal]);

  // Load today's uploaded photos from AsyncStorage
  useEffect(() => {
    if (!safeUserId) return;
    const key = `@valo/uploads-${safeUserId}-${todayISO}`;
    AsyncStorage.getItem(key).then((raw) => {
      if (!raw) return;
      try {
        const stored = JSON.parse(raw) as Record<string, { uri: string; timestamp: string }>;
        const photos: Partial<Record<UploadType, string>> = {};
        for (const [type, val] of Object.entries(stored)) {
          photos[type as UploadType] = val.uri;
        }
        setUploadedPhotos(photos);
      } catch {}
    });
  }, [safeUserId, todayISO]);

  // Load guided config
  useEffect(() => {
    if (!safeUserId) return;
    AsyncStorage.getItem(GUIDED_CONFIG_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as StoredGuidedConfig;
          setGuidedConfig(parsed);
          return;
        } catch {}
      }
      const order = deriveCardOrder(settings?.lifePriorities ?? null);
      setGuidedConfig({ order, hidden: [] });
    });
  }, [safeUserId]);

  useEffect(() => {
    if (guidedConfig !== null || !settings) return;
    const order = deriveCardOrder(settings.lifePriorities ?? null);
    setGuidedConfig({ order, hidden: [] });
  }, [settings]);

  // Completion celebration
  const prevPctRef = useRef<number | null>(null);
  const dataInitialized = useRef(false);
  useEffect(() => {
    if (dashboard === undefined || habits === undefined || moods === undefined) return;
    if (!dataInitialized.current) {
      dataInitialized.current = true;
      prevPctRef.current = completionPct;
      return;
    }
    if (completionPct >= 100 && (prevPctRef.current ?? 0) < 100) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.sequence([
        Animated.parallel([
          Animated.timing(celebrateScale, { toValue: 1.25, duration: 220, useNativeDriver: true }),
          Animated.timing(celebrateOpacity, { toValue: 0.75, duration: 220, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.spring(celebrateScale, { toValue: 1, friction: 4, tension: 40, useNativeDriver: true }),
          Animated.timing(celebrateOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]),
      ]).start();
    }
    prevPctRef.current = completionPct;
  }, [completionPct]);

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

  // ── Handlers ─────────────────────────────────────────────────────────────────

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

  const ringColor = isActive ? (isValoSpeaking ? VALO_BLUE : USER_GREEN) : colors.primary;

  const saveGuidedConfig = async (next: StoredGuidedConfig) => {
    setGuidedConfig(next);
    await AsyncStorage.setItem(GUIDED_CONFIG_KEY, JSON.stringify(next));
  };

  const activeCards: GuidedCardDef[] = (() => {
    if (!guidedConfig) return GUIDED_CARDS;
    const hiddenSet = new Set(guidedConfig.hidden);
    return guidedConfig.order
      .map((id) => GUIDED_CARDS.find((c) => c.id === id))
      .filter((c): c is GuidedCardDef => c !== undefined && !hiddenSet.has(c.id));
  })();

  function doLogSavedAnimations() {
    void refetchDashboard();
    Animated.sequence([
      Animated.spring(streakBounce, { toValue: 1.18, friction: 4, tension: 200, useNativeDriver: true }),
      Animated.spring(streakBounce, { toValue: 1, friction: 6, tension: 100, useNativeDriver: true }),
    ]).start();
    Animated.sequence([
      Animated.timing(ringPulseSaved, { toValue: 1.1, duration: 150, useNativeDriver: true }),
      Animated.spring(ringPulseSaved, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
    ]).start();
  }

  const MOOD_SCORE: Record<string, number> = { Great: 10, Good: 7, Okay: 5, Rough: 3 };
  const SLEEP_HOURS: Record<string, number> = { Great: 8, Good: 7, Fair: 6, Poor: 5 };
  const WORKOUT_TYPE: Record<string, string | null> = { Yes: "logged", No: null, "Rest day": "rest" };
  const STRESS_EFFORT: Record<string, number> = { Low: 1, Moderate: 4, High: 7, "Very high": 10 };

  const handleGuidedSave = useCallback(async () => {
    trackEvent("checkin.start", { type: "guided", answerCount: Object.keys(answers).length });
    setIsSaving(true);
    try {
      const moodScore = answers.mood ? MOOD_SCORE[answers.mood] : undefined;
      const sleepHours = answers.sleep ? SLEEP_HOURS[answers.sleep] : undefined;
      const workoutTypeVal = answers.workout !== undefined ? WORKOUT_TYPE[answers.workout] : undefined;
      const stressEffort = answers.stress ? STRESS_EFFORT[answers.stress] : undefined;

      await Promise.all([
        moodScore !== undefined
          ? createMood.mutateAsync({ data: { score: moodScore, note: answers.win?.trim() || null } })
          : Promise.resolve(),
        upsertLog.mutateAsync({
          data: {
            sleepHours: sleepHours ?? null,
            workoutType: workoutTypeVal !== undefined ? workoutTypeVal : null,
            workoutEffort: stressEffort ?? null,
          },
        }),
      ]);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      trackEvent("checkin.complete", { type: "guided" });
      setSaved(true);
      setTimeout(() => { setSaved(false); setAnswers({}); }, 2000);
    } catch {
      Alert.alert("Could not save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [answers, upsertLog, createMood]);

  // Quick log save handlers
  async function handleMoodSave(score: number, note: string) {
    setIsSavingLog(true);
    try {
      await createMood.mutateAsync({ data: { score, note: note.trim() || null } });
      setTodayMood(score);
      await queryClient.invalidateQueries({ queryKey: getListMoodsQueryKey() });
      void refetchDashboard();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      doLogSavedAnimations();
      setActiveModal(null);
    } catch (err) {
      Alert.alert("Could not save mood", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setIsSavingLog(false);
    }
  }

  async function handleEnergySave(score: number) {
    setIsSavingLog(true);
    try {
      await createMood.mutateAsync({ data: { score, note: "energy" } });
      setTodayEnergy(score);
      await queryClient.invalidateQueries({ queryKey: getListMoodsQueryKey() });
      void refetchDashboard();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      doLogSavedAnimations();
      setActiveModal(null);
    } catch (err) {
      Alert.alert("Could not save energy", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setIsSavingLog(false);
    }
  }

  async function handleWorkoutSave(type: string, duration: number, effort: number) {
    setIsSavingLog(true);
    try {
      await upsertLog.mutateAsync({
        data: { workoutType: type, workoutDuration: duration, workoutEffort: effort },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      doLogSavedAnimations();
      setActiveModal(null);
    } catch { Alert.alert("Could not save. Please try again."); }
    finally { setIsSavingLog(false); }
  }

  async function handleSleepSave(hours: number, quality: number) {
    setIsSavingLog(true);
    try {
      await Promise.all([
        upsertLog.mutateAsync({ data: { sleepHours: hours } }),
        quality > 0
          ? createMood.mutateAsync({ data: { score: quality * 2, note: "sleep-quality" } })
          : Promise.resolve(),
      ]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      doLogSavedAnimations();
      setActiveModal(null);
    } catch { Alert.alert("Could not save. Please try again."); }
    finally { setIsSavingLog(false); }
  }

  async function handleHabitToggle(id: number, currentValue: boolean) {
    setLocalHabits((prev) =>
      prev ? prev.map((h) => (h.id === id ? { ...h, completedToday: !currentValue } : h)) : prev
    );
    try {
      await updateHabitMutation.mutateAsync({ id, data: { completedToday: !currentValue } });
    } catch {
      setLocalHabits((prev) =>
        prev ? prev.map((h) => (h.id === id ? { ...h, completedToday: currentValue } : h)) : prev
      );
    }
  }

  // Smart upload handlers
  function handleSmartUpload(type: UploadType) {
    void doPickAndSave(type);
  }

  async function doPickAndSave(type: UploadType) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Please allow access to your photo library.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (picked.canceled || !picked.assets[0]) return;

    const uri = picked.assets[0].uri;
    setSavingUpload(type);
    try {
      const key = `@valo/uploads-${safeUserId}-${todayISO}`;
      const existing = await AsyncStorage.getItem(key);
      const stored: Record<string, { uri: string; timestamp: string }> =
        existing ? (JSON.parse(existing) as Record<string, { uri: string; timestamp: string }>) : {};
      stored[type] = { uri, timestamp: new Date().toISOString() };
      await AsyncStorage.setItem(key, JSON.stringify(stored));
      setUploadedPhotos((prev) => ({ ...prev, [type]: uri }));
      Alert.alert("Photo saved", "Valo will reference this in your check-ins.");
    } catch {
      Alert.alert("Could not save photo", "Please try again.");
    } finally {
      setSavingUpload(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const hour = new Date().getHours();

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: topPad + 16,
        paddingBottom: bottomPad + tabBarH + 24,
        paddingHorizontal: 20,
        gap: 24,
      }}
    >
      {/* ── Wordmark ──────────────────────────────────────────────────────── */}
      <Image
        source={require("@/assets/images/logo-wordmark.png")}
        style={{ height: 36, width: 237, marginBottom: 4 }}
        resizeMode="contain"
        tintColor={colors.foreground}
      />

      {/* ── Greeting row ──────────────────────────────────────────────────── */}
      <View style={styles.topRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.dateLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {todayLabel()}
          </Text>
          <Text style={[styles.header, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {greeting(hour)}{name ? `, ${name}` : ""}.
          </Text>
          <Animated.View style={[styles.streakRow, { transform: [{ scale: streakBounce }], marginTop: 4 }]}>
            <Feather name="zap" size={13} color={colors.primary} />
            <Text style={[styles.streakText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
              {dashboard?.streak ?? 0} day streak
            </Text>
          </Animated.View>
        </View>
        <Animated.View style={{ transform: [{ scale: celebrateScale }, { scale: ringPulseSaved }], opacity: celebrateOpacity }}>
          <CompletionRing pct={completionPct} colors={colors} />
        </Animated.View>
      </View>

      {/* ── Morning check-in: mood, sleep, energy ─────────────────────────── */}
      <View style={{ gap: 10 }}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          MORNING CHECK-IN
        </Text>
        <MorningCheckInRow
          moodValue={quickLogValues.mood}
          sleepValue={quickLogValues.sleep}
          energyValue={quickLogValues.energy}
          onMood={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveModal("mood"); }}
          onSleep={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveModal("sleep"); }}
          onEnergy={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveModal("energy"); }}
          colors={colors}
        />
      </View>

      {/* ── Metric tiles: Sleep, HRV, Steps, RHR ─────────────────────────── */}
      <View style={{ gap: 10 }}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          TODAY'S METRICS
        </Text>
        <MetricTilesGrid
          sleepHours={(dashboard as any)?.sleepHours ?? null}
          hrv={(dashboard as any)?.hrv ?? null}
          steps={(dashboard as any)?.steps ?? null}
          rhr={(dashboard as any)?.restingHeartRate ?? null}
          activeCalories={(dashboard as any)?.activeCalories ?? null}
          respiratoryRate={(dashboard as any)?.respiratoryRate ?? null}
          colors={colors}
          onLogSleep={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveModal("sleep"); }}
          onLogHrv={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveModal("sleep"); }}
          onLogSteps={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveModal("workout"); }}
          onLogRhr={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveModal("sleep"); }}
          onLogActiveCal={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveModal("workout"); }}
          onLogRespRate={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveModal("sleep"); }}
        />
        <ActiveCalSparkline history={activeCalHistory} colors={colors} />
      </View>

      {/* ── Pillar scores ─────────────────────────────────────────────────── */}
      <View style={{ gap: 10 }}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          PILLARS
        </Text>
        {dashboard ? (
          <>
            <PillarCard
              title="Health"
              score={(dashboard as any).healthScore ?? 0}
              status={(dashboard as any).healthStatus ?? null}
              colors={colors}
            />
            <PillarCard
              title="Work & Mission"
              score={(dashboard as any).workScore ?? 0}
              status={(dashboard as any).workStatus ?? null}
              colors={colors}
            />
            <PillarCard
              title="Relationships"
              score={(dashboard as any).relationshipScore ?? 0}
              status={(dashboard as any).relationshipStatus ?? null}
              colors={colors}
            />
          </>
        ) : (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />
        )}
      </View>

      {/* ── Quick log grid ────────────────────────────────────────────────── */}
      <View style={{ gap: 10 }}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          QUICK LOG
        </Text>
        <View style={styles.quickGrid}>
          {quickLogCards.map((type) => (
            <QuickLogCard
              key={type}
              type={type}
              value={quickLogValues[type]}
              colors={colors}
              onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveModal(type); }}
            />
          ))}
        </View>
      </View>

      {/* ── Quick log full-screen modal ───────────────────────────────────── */}
      <Modal
        visible={!!activeModal}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setActiveModal(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={[fsModal.header, { borderBottomColor: colors.border, paddingTop: insets.top }]}>
            <Text style={[fsModal.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {activeModal && QUICK_LOG_CONFIG[activeModal].label}
            </Text>
            <TouchableOpacity onPress={() => setActiveModal(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={fsModal.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            scrollEnabled={modalScrollEnabled}
          >
            {activeModal === "mood" && (
              <MoodLogger
                colors={colors}
                onSave={handleMoodSave}
                registerSave={(canSave, fn) => { setModalCanSave(canSave); modalSaveFnRef.current = fn; }}
                onScrollEnabled={setModalScrollEnabled}
              />
            )}
            {activeModal === "energy" && (
              <EnergyLogger
                colors={colors}
                onSave={handleEnergySave}
                registerSave={(canSave, fn) => { setModalCanSave(canSave); modalSaveFnRef.current = fn; }}
                onScrollEnabled={setModalScrollEnabled}
              />
            )}
            {activeModal === "workout" && (
              <WorkoutLogger
                colors={colors}
                onSave={handleWorkoutSave}
                registerSave={(canSave, fn) => { setModalCanSave(canSave); modalSaveFnRef.current = fn; }}
              />
            )}
            {activeModal === "sleep" && (
              <SleepLogger
                colors={colors}
                onSave={handleSleepSave}
                registerSave={(canSave, fn) => { setModalCanSave(canSave); modalSaveFnRef.current = fn; }}
              />
            )}
            {activeModal === "habits" && (
              <HabitsLogger habits={allHabits} colors={colors} onToggle={handleHabitToggle} />
            )}
          </ScrollView>
          <View style={[fsModal.footer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 20) }]}>
            {activeModal === "habits" ? (
              <TouchableOpacity
                style={[fsModal.saveBtn, { backgroundColor: colors.primary }]}
                onPress={() => setActiveModal(null)}
                activeOpacity={0.8}
              >
                <Text style={[fsModal.saveBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                  Done
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[fsModal.saveBtn, { backgroundColor: modalCanSave ? colors.primary : colors.muted }]}
                onPress={() => modalSaveFnRef.current?.()}
                disabled={!modalCanSave || isSavingLog}
                activeOpacity={0.8}
              >
                {isSavingLog ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={[fsModal.saveBtnText, { color: modalCanSave ? colors.primaryForeground : colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
                    Save {activeModal && QUICK_LOG_CONFIG[activeModal].label.toLowerCase()}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── Habits inline ─────────────────────────────────────────────────── */}
      <View style={{ gap: 10 }}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          HABITS
        </Text>
        {allHabits.length === 0 ? (
          <View style={[styles.emptyHabitsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" }}>
              No habits yet. Add them in the Plan tab.
            </Text>
          </View>
        ) : (
          allHabits.map((h) => (
            <TouchableOpacity
              key={h.id}
              style={[
                styles.habitRow,
                {
                  backgroundColor: h.completedToday ? colors.primary + "18" : colors.card,
                  borderColor: h.completedToday ? colors.primary + "44" : colors.border,
                },
              ]}
              onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); void handleHabitToggle(h.id, h.completedToday); }}
              activeOpacity={0.75}
            >
              <View style={[styles.habitCheck, {
                borderColor: h.completedToday ? colors.primary : colors.border,
                backgroundColor: h.completedToday ? colors.primary : "transparent",
              }]}>
                {h.completedToday && <Feather name="check" size={13} color={colors.primaryForeground} />}
              </View>
              <Text style={[styles.habitName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                {h.name}
              </Text>
              {h.streak > 0 && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Feather name="zap" size={11} color={colors.primary} />
                  <Text style={{ fontSize: 12, color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
                    {h.streak}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* ── Full check-in (collapsible guided) ────────────────────────────── */}
      <View style={{ gap: 12 }}>
        <TouchableOpacity
          style={[styles.fullLogRow, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setShowFullLog((v) => !v)}
          activeOpacity={0.75}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.fullLogTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              Full check-in
            </Text>
            <Text style={[styles.fullLogSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {activeCards.length} guided questions
            </Text>
          </View>
          {showFullLog && (
            <TouchableOpacity
              onPress={() => setShowConfigModal(true)}
              style={[styles.customizeBtn, { borderColor: colors.border, backgroundColor: colors.muted }]}
              activeOpacity={0.75}
            >
              <Feather name="sliders" size={13} color={colors.primary} />
              <Text style={[styles.customizeBtnText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
                Customize
              </Text>
            </TouchableOpacity>
          )}
          <Feather name={showFullLog ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
        </TouchableOpacity>

        {showFullLog && (
          <GuidedCheckin
            cards={activeCards}
            answers={answers}
            onAnswer={(id, val) => setAnswers((prev) => ({ ...prev, [id]: val }))}
            isSaving={isSaving}
            saved={saved}
            onSave={handleGuidedSave}
          />
        )}
      </View>

      {guidedConfig && (
        <GuidedConfigModal
          visible={showConfigModal}
          config={guidedConfig}
          onChange={saveGuidedConfig}
          onClose={() => setShowConfigModal(false)}
        />
      )}

      {/* ── Smart upload ──────────────────────────────────────────────────── */}
      <View style={{ gap: 12 }}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          SMART UPLOAD
        </Text>
        <View style={styles.uploadGrid}>
          {UPLOAD_CARDS.map((card) => (
            <SmartUploadCard
              key={card.type}
              card={card}
              saving={savingUpload === card.type}
              thumbnailUri={uploadedPhotos[card.type]}
              colors={colors}
              onPress={() => handleSmartUpload(card.type)}
            />
          ))}
        </View>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12, textAlign: "center" }}>
          AI analysis coming soon
        </Text>
      </View>

      {/* ── Evening debrief (at bottom) ───────────────────────────────────── */}
      <View style={{ gap: 12 }}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          EVENING DEBRIEF
        </Text>

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
                Start evening debrief
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
      </View>

    </ScrollView>
  );
}

// ─── Full-screen modal styles ─────────────────────────────────────────────────

const fsModal = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 20 },
  content: { padding: 24, gap: 20, paddingBottom: 32 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveBtn: { height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  saveBtnText: { fontSize: 17 },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Header
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  dateLabel: { fontSize: 13, marginBottom: 2 },
  header: { fontSize: 26, lineHeight: 32 },
  streakRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  streakText: { fontSize: 13 },

  // Habits inline
  emptyHabitsCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    alignItems: "center" as const,
  },

  // Evening debrief button
  debriefStartBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
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
  micHint: { fontSize: 14, textAlign: "center" },

  // Speaker
  speakerStatus: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
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
  callControls: { flexDirection: "row", gap: 12 },
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

  // Quick log
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  quickCard: {
    flex: 1,
    minWidth: "44%",
    maxWidth: "48%",
    borderRadius: 16,
    padding: 14,
    gap: 6,
    position: "relative",
  },
  quickCardIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  quickCardLabel: { fontSize: 11, letterSpacing: 0.5 },
  quickCardValue: { fontSize: 16 },
  quickCardDot: {
    position: "absolute", top: 10, right: 10, width: 7, height: 7, borderRadius: 3.5,
  },

  // Modal shared
  modalInput: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, minHeight: 80, textAlignVertical: "top",
  },
  modalSaveBtn: {
    height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center",
  },
  modalSaveBtnText: { fontSize: 16 },
  modalFieldLabel: { fontSize: 13, letterSpacing: 0.4, marginBottom: 10 },

  // Energy
  energyOption: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  energyOptionText: { fontSize: 15 },

  // Workout
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 14 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 20 },
  stepBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  stepValue: { fontSize: 18, minWidth: 80, textAlign: "center" },
  starsRow: { flexDirection: "row", gap: 4 },

  // Habits logger
  habitRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  habitCheck: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  habitName: { flex: 1, fontSize: 15 },

  // Smart upload
  uploadGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  uploadCard: {
    flex: 1, minWidth: "44%", maxWidth: "48%", borderRadius: 16, borderWidth: 1,
    padding: 14, gap: 6, alignItems: "flex-start",
  },
  uploadIconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  uploadTitle: { fontSize: 14 },
  uploadSubtitle: { fontSize: 12 },

  // Analysis result
  resultCard: { borderRadius: 16, borderWidth: 1.5, padding: 16, gap: 0 },
  resultHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  resultTitle: { fontSize: 16 },
  resultRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, paddingVertical: 4 },
  resultKey: { fontSize: 13, textTransform: "capitalize", flex: 0 },
  resultVal: { fontSize: 14, lineHeight: 20 },
  resultArrayItem: { borderRadius: 10, borderWidth: 1, padding: 10, gap: 2 },

  // Full log section
  fullLogRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 16, borderRadius: 16, borderWidth: 1,
  },
  fullLogTitle: { fontSize: 16 },
  fullLogSub: { fontSize: 13, marginTop: 2 },
  customizeBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
  },
  customizeBtnText: { fontSize: 13 },

  // Guided check-in
  guidedCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  guidedQuestion: { fontSize: 15, lineHeight: 22 },
  guidedOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  guidedOption: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  guidedOptionText: { fontSize: 14 },
  guidedTextInput: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, minHeight: 72, textAlignVertical: "top",
  },
  saveBtn: { height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  saveBtnText: { fontSize: 16 },
});
