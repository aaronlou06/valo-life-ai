import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListDailyLogHistory,
  useGetTodayLog,
  useUpsertDailyLog,
  useCreateLogEntry,
  getListDailyLogHistoryQueryKey,
  getGetTodayLogQueryKey,
  type DailyLog,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import * as Haptics from "expo-haptics";

// ─── Types ────────────────────────────────────────────────────────────────────

type Colors = ReturnType<typeof useColors>;

// ─── Constants ────────────────────────────────────────────────────────────────

const GOOD_GREEN = "#4CAF50";
const OK_AMBER = "#F59E0B";
const LOW_RED = "#EF4444";

const WORKOUT_TYPES = [
  "Run",
  "Walk",
  "Strength",
  "Yoga",
  "Cycling",
  "Swim",
  "HIIT",
  "Other",
] as const;
type WorkoutTypeName = (typeof WORKOUT_TYPES)[number];

const METRIC_CONFIGS = [
  {
    key: "sleepHours" as const,
    label: "Sleep",
    unit: "hrs",
    format: (v: number) => v.toFixed(1),
    good: (v: number) => v >= 7,
    ok: (v: number) => v >= 6,
    higherIsBetter: true,
  },
  {
    key: "hrv" as const,
    label: "HRV",
    unit: "ms",
    format: (v: number) => String(Math.round(v)),
    good: (v: number) => v >= 50,
    ok: (v: number) => v >= 35,
    higherIsBetter: true,
  },
  {
    key: "restingHeartRate" as const,
    label: "Resting HR",
    unit: "bpm",
    format: (v: number) => String(Math.round(v)),
    good: (v: number) => v <= 65,
    ok: (v: number) => v <= 75,
    higherIsBetter: false,
  },
  {
    key: "steps" as const,
    label: "Steps",
    unit: "steps",
    format: (v: number) =>
      v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)),
    good: (v: number) => v >= 8000,
    ok: (v: number) => v >= 5000,
    higherIsBetter: true,
  },
] as const;

