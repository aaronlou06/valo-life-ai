import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Svg, { Polyline } from "react-native-svg";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useWorkoutCopilot } from "@/contexts/WorkoutCopilotContext";
import { useHeartRate } from "@/contexts/HeartRateContext";
import {
  computeLiveStats,
  estimateMaxHr,
  fmtZoneSeconds,
  zoneForBpm,
  type HrSample,
} from "@/lib/heartRate";

// ─── Types ─────────────────────────────────────────────────────────────────

type TrackingType =
  | "weight_reps"
  | "bodyweight_reps"
  | "weighted_bodyweight"
  | "reps_only"
  | "duration"
  | "distance_duration"
  | "cardio_machine";

type ExerciseItem = {
  id: number;
  exerciseId: number;
  name: string;
  category: string;
  trackingType: TrackingType;
  orderIndex: number;
  prescribedSets: number | null;
  prescribedReps: number | null;
  prescribedWeightKg: number | null;
  prescribedDurationSec: number | null;
  prescribedDistanceM: number | null;
  restSec: number;
  supersetGroupId: number | null;
  notes: string | null;
};

type LoggedSet = {
  id: number;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null;
  distanceM: number | null;
  rpe: number | null;
  isWarmup: boolean;
  isPersonalBest: boolean;
};

type SetDraft = {
  weightKg: number;
  reps: number;
  durationMin: number;
  durationSec: number;
  distanceM: number;
  rpe: number;
  isWarmup: boolean;
};

type LibraryExercise = {
  id: number;
  name: string;
  category: string;
  trackingType: string;
};