type MetricConfig = (typeof METRIC_CONFIGS)[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function metricStatusColor(value: number, config: MetricConfig): string {
  if (config.good(value)) return GOOD_GREEN;
  if (config.ok(value)) return OK_AMBER;
  return LOW_RED;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatWorkoutDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function effortLabel(effort: number): string {
  if (effort <= 3) return "Easy";
  if (effort <= 5) return "Moderate";
  if (effort <= 7) return "Hard";
  return "Max";
}

// ─── SparkChart ───────────────────────────────────────────────────────────────

interface SparkChartProps {
  values: (number | null)[];
  config: MetricConfig;
  colors: Colors;
}

function SparkChart({ values, config, colors }: SparkChartProps) {
  const CHART_H = 36;
  const BAR_W = 8;
  const BAR_GAP = 3;

  const nums = values.filter((v): v is number => v != null);
  const max = nums.length > 0 ? Math.max(...nums) : 1;
  const min = nums.length > 0 ? Math.min(...nums) : 0;
  const range = max === min ? 1 : max - min;

  return (
    <View
      style={{ flexDirection: "row", alignItems: "flex-end", height: CHART_H, gap: BAR_GAP }}
    >
      {values.map((val, i) => {
        const isLast = i === values.length - 1;
        const height =
          val != null
            ? Math.max(3, Math.round(((val - min) / range) * CHART_H))
            : 3;
        const barColor =
          val != null ? metricStatusColor(val, config) : colors.border;
        return (
          <View
            key={i}
            style={{
              width: BAR_W,
              height,
              backgroundColor: barColor,
              borderRadius: 2,
              opacity: isLast ? 1 : 0.55,
            }}
          />
        );
      })}
    </View>
  );
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

interface MetricCardProps {
  config: MetricConfig;
  history: DailyLog[];
  colors: Colors;
}

function MetricCard({ config, history, colors }: MetricCardProps) {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const last14 = sorted.slice(-14);

  const rawValues: (number | null)[] = last14.map((log) => {
    const v = log[config.key];
    return v != null ? Number(v) : null;
  });
  while (rawValues.length < 14) rawValues.unshift(null);

  const mostRecent = [...sorted]
    .reverse()
    .find((l) => l[config.key] != null);
  const todayNum =
    mostRecent?.[config.key] != null ? Number(mostRecent[config.key]) : null;

  const last7nums = sorted
    .slice(-7)
    .map((l) => l[config.key])
    .filter((v): v is number => v != null);
  const avg7 =
    last7nums.length > 0
      ? last7nums.reduce((a, b) => a + b, 0) / last7nums.length
      : null;

  const valueColor =
    todayNum != null
      ? metricStatusColor(todayNum, config)
      : colors.mutedForeground;

  const trend: "up" | "down" | "flat" =
    last7nums.length >= 2
      ? last7nums[last7nums.length - 1]! > last7nums[0]!
        ? "up"
        : last7nums[last7nums.length - 1]! < last7nums[0]!
        ? "down"
        : "flat"
      : "flat";

  const trendGood =
    trend === "flat"
      ? null
      : trend === "up"
      ? config.higherIsBetter
      : !config.higherIsBetter;

  const trendIcon =
    trend === "up"
      ? "arrow-up-right"
      : trend === "down"
      ? "arrow-down-right"
      : null;
  const trendColor =
    trendGood === true
      ? GOOD_GREEN
      : trendGood === false
      ? LOW_RED
      : colors.mutedForeground;

  return (
    <View
      style={[
        styles.metricCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.metricCardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>
            {config.label}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "baseline",
              gap: 3,
              marginTop: 2,
            }}
          >
            {todayNum != null ? (
              <>
                <Text style={[styles.metricValue, { color: valueColor }]}>
                  {config.format(todayNum)}
                </Text>
                <Text
                  style={[styles.metricUnit, { color: colors.mutedForeground }]}
                >
                  {config.unit}
                </Text>
              </>
            ) : (
              <Text
                style={[
                  styles.metricValueEmpty,
                  { color: colors.mutedForeground },
                ]}
              >
                Not logged
              </Text>
            )}
          </View>
        </View>
        {trendIcon != null && (
          <Feather name={trendIcon} size={16} color={trendColor} />
        )}
      </View>

      <View style={{ marginVertical: 10 }}>
        <SparkChart values={rawValues} config={config} colors={colors} />
        <Text style={[styles.chartCaption, { color: colors.mutedForeground }]}>
          Last 14 days
        </Text>
      </View>

      {avg7 != null && (
        <Text style={[styles.metricAvg, { color: colors.mutedForeground }]}>
          7-day avg:{" "}
          <Text style={{ color: colors.foreground }}>
            {config.format(avg7)} {config.unit}
          </Text>
        </Text>
      )}
    </View>
  );
}

// ─── WorkoutRow ───────────────────────────────────────────────────────────────

interface WorkoutRowProps {
  date: string;
  type: string;
  duration: number | null;
  effort: number | null;
  colors: Colors;
  isToday?: boolean;
}

function WorkoutRow({
  date,
  type,
  duration,
  effort,
  colors,
  isToday,
}: WorkoutRowProps) {
  return (
    <View
      style={[styles.workoutRow, { borderBottomColor: colors.border }]}
    >
      <View
        style={[styles.workoutIconBox, { backgroundColor: colors.muted }]}
      >
        <Feather name="zap" size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <Text
            style={[styles.workoutType, { color: colors.foreground }]}
          >
            {type}
          </Text>
          {isToday && (
            <View
              style={[
                styles.todayPill,
                { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.todayPillText,
                  { color: colors.primaryForeground },
                ]}
              >
                Today
              </Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 2 }}>
          {duration != null && (
            <Text
              style={[
                styles.workoutMeta,
                { color: colors.mutedForeground },
              ]}
            >
              {formatWorkoutDuration(duration)}
            </Text>
          )}
          {effort != null && (
            <Text
              style={[
                styles.workoutMeta,
                { color: colors.mutedForeground },
              ]}
            >
              Effort {effort}/10 — {effortLabel(effort)}
            </Text>
          )}
        </View>
      </View>
      {!isToday && (
        <Text
          style={[styles.workoutDate, { color: colors.mutedForeground }]}
        >
          {formatDateLabel(date)}
        </Text>
      )}
    </View>
  );
}

// ─── AddWorkoutModal ──────────────────────────────────────────────────────────

interface AddWorkoutModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (type: string, duration: number, effort: number) => void;
  saving: boolean;
  colors: Colors;
}

function AddWorkoutModal({
  visible,
  onClose,
  onSave,
  saving,
  colors,
}: AddWorkoutModalProps) {
  const [selectedType, setSelectedType] = useState<WorkoutTypeName>("Run");
  const [duration, setDuration] = useState(30);
  const [effort, setEffort] = useState(6);

  function handleSave() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSave(selectedType, duration, effort);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={[
            styles.modalHeader,
            { borderBottomColor: colors.border },
          ]}
        >
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text
              style={[
                styles.modalCancel,
                { color: colors.mutedForeground },
              ]}
            >
              Cancel
            </Text>
          </TouchableOpacity>
          <Text
            style={[styles.modalTitle, { color: colors.foreground }]}
          >
            Log Workout
          </Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text
                style={[styles.modalSave, { color: colors.primary }]}
              >
                Save
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.modalBody}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Workout type */}
          <Text
            style={[
              styles.fieldLabel,
              { color: colors.mutedForeground },
            ]}
          >
            TYPE
          </Text>
          <View style={styles.typeGrid}>
            {WORKOUT_TYPES.map((wt) => (
              <TouchableOpacity
                key={wt}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedType(wt);
                }}
                style={[
                  styles.typeChip,
                  {
                    backgroundColor:
                      selectedType === wt ? colors.primary : colors.muted,
                    borderColor:
                      selectedType === wt ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    {
                      color:
                        selectedType === wt
                          ? colors.primaryForeground
                          : colors.foreground,
                    },
                  ]}
                >
                  {wt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Duration */}
          <Text
            style={[
              styles.fieldLabel,
              { color: colors.mutedForeground, marginTop: 24 },
            ]}
          >
            DURATION
          </Text>
          <View
            style={[
              styles.stepperRow,
              {
                backgroundColor: colors.muted,
                borderColor: colors.border,
              },
            ]}
          >
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                setDuration((d) => Math.max(5, d - 5));
              }}
              style={styles.stepperBtn}
            >
              <Feather name="minus" size={20} color={colors.foreground} />
            </TouchableOpacity>
            <Text
              style={[styles.stepperValue, { color: colors.foreground }]}
            >
              {formatWorkoutDuration(duration)}
            </Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                setDuration((d) => Math.min(300, d + 5));
              }}
              style={styles.stepperBtn}
            >
              <Feather name="plus" size={20} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Effort */}
          <Text
            style={[
              styles.fieldLabel,
              { color: colors.mutedForeground, marginTop: 24 },
            ]}
          >
            EFFORT — {effort}/10{" "}
            <Text style={{ color: colors.foreground }}>
              {effortLabel(effort)}
            </Text>
          </Text>
          <View style={styles.effortDots}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => {
                  Haptics.selectionAsync();
                  setEffort(n);
                }}
                style={[
                  styles.effortDot,
                  {
                    backgroundColor:
                      n <= effort ? colors.primary : colors.muted,
                    borderColor:
                      n <= effort ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.effortDotText,
                    {
                      color:
                        n <= effort
                          ? colors.primaryForeground
                          : colors.mutedForeground,
                    },
                  ]}
                >
                  {n}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── PlaceholderCard ──────────────────────────────────────────────────────────

interface PlaceholderCardProps {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  message: string;
  colors: Colors;
}

function PlaceholderCard({
  icon,
  title,
  message,
  colors,
}: PlaceholderCardProps) {
  return (
    <View
      style={[
        styles.placeholderCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View
        style={[
          styles.placeholderIconBox,
          { backgroundColor: colors.muted },
        ]}
      >
        <Feather name={icon} size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[styles.placeholderTitle, { color: colors.foreground }]}
        >
          {title}
        </Text>
        <Text
          style={[
            styles.placeholderMessage,
            { color: colors.mutedForeground },
          ]}
        >
          {message}
        </Text>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HealthScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [showAddWorkout, setShowAddWorkout] = useState(false);
  const [savingWorkout, setSavingWorkout] = useState(false);
  const [showAllWorkouts, setShowAllWorkouts] = useState(false);

  const { data: logHistory = [], isLoading: loadingHistory } =
    useListDailyLogHistory();
  const upsertLog = useUpsertDailyLog();
  const createEntry = useCreateLogEntry();

  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries({ queryKey: getListDailyLogHistoryQueryKey() });
      qc.invalidateQueries({ queryKey: getGetTodayLogQueryKey() });
    }, [qc])
  );

  async function handleSaveWorkout(
    type: string,
    duration: number,
    effort: number
  ) {
    setSavingWorkout(true);
    try {
      await Promise.all([
        upsertLog.mutateAsync({
          data: {
            workoutType: type,
            workoutDuration: duration,
            workoutEffort: effort,
          },
        }),
        createEntry.mutateAsync({
          data: {
            type: "workout",
            title: type,
            subtitle: formatWorkoutDuration(duration),
            value: String(effort),
          },
        }),
      ]);
      await qc.invalidateQueries({
        queryKey: getListDailyLogHistoryQueryKey(),
      });
      await qc.invalidateQueries({ queryKey: getGetTodayLogQueryKey() });
      setShowAddWorkout(false);
    } catch {
      Alert.alert("Error", "Could not save workout. Please try again.");
    } finally {
      setSavingWorkout(false);
    }
  }

  const todayISO = new Date().toISOString().split("T")[0]!;

  const workoutDays = logHistory
    .filter((l) => l.workoutType != null)
    .sort((a, b) => b.date.localeCompare(a.date));

  const visibleWorkouts = showAllWorkouts
    ? workoutDays
    : workoutDays.slice(0, 5);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        {/* Header */}
        <View
          style={[styles.header, { borderBottomColor: colors.border }]}
        >
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Health
          </Text>
          <Text
            style={[styles.headerSub, { color: colors.mutedForeground }]}
          >
            Body metrics and activity
          </Text>
        </View>

        {/* ── Health Metrics ── */}
        <View style={styles.sectionBlock}>
          <Text
            style={[styles.sectionTitle, { color: colors.foreground }]}
          >
            Health Metrics
          </Text>
          <Text
            style={[styles.sectionSub, { color: colors.mutedForeground }]}
          >
            Trends from your logged data
          </Text>

          {loadingHistory ? (
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={{ marginTop: 24, alignSelf: "center" }}
            />
          ) : logHistory.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                {
                  backgroundColor: colors.muted,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.emptyText,
                  { color: colors.mutedForeground },
                ]}
              >
                No data yet. Log health metrics from the Check-In tab to
                see trends here.
              </Text>
            </View>
          ) : (
            <View style={styles.metricsGrid}>
              {METRIC_CONFIGS.map((cfg) => (
                <MetricCard
                  key={cfg.key}
                  config={cfg}
                  history={logHistory}
                  colors={colors}
                />
              ))}
            </View>
          )}
        </View>

        <View
          style={[styles.divider, { backgroundColor: colors.border }]}
        />

        {/* ── Workout Log ── */}
        <View style={styles.sectionBlock}>
          <View style={styles.sectionRow}>
            <View>
              <Text
                style={[
                  styles.sectionTitle,
                  { color: colors.foreground },
                ]}
              >
                Workout Log
              </Text>
              <Text
                style={[
                  styles.sectionSub,
                  { color: colors.mutedForeground },
                ]}
              >
                Recent activity
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowAddWorkout(true);
              }}
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
            >
              <Feather
                name="plus"
                size={16}
                color={colors.primaryForeground}
              />
              <Text
                style={[
                  styles.addBtnText,
                  { color: colors.primaryForeground },
                ]}
              >
                Log
              </Text>
            </TouchableOpacity>
          </View>

          {workoutDays.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                {
                  backgroundColor: colors.muted,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.emptyText,
                  { color: colors.mutedForeground },
                ]}
              >
                No workouts logged yet. Tap Log to record one.
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.workoutList,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              {visibleWorkouts.map((log) => (
                <WorkoutRow
                  key={log.id}
                  date={log.date}
                  type={log.workoutType!}
                  duration={log.workoutDuration ?? null}
                  effort={log.workoutEffort ?? null}
                  colors={colors}
                  isToday={log.date === todayISO}
                />
              ))}
              {workoutDays.length > 5 && (
                <TouchableOpacity
                  onPress={() => setShowAllWorkouts((v) => !v)}
                  style={[
                    styles.showMoreBtn,
                    { borderTopColor: colors.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.showMoreText,
                      { color: colors.primary },
                    ]}
                  >
                    {showAllWorkouts
                      ? "Show less"
                      : `Show ${workoutDays.length - 5} more`}
                  </Text>
                  <Feather
                    name={showAllWorkouts ? "chevron-up" : "chevron-down"}
                    size={14}
                    color={colors.primary}
                  />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <View
          style={[styles.divider, { backgroundColor: colors.border }]}
        />

        {/* ── Nutrition ── */}
        <View style={styles.sectionBlock}>
          <Text
            style={[styles.sectionTitle, { color: colors.foreground }]}
          >
            Nutrition
          </Text>
          <Text
            style={[styles.sectionSub, { color: colors.mutedForeground }]}
          >
            Meals and nutrients
          </Text>
          <PlaceholderCard
            icon="book-open"
            title="Meal Planning"
            message="Personalised meal plans and nutrition tracking coming soon."
            colors={colors}
          />
        </View>

        <View
          style={[styles.divider, { backgroundColor: colors.border }]}
        />

        {/* ── Grocery ── */}
        <View style={styles.sectionBlock}>
          <Text
            style={[styles.sectionTitle, { color: colors.foreground }]}
          >
            Grocery
          </Text>
          <Text
            style={[styles.sectionSub, { color: colors.mutedForeground }]}
          >
            Smart lists and ordering
          </Text>
          <PlaceholderCard
            icon="shopping-cart"
            title="Grocery Ordering"
            message="Automated grocery lists based on your meal plan coming soon."
            colors={colors}
          />
        </View>
      </ScrollView>

      <AddWorkoutModal
        visible={showAddWorkout}
        onClose={() => setShowAddWorkout(false)}
        onSave={handleSaveWorkout}
        saving={savingWorkout}
        colors={colors}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 14,
    marginTop: 2,
  },

  // Section layout
  sectionBlock: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  sectionSub: {
    fontSize: 13,
    marginTop: 2,
    marginBottom: 14,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 20,
    marginTop: 16,
  },

  // Metrics
  metricsGrid: {
    gap: 10,
  },
  metricCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  metricCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  metricValue: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  metricValueEmpty: {
    fontSize: 14,
    fontStyle: "italic",
    marginTop: 4,
  },
  metricUnit: {
    fontSize: 13,
    fontWeight: "500",
  },
  metricAvg: {
    fontSize: 12,
    marginTop: 2,
  },
  chartCaption: {
    fontSize: 10,
    marginTop: 4,
    letterSpacing: 0.3,
  },

  // Workout log
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  workoutList: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  workoutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  workoutIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  workoutType: {
    fontSize: 15,
    fontWeight: "600",
  },
  workoutMeta: {
    fontSize: 13,
  },
  workoutDate: {
    fontSize: 12,
    minWidth: 52,
    textAlign: "right",
  },
  todayPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  todayPillText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  showMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  showMoreText: {
    fontSize: 13,
    fontWeight: "500",
  },

  // Placeholder cards
  placeholderCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 16,
  },
  placeholderIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  placeholderMessage: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },

  // Empty states
  emptyCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    alignItems: "center",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },

  // Modal
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  modalCancel: {
    fontSize: 16,
  },
  modalSave: {
    fontSize: 16,
    fontWeight: "600",
  },
  modalBody: {
    padding: 20,
    paddingBottom: 48,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
  },

  // Workout type chips
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  typeChipText: {
    fontSize: 14,
    fontWeight: "500",
  },

  // Duration stepper
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  stepperBtn: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  stepperValue: {
    fontSize: 18,
    fontWeight: "600",
    minWidth: 80,
    textAlign: "center",
  },

  // Effort dots
  effortDots: {
    flexDirection: "row",
    gap: 7,
    flexWrap: "wrap",
  },
  effortDot: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  effortDotText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