type CompleteResult = {
  session: { id: number; completedAt: string | null };
  prs: Array<{ exerciseName?: string; metricType?: string; value?: number }>;
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function round(v: number, step: number): number {
  return Math.round(v / step) * step;
}

function fmtKg(v: number): string {
  return v % 1 === 0 ? String(v) : v.toFixed(1);
}

function fmtElapsed(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function fmtTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatSetDisplay(set: LoggedSet, type: TrackingType): string {
  switch (type) {
    case "weight_reps":
    case "weighted_bodyweight":
      return `${fmtKg(set.weightKg ?? 0)} kg × ${set.reps ?? 0}`;
    case "bodyweight_reps":
    case "reps_only":
      return `${set.reps ?? 0} reps`;
    case "duration":
      return fmtTime(set.durationSec ?? 0);
    case "distance_duration":
    case "cardio_machine": {
      const d = set.distanceM ?? 0;
      return d >= 1000
        ? `${(d / 1000).toFixed(1)} km · ${fmtTime(set.durationSec ?? 0)}`
        : `${d} m · ${fmtTime(set.durationSec ?? 0)}`;
    }
    default:
      return "—";
  }
}

function exerciseDefaultDraft(ex: ExerciseItem): SetDraft {
  return {
    weightKg: ex.prescribedWeightKg ?? 40,
    reps: ex.prescribedReps ?? 10,
    durationMin: ex.prescribedDurationSec ? Math.floor(ex.prescribedDurationSec / 60) : 0,
    durationSec: ex.prescribedDurationSec ? ex.prescribedDurationSec % 60 : 30,
    distanceM: ex.prescribedDistanceM ?? 100,
    rpe: 0,
    isWarmup: false,
  };
}

function setToDraft(set: LoggedSet): SetDraft {
  return {
    weightKg: set.weightKg ?? 40,
    reps: set.reps ?? 10,
    durationMin: set.durationSec ? Math.floor(set.durationSec / 60) : 0,
    durationSec: set.durationSec ? set.durationSec % 60 : 30,
    distanceM: set.distanceM ?? 100,
    rpe: set.rpe ?? 0,
    isWarmup: false,
  };
}

function buildSetBody(
  draft: SetDraft,
  trackingType: TrackingType,
  setNumber: number,
  exerciseId: number,
) {
  const base = {
    exerciseId,
    setNumber,
    isWarmup: draft.isWarmup,
    rpe: draft.rpe > 0 ? draft.rpe : null,
  };
  const totalDurationSec = draft.durationMin * 60 + draft.durationSec;
  switch (trackingType) {
    case "weight_reps":
    case "weighted_bodyweight":
      return { ...base, weightKg: draft.weightKg || null, reps: draft.reps || null };
    case "bodyweight_reps":
    case "reps_only":
      return { ...base, reps: draft.reps || null };
    case "duration":
      return { ...base, durationSec: totalDurationSec || null };
    case "distance_duration":
    case "cardio_machine":
      return {
        ...base,
        distanceM: draft.distanceM || null,
        durationSec: totalDurationSec || null,
      };
    default:
      return base;
  }
}

function buildSupersetLabels(exercises: ExerciseItem[]): Map<number, string> {
  const map = new Map<number, string>();
  let idx = 0;
  for (const ex of exercises) {
    if (ex.supersetGroupId !== null && !map.has(ex.supersetGroupId)) {
      map.set(ex.supersetGroupId, String.fromCharCode(65 + idx++));
    }
  }
  return map;
}

// ─── Sub-components ────────────────────────────────────────────────────────

type StepperProps = {
  label: string;
  value: number;
  step: number;
  min?: number;
  max?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  colors: ReturnType<typeof useColors>;
};

function Stepper({ label, value, step, min = 0, max = 99999, format, onChange, colors }: StepperProps) {
  const fmt = format ?? String;
  return (
    <View style={stepStyles.wrap}>
      <Text style={[stepStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={stepStyles.row}>
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onChange(Math.max(min, round(value - step, step)));
          }}
          style={[stepStyles.btn, { backgroundColor: colors.secondary }]}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Text style={[stepStyles.btnText, { color: colors.foreground }]}>−</Text>
        </TouchableOpacity>
        <View style={stepStyles.valueWrap}>
          <Text style={[stepStyles.value, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {fmt(value)}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onChange(Math.min(max, round(value + step, step)));
          }}
          style={[stepStyles.btn, { backgroundColor: colors.secondary }]}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Text style={[stepStyles.btnText, { color: colors.foreground }]}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const stepStyles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center" },
  label: { fontSize: 11, marginBottom: 8, letterSpacing: 0.4, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center" },
  btn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { fontSize: 22, lineHeight: 28, marginTop: -2 },
  valueWrap: { minWidth: 80, alignItems: "center", paddingHorizontal: 4 },
  value: { fontSize: 26 },
});

// ─── HR sparkline ──────────────────────────────────────────────────────────

function HrSparkline({
  samples,
  color,
  maxHr,
}: {
  samples: HrSample[];
  color: string;
  maxHr: number;
}) {
  const width = 280;
  const height = 56;
  if (samples.length < 2) {
    return <View style={{ height }} />;
  }
  // Keep the most recent 60 readings so the trace stays legible.
  const recent = samples.slice(-60);
  const bpms = recent.map((s) => s.bpm);
  const lo = Math.min(...bpms, 40);
  const hi = Math.max(...bpms, maxHr * 0.5);
  const range = Math.max(1, hi - lo);
  const stepX = recent.length > 1 ? width / (recent.length - 1) : width;
  const points = recent
    .map((s, i) => {
      const x = i * stepX;
      const y = height - 4 - ((s.bpm - lo) / range) * (height - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────

export default function CopilotWorkoutScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeSession, endSession } = useWorkoutCopilot();
  const hr = useHeartRate();
  const params = useLocalSearchParams<{ sessionId?: string; templateId?: string }>();

  const sessionId = params.sessionId
    ? parseInt(params.sessionId, 10)
    : (activeSession?.sessionId ?? null);

  const templateId = params.templateId
    ? parseInt(params.templateId, 10)
    : (activeSession?.templateId ?? null);

  // ── Exercises ──
  const [exercises, setExercises] = useState<ExerciseItem[]>([]);
  const [loadingExercises, setLoadingExercises] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);

  // ── Set tracking ──
  const [loggedSets, setLoggedSets] = useState<Map<number, LoggedSet[]>>(new Map());
  const [draft, setDraft] = useState<SetDraft>({
    weightKg: 40, reps: 10, durationMin: 0, durationSec: 30,
    distanceM: 100, rpe: 0, isWarmup: false,
  });

  // ── Rest timer ──
  const [restRemaining, setRestRemaining] = useState<number | null>(null);

  // ── Session timer ──
  const [elapsed, setElapsed] = useState(0);

  // ── UI state ──
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [libraryExercises, setLibraryExercises] = useState<LibraryExercise[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [loadingLibrary, setLoadingLibrary] = useState(false);

  // ── Heart rate ──
  const [maxHr, setMaxHr] = useState<number>(190);
  const [showHrModal, setShowHrModal] = useState(false);

  const supersetLabels = buildSupersetLabels(exercises);

  const hrStats = computeLiveStats(hr.samples);
  const liveBpm = hr.bpm ?? hrStats.current;
  const liveZone = liveBpm != null ? zoneForBpm(liveBpm, maxHr) : null;

  // ── Load max HR from settings (fallback: 220 - age, else 190) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await customFetch<{ maxHeartRate: number | null; age: number | null }>(
          "/api/settings",
        );
        if (cancelled) return;
        const resolved =
          (settings.maxHeartRate && settings.maxHeartRate > 0 ? settings.maxHeartRate : null) ??
          (settings.age ? estimateMaxHr(settings.age) : null) ??
          190;
        setMaxHr(resolved);
      } catch {
        // keep default
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Capture HR samples for the active session ──
  useEffect(() => {
    if (sessionId == null) return;
    void hr.beginCapture(sessionId);
    return () => {
      hr.stopCapture();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── Session elapsed timer ──
  useEffect(() => {
    if (!activeSession?.startedAt) return;
    const start = new Date(activeSession.startedAt).getTime();
    setElapsed(Math.floor((Date.now() - start) / 1000));
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [activeSession?.startedAt]);

  // ── Rest timer countdown ──
  useEffect(() => {
    if (restRemaining === null || restRemaining <= 0) {
      if (restRemaining === 0) {
        setRestRemaining(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      return;
    }
    const id = setTimeout(() => setRestRemaining((r) => (r !== null ? r - 1 : null)), 1000);
    return () => clearTimeout(id);
  }, [restRemaining]);

  // ── Load template exercises ──
  useEffect(() => {
    if (templateId) {
      loadTemplateExercises(templateId);
    }
    // For freestyle, restore from existing session sets
    if (!templateId && sessionId) {
      loadSessionSets(sessionId);
    }
  }, [templateId, sessionId]);

  async function loadTemplateExercises(tid: number) {
    setLoadingExercises(true);
    try {
      const data = await customFetch<ExerciseItem[]>(`/api/workout/templates/${tid}/exercises`);
      setExercises(data);
    } catch {
      // fallback to empty state
    } finally {
      setLoadingExercises(false);
    }
  }

  async function loadSessionSets(sid: number) {
    try {
      const session = await customFetch<{ sets: LoggedSet[]; templateId: number | null }>(
        `/api/workout/sessions/${sid}`,
      );
      if (session.sets.length > 0) {
        const byExercise = new Map<number, LoggedSet[]>();
        for (const s of session.sets) {
          const list = byExercise.get((s as LoggedSet & { exerciseId: number }).exerciseId) ?? [];
          list.push(s);
          byExercise.set((s as LoggedSet & { exerciseId: number }).exerciseId, list);
        }
        setLoggedSets(byExercise);
      }
    } catch {
      // ok
    }
  }

  // ── Pre-fill draft when exercise changes ──
  useEffect(() => {
    const exercise = exercises[currentIdx];
    if (!exercise) return;
    const prevSets = loggedSets.get(exercise.exerciseId) ?? [];
    const lastSet = prevSets[prevSets.length - 1];
    setDraft(lastSet ? setToDraft(lastSet) : exerciseDefaultDraft(exercise));
  }, [currentIdx, exercises]);

  const currentExercise = exercises[currentIdx] ?? null;
  const currentSets = currentExercise ? (loggedSets.get(currentExercise.exerciseId) ?? []) : [];
  const nextSetNumber = currentSets.length + 1;
  const prescribedSets = currentExercise?.prescribedSets ?? 4;

  // ── Log a set ──
  async function logSet() {
    if (!sessionId || !currentExercise || submitting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSubmitting(true);
    try {
      const body = buildSetBody(draft, currentExercise.trackingType, nextSetNumber, currentExercise.exerciseId);
      const result = await customFetch<LoggedSet>(`/api/workout/sessions/${sessionId}/sets`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setLoggedSets((prev) => {
        const updated = new Map(prev);
        const list = [...(updated.get(currentExercise.exerciseId) ?? []), result];
        updated.set(currentExercise.exerciseId, list);
        return updated;
      });
      setDraft(setToDraft(result));
      setRestRemaining(currentExercise.restSec);
    } catch {
      Alert.alert("Could not log set", "Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Finish workout ──
  async function finishWorkout() {
    if (!sessionId || finishing) return;

    const totalSets = Array.from(loggedSets.values()).reduce((a, b) => a + b.length, 0);
    if (totalSets === 0) {
      Alert.alert(
        "No sets logged",
        "Log at least one set before finishing.",
      );
      return;
    }

    Alert.alert(
      "Finish workout?",
      "This will complete your session and show your summary.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Finish",
          onPress: async () => {
            setFinishing(true);
            try {
              // Upload captured HR samples first (best-effort) so the session
              // carries its avg/max/zone/calories summary.
              let hrSummary: {
                avgHr: number | null;
                maxHr: number | null;
                caloriesKcal: number | null;
                timeInZone: Record<string, number>;
              } | null = null;
              const captured = hr.samples;
              if (captured.length > 0) {
                try {
                  hrSummary = await customFetch<{
                    avgHr: number | null;
                    maxHr: number | null;
                    caloriesKcal: number | null;
                    timeInZone: Record<string, number>;
                  }>(`/api/workout/sessions/${sessionId}/hr`, {
                    method: "POST",
                    body: JSON.stringify({
                      samples: captured.map((s: HrSample) => ({
                        bpm: s.bpm,
                        sampledAt: s.sampledAt,
                      })),
                      maxHeartRate: maxHr,
                    }),
                  });
                } catch {
                  // HR upload is non-fatal; continue completing the session.
                }
              }

              const result = await customFetch<CompleteResult>(
                `/api/workout/sessions/${sessionId}/complete`,
                { method: "POST" },
              );
              endSession();
              await hr.clearCapture(sessionId);
              const tonnageKg = Array.from(loggedSets.values())
                .flat()
                .reduce((t, s) => t + (s.weightKg ?? 0) * (s.reps ?? 1), 0);
              const prNames = result.prs
                .map((p) => p.exerciseName ?? "")
                .filter(Boolean)
                .join(",");
              router.replace({
                pathname: "/copilot-summary" as never,
                params: {
                  sessionId: String(sessionId),
                  name: activeSession?.name ?? "Workout",
                  durationSec: String(elapsed),
                  totalSets: String(totalSets),
                  tonnageKg: String(Math.round(tonnageKg)),
                  prNames,
                  avgHr: hrSummary?.avgHr != null ? String(hrSummary.avgHr) : "",
                  maxHr: hrSummary?.maxHr != null ? String(hrSummary.maxHr) : "",
                  caloriesKcal:
                    hrSummary?.caloriesKcal != null ? String(hrSummary.caloriesKcal) : "",
                  timeInZone: hrSummary?.timeInZone
                    ? JSON.stringify(hrSummary.timeInZone)
                    : "",
                },
              });
            } catch {
              setFinishing(false);
              Alert.alert("Could not complete session", "Please try again.");
            }
          },
        },
      ],
    );
  }

  // ── Exercise picker (freestyle) ──
  async function openExercisePicker() {
    setShowExercisePicker(true);
    if (libraryExercises.length > 0) return;
    setLoadingLibrary(true);
    try {
      const data = await customFetch<LibraryExercise[]>("/api/exercises");
      setLibraryExercises(data);
    } catch {
      // ok
    } finally {
      setLoadingLibrary(false);
    }
  }

  function addExerciseFromLibrary(ex: LibraryExercise) {
    const item: ExerciseItem = {
      id: Date.now(),
      exerciseId: ex.id,
      name: ex.name,
      category: ex.category,
      trackingType: ex.trackingType as TrackingType,
      orderIndex: exercises.length,
      prescribedSets: 3,
      prescribedReps: 10,
      prescribedWeightKg: null,
      prescribedDurationSec: null,
      prescribedDistanceM: null,
      restSec: 90,
      supersetGroupId: null,
      notes: null,
    };
    setExercises((prev) => [...prev, item]);
    setShowExercisePicker(false);
    setCurrentIdx(exercises.length);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }

  const filteredLibrary = libraryExercises.filter((e) =>
    e.name.toLowerCase().includes(librarySearch.toLowerCase()),
  );

  // ── Render helpers ──

  function renderLoggedSet(set: LoggedSet, idx: number) {
    if (!currentExercise) return null;
    return (
      <View key={set.id} style={[styles.setRow, { borderBottomColor: colors.border }]}>
        <Text style={[styles.setNum, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          {idx + 1}
        </Text>
        <Text style={[styles.setVal, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          {formatSetDisplay(set, currentExercise.trackingType)}
        </Text>
        <View style={styles.setMeta}>
          {set.isWarmup && (
            <View style={[styles.warmBadge, { backgroundColor: "#E0D8CC" }]}>
              <Text style={{ fontSize: 10, color: "#8A7D70", fontFamily: "Inter_600SemiBold" }}>W</Text>
            </View>
          )}
          {set.isPersonalBest && (
            <View style={[styles.prBadge, { backgroundColor: "#F5DDD8" }]}>
              <Text style={{ fontSize: 10, color: "#A06050", fontFamily: "Inter_700Bold" }}>PR</Text>
            </View>
          )}
          <Feather name="check" size={16} color={colors.primary} />
        </View>
      </View>
    );
  }

  function renderTrackingInputs() {
    if (!currentExercise) return null;
    const { trackingType } = currentExercise;

    switch (trackingType) {
      case "weight_reps":
      case "weighted_bodyweight":
        return (
          <View style={styles.inputRow}>
            <Stepper
              label={trackingType === "weighted_bodyweight" ? "Added weight" : "Weight"}
              value={draft.weightKg}
              step={2.5}
              min={0}
              format={(v) => `${fmtKg(v)} kg`}
              onChange={(v) => setDraft((d) => ({ ...d, weightKg: v }))}
              colors={colors}
            />
            <Stepper
              label="Reps"
              value={draft.reps}
              step={1}
              min={1}
              onChange={(v) => setDraft((d) => ({ ...d, reps: v }))}
              colors={colors}
            />
          </View>
        );

      case "bodyweight_reps":
      case "reps_only":
        return (
          <View style={styles.inputRowCenter}>
            <Stepper
              label="Reps"
              value={draft.reps}
              step={1}
              min={1}
              max={999}
              onChange={(v) => setDraft((d) => ({ ...d, reps: v }))}
              colors={colors}
            />
          </View>
        );

      case "duration":
        return (
          <View style={styles.inputRow}>
            <Stepper
              label="Minutes"
              value={draft.durationMin}
              step={1}
              min={0}
              max={60}
              onChange={(v) => setDraft((d) => ({ ...d, durationMin: v }))}
              colors={colors}
            />
            <Stepper
              label="Seconds"
              value={draft.durationSec}
              step={5}
              min={0}
              max={55}
              onChange={(v) => setDraft((d) => ({ ...d, durationSec: v }))}
              colors={colors}
            />
          </View>
        );

      case "distance_duration":
      case "cardio_machine":
        return (
          <>
            <View style={styles.inputRow}>
              <Stepper
                label="Distance (m)"
                value={draft.distanceM}
                step={25}
                min={0}
                onChange={(v) => setDraft((d) => ({ ...d, distanceM: v }))}
                colors={colors}
              />
            </View>
            <View style={styles.inputRow}>
              <Stepper
                label="Minutes"
                value={draft.durationMin}
                step={1}
                min={0}
                max={999}
                onChange={(v) => setDraft((d) => ({ ...d, durationMin: v }))}
                colors={colors}
              />
              <Stepper
                label="Seconds"
                value={draft.durationSec}
                step={5}
                min={0}
                max={55}
                onChange={(v) => setDraft((d) => ({ ...d, durationSec: v }))}
                colors={colors}
              />
            </View>
          </>
        );

      default:
        return (
          <View style={styles.inputRow}>
            <Stepper
              label="Reps"
              value={draft.reps}
              step={1}
              min={1}
              onChange={(v) => setDraft((d) => ({ ...d, reps: v }))}
              colors={colors}
            />
          </View>
        );
    }
  }

  // ── No session guard ──
  if (!sessionId) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
          No active session.
        </Text>
        <TouchableOpacity onPress={() => router.replace("/copilot-start" as never)} style={{ marginTop: 16 }}>
          <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>
            Start a workout
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const supersetLabel =
    currentExercise?.supersetGroupId != null
      ? supersetLabels.get(currentExercise.supersetGroupId)
      : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="chevron-down" size={24} color={colors.foreground} />
        </TouchableOpacity>

        <View style={{ flex: 1, alignItems: "center" }}>
          <Text
            numberOfLines={1}
            style={[styles.headerName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}
          >
            {activeSession?.name ?? "Workout"}
          </Text>
          <Text style={[styles.headerTimer, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>
            {fmtElapsed(elapsed)}
          </Text>
        </View>

        <TouchableOpacity
          onPress={finishWorkout}
          disabled={finishing}
          style={[styles.finishBtn, { backgroundColor: colors.primary }]}
        >
          {finishing ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Text style={[styles.finishText, { color: colors.primaryForeground, fontFamily: "Inter_700Bold" }]}>
              Finish
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Exercise progress dots ── */}
      {exercises.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.progressRow}
          style={[styles.progressBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
        >
          {exercises.map((ex, i) => (
            <TouchableOpacity key={`${ex.exerciseId}-${i}`} onPress={() => setCurrentIdx(i)}>
              <View
                style={[
                  styles.progressDot,
                  {
                    backgroundColor:
                      i === currentIdx ? colors.primary
                      : i < currentIdx ? colors.accent
                      : colors.border,
                    width: i === currentIdx ? 24 : 10,
                  },
                ]}
              />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ── Main scrollable content ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Heart rate card ── */}
        <View style={[styles.hrCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.hrTopRow}>
            <View style={styles.hrHeadingRow}>
              <Feather name="heart" size={16} color={liveZone?.color ?? colors.primary} />
              <Text style={[styles.hrHeading, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                Heart rate
              </Text>
            </View>
            {hr.connectedDevice ? (
              <TouchableOpacity
                onPress={() => void hr.disconnect()}
                style={[styles.hrConnectBtn, { borderColor: colors.border }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <View style={[styles.hrDot, { backgroundColor: hr.status === "connected" ? "#5B8C5A" : "#C9924E" }]} />
                <Text style={[styles.hrConnectText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                  {hr.status === "reconnecting" ? "Reconnecting" : "Disconnect"}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  if (!hr.supported) {
                    Alert.alert(
                      "Heart rate unavailable",
                      "Bluetooth heart-rate monitors require a development build of Valo on a physical device.",
                    );
                    return;
                  }
                  setShowHrModal(true);
                  void hr.startScan();
                }}
                style={[styles.hrConnectBtn, { backgroundColor: colors.secondary }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="bluetooth" size={13} color={colors.primary} />
                <Text style={[styles.hrConnectText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                  Connect
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {liveBpm != null ? (
            <>
              <View style={styles.hrMainRow}>
                <View style={styles.hrBpmWrap}>
                  <Text style={[styles.hrBpm, { color: liveZone?.color ?? colors.foreground, fontFamily: "Inter_700Bold" }]}>
                    {liveBpm}
                  </Text>
                  <Text style={[styles.hrBpmUnit, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                    bpm
                  </Text>
                </View>
                {liveZone && (
                  <View style={[styles.hrZoneBadge, { backgroundColor: `${liveZone.color}22` }]}>
                    <Text style={[styles.hrZoneText, { color: liveZone.color, fontFamily: "Inter_700Bold" }]}>
                      {liveZone.label}
                    </Text>
                  </View>
                )}
              </View>

              <HrSparkline samples={hr.samples} color={liveZone?.color ?? colors.primary} maxHr={maxHr} />

              <View style={styles.hrStatsRow}>
                <View style={styles.hrStat}>
                  <Text style={[styles.hrStatValue, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                    {hrStats.avg ?? "--"}
                  </Text>
                  <Text style={[styles.hrStatLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    Avg
                  </Text>
                </View>
                <View style={styles.hrStat}>
                  <Text style={[styles.hrStatValue, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                    {hrStats.max ?? "--"}
                  </Text>
                  <Text style={[styles.hrStatLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    Max
                  </Text>
                </View>
                <View style={styles.hrStat}>
                  <Text style={[styles.hrStatValue, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                    {maxHr}
                  </Text>
                  <Text style={[styles.hrStatLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    Max HR
                  </Text>
                </View>
              </View>
            </>
          ) : (
            <Text style={[styles.hrEmpty, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {hr.status === "connecting"
                ? "Connecting to monitor..."
                : hr.status === "reconnecting"
                  ? "Reconnecting to monitor..."
                  : hr.connectedDevice
                    ? "Waiting for first reading..."
                    : "Connect a Bluetooth chest strap or watch to track your heart rate live."}
            </Text>
          )}
        </View>

        {loadingExercises ? (
          <View style={styles.centerWrap}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Loading exercises...
            </Text>
          </View>
        ) : exercises.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
              <Feather name="plus" size={28} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              No exercises yet
            </Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Add exercises from the library to build your workout
            </Text>
            <TouchableOpacity
              onPress={openExercisePicker}
              style={[styles.addExBtn, { backgroundColor: colors.primary }]}
            >
              <Feather name="plus" size={16} color={colors.primaryForeground} />
              <Text style={[styles.addExText, { color: colors.primaryForeground, fontFamily: "Inter_700Bold" }]}>
                Add exercise
              </Text>
            </TouchableOpacity>
          </View>
        ) : currentExercise ? (
          <View style={styles.exerciseCard}>
            {/* Exercise header */}
            <View style={styles.exHeader}>
              <View style={styles.exHeaderLeft}>
                <View style={styles.exBadgeRow}>
                  <View style={[styles.catBadge, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.catText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                      {currentExercise.category.toUpperCase()}
                    </Text>
                  </View>
                  {supersetLabel && (
                    <View style={[styles.supersetBadge, { backgroundColor: "#F5DDD8" }]}>
                      <Text style={{ fontSize: 10, color: "#A06050", fontFamily: "Inter_700Bold" }}>
                        SUPERSET {supersetLabel}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.exName, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                  {currentExercise.name}
                </Text>
                {(currentExercise.prescribedSets || currentExercise.prescribedReps) && (
                  <Text style={[styles.exTarget, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    Target: {currentExercise.prescribedSets ?? "?"} sets
                    {currentExercise.prescribedReps ? ` × ${currentExercise.prescribedReps} reps` : ""}
                    {currentExercise.prescribedWeightKg ? ` · ${fmtKg(currentExercise.prescribedWeightKg)} kg` : ""}
                  </Text>
                )}
              </View>
              <Text style={[styles.exCounter, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                {currentIdx + 1} / {exercises.length}
              </Text>
            </View>

            {/* Logged sets */}
            {currentSets.length > 0 && (
              <View style={[styles.setsTable, { borderColor: colors.border }]}>
                <View style={[styles.setsHeader, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.setsHeaderText, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
                    SET
                  </Text>
                  <Text style={[styles.setsHeaderText, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
                    RESULT
                  </Text>
                  <View style={{ width: 56 }} />
                </View>
                {currentSets.map((s, i) => renderLoggedSet(s, i))}
              </View>
            )}

            {/* Set input area */}
            <View style={[styles.inputSection, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Text style={[styles.setDivider, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
                SET {nextSetNumber}{prescribedSets ? ` OF ${prescribedSets}` : ""}
              </Text>

              {renderTrackingInputs()}

              {/* Warmup toggle + RPE */}
              <View style={styles.metaRow}>
                <TouchableOpacity
                  onPress={() => setDraft((d) => ({ ...d, isWarmup: !d.isWarmup }))}
                  style={styles.warmupToggle}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: draft.isWarmup ? colors.primary : colors.border,
                        backgroundColor: draft.isWarmup ? colors.primary : "transparent",
                      },
                    ]}
                  >
                    {draft.isWarmup && <Feather name="check" size={11} color={colors.primaryForeground} />}
                  </View>
                  <Text style={[styles.warmupLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    Warmup set
                  </Text>
                </TouchableOpacity>

                {draft.rpe > 0 && (
                  <Text style={[styles.rpeLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    RPE {draft.rpe}
                  </Text>
                )}
              </View>

              {/* Log button */}
              <TouchableOpacity
                onPress={logSet}
                disabled={submitting}
                activeOpacity={0.85}
                style={[styles.logBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.7 : 1 }]}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={[styles.logBtnText, { color: colors.primaryForeground, fontFamily: "Inter_700Bold" }]}>
                    Log set {nextSetNumber}
                  </Text>
                )}
              </TouchableOpacity>

              {currentSets.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    const last = currentSets[currentSets.length - 1]!;
                    setDraft(setToDraft(last));
                    Haptics.selectionAsync().catch(() => {});
                  }}
                  style={[styles.repeatBtn, { borderColor: colors.border }]}
                >
                  <Feather name="repeat" size={14} color={colors.mutedForeground} />
                  <Text style={[styles.repeatText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                    Repeat last set
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : null}

        {/* Add more exercises (freestyle) */}
        {exercises.length > 0 && !templateId && (
          <TouchableOpacity
            onPress={openExercisePicker}
            style={[styles.addMoreBtn, { borderColor: colors.border }]}
          >
            <Feather name="plus-circle" size={16} color={colors.primary} />
            <Text style={[styles.addMoreText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
              Add another exercise
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Rest timer ── */}
      {restRemaining !== null && (
        <View style={[styles.restBar, { backgroundColor: "#F5DDD8", borderTopColor: "#E8C8B8" }]}>
          <View style={styles.restLeft}>
            <Feather name="clock" size={16} color="#A06050" />
            <Text style={[styles.restText, { fontFamily: "Inter_700Bold" }]}>
              Rest · {fmtTime(restRemaining)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setRestRemaining(null)}
            hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
          >
            <Text style={[styles.restSkip, { fontFamily: "Inter_600SemiBold" }]}>Skip</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Navigation ── */}
      <View
        style={[
          styles.nav,
          { paddingBottom: insets.bottom + 8, backgroundColor: colors.card, borderTopColor: colors.border },
        ]}
      >
        <TouchableOpacity
          onPress={() => setCurrentIdx((i) => Math.max(0, i - 1))}
          disabled={currentIdx === 0}
          style={[styles.navBtn, { opacity: currentIdx === 0 ? 0.35 : 1, backgroundColor: colors.secondary }]}
        >
          <Feather name="chevron-left" size={20} color={colors.foreground} />
          <Text style={[styles.navBtnText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Prev
          </Text>
        </TouchableOpacity>

        <View style={styles.navCenter}>
          <Text style={[styles.navExName, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]} numberOfLines={1}>
            {currentExercise?.name ?? ""}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => {
            if (currentIdx < exercises.length - 1) {
              setCurrentIdx((i) => i + 1);
              setRestRemaining(null);
            }
          }}
          disabled={currentIdx >= exercises.length - 1}
          style={[styles.navBtn, { opacity: currentIdx >= exercises.length - 1 ? 0.35 : 1, backgroundColor: colors.secondary }]}
        >
          <Text style={[styles.navBtnText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Next
          </Text>
          <Feather name="chevron-right" size={20} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* ── Exercise picker modal ── */}
      <Modal
        visible={showExercisePicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowExercisePicker(false)}
      >
        <View style={[styles.pickerRoot, { backgroundColor: colors.background }]}>
          <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.pickerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              Add exercise
            </Text>
            <TouchableOpacity onPress={() => setShowExercisePicker(false)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <View style={[styles.pickerSearch, { borderBottomColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
            <TextInput
              value={librarySearch}
              onChangeText={setLibrarySearch}
              placeholder="Search exercises..."
              placeholderTextColor={colors.mutedForeground}
              style={[styles.pickerInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
              autoFocus
            />
          </View>
          {loadingLibrary ? (
            <View style={styles.centerWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={filteredLibrary}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => addExerciseFromLibrary(item)}
                  style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pickerItemName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                      {item.name}
                    </Text>
                    <Text style={[styles.pickerItemMeta, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      {item.category}
                    </Text>
                  </View>
                  <Feather name="plus" size={18} color={colors.primary} />
                </TouchableOpacity>
              )}
              contentContainerStyle={{ paddingBottom: 40 }}
            />
          )}
        </View>
      </Modal>

      {/* ── HR pairing modal ── */}
      <Modal
        visible={showHrModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          hr.stopScan();
          setShowHrModal(false);
        }}
      >
        <View style={[styles.pickerRoot, { backgroundColor: colors.background }]}>
          <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.pickerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              Pair heart-rate monitor
            </Text>
            <TouchableOpacity
              onPress={() => {
                hr.stopScan();
                setShowHrModal(false);
              }}
            >
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {!hr.poweredOn && (
            <View style={[styles.hrNotice, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Feather name="bluetooth" size={14} color={colors.mutedForeground} />
              <Text style={[styles.hrNoticeText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Turn on Bluetooth to find nearby monitors.
              </Text>
            </View>
          )}

          <View style={styles.hrScanRow}>
            <Text style={[styles.hrScanLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              {hr.scanning ? "Scanning for devices..." : "Nearby devices"}
            </Text>
            {hr.scanning ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <TouchableOpacity onPress={() => void hr.startScan()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[styles.hrScanAction, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                  Rescan
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={hr.devices}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={async () => {
                  await hr.connect(item.id);
                  setShowHrModal(false);
                }}
                style={[styles.pickerItem, { borderBottomColor: colors.border }]}
              >
                <View style={[styles.hrDeviceIcon, { backgroundColor: colors.secondary }]}>
                  <Feather name="heart" size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pickerItemName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                    {item.name}
                  </Text>
                  {item.rssi != null && (
                    <Text style={[styles.pickerItemMeta, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      Signal {item.rssi} dBm
                    </Text>
                  )}
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              !hr.scanning ? (
                <Text style={[styles.hrEmptyList, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  No monitors found yet. Make sure your strap or watch is awake and broadcasting, then rescan.
                </Text>
              ) : null
            }
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  hrCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  hrTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hrHeadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  hrHeading: { fontSize: 14 },
  hrConnectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  hrConnectText: { fontSize: 12 },
  hrDot: { width: 7, height: 7, borderRadius: 4 },
  hrMainRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hrBpmWrap: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  hrBpm: { fontSize: 44, lineHeight: 48 },
  hrBpmUnit: { fontSize: 14 },
  hrZoneBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  hrZoneText: { fontSize: 12 },
  hrStatsRow: { flexDirection: "row", justifyContent: "space-between" },
  hrStat: { alignItems: "center", flex: 1, gap: 2 },
  hrStatValue: { fontSize: 18 },
  hrStatLabel: { fontSize: 11 },
  hrEmpty: { fontSize: 13, lineHeight: 19 },
  hrNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hrNoticeText: { fontSize: 13, flex: 1 },
  hrScanRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  hrScanLabel: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  hrScanAction: { fontSize: 13 },
  hrDeviceIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", marginRight: 12 },
  hrEmptyList: { fontSize: 13, lineHeight: 20, paddingHorizontal: 20, paddingTop: 24 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerName: { fontSize: 15, maxWidth: 200 },
  headerTimer: { fontSize: 13, marginTop: 1 },
  finishBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    minWidth: 68,
    alignItems: "center",
  },
  finishText: { fontSize: 14 },

  progressBar: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  progressRow: { paddingHorizontal: 16, gap: 6, alignItems: "center" },
  progressDot: { height: 8, borderRadius: 4 },

  scroll: { paddingHorizontal: 16, paddingTop: 20, gap: 16 },

  centerWrap: { alignItems: "center", paddingTop: 60, gap: 12 },
  loadingText: { fontSize: 14 },

  emptyWrap: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 17 },
  emptySub: { fontSize: 14, textAlign: "center", lineHeight: 20, paddingHorizontal: 24 },
  addExBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, marginTop: 8 },
  addExText: { fontSize: 15 },

  exerciseCard: { gap: 16 },

  exHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  exHeaderLeft: { flex: 1, gap: 4 },
  exBadgeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  catBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  catText: { fontSize: 10, letterSpacing: 0.5 },
  supersetBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  exName: { fontSize: 22, marginTop: 2 },
  exTarget: { fontSize: 13, marginTop: 2 },
  exCounter: { fontSize: 13, marginTop: 6 },

  setsTable: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, overflow: "hidden" },
  setsHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  setsHeaderText: { fontSize: 11, letterSpacing: 0.5, flex: 1 },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  setNum: { width: 28, fontSize: 14 },
  setVal: { flex: 1, fontSize: 15 },
  setMeta: { flexDirection: "row", gap: 6, alignItems: "center", width: 56, justifyContent: "flex-end" },
  warmBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },
  prBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },

  inputSection: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 20,
  },
  setDivider: { fontSize: 11, letterSpacing: 0.8, textAlign: "center" },
  inputRow: { flexDirection: "row", gap: 8 },
  inputRowCenter: { flexDirection: "row", justifyContent: "center" },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  warmupToggle: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  warmupLabel: { fontSize: 14 },
  rpeLabel: { fontSize: 13 },
  logBtn: {
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
  },
  logBtnText: { fontSize: 17 },
  repeatBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  repeatText: { fontSize: 14 },

  addMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    marginTop: 8,
  },
  addMoreText: { fontSize: 14 },

  restBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  restLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  restText: { fontSize: 16, color: "#A06050" },
  restSkip: { fontSize: 14, color: "#A06050" },

  nav: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  navBtnText: { fontSize: 14 },
  navCenter: { flex: 1, alignItems: "center" },
  navExName: { fontSize: 12, textAlign: "center" },

  pickerRoot: { flex: 1 },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerTitle: { fontSize: 18 },
  pickerSearch: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerInput: { flex: 1, fontSize: 16, height: 36 },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerItemName: { fontSize: 15 },
  pickerItemMeta: { fontSize: 13, marginTop: 2 },
});
