import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  TextInput,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import {
  useListGoals,
  useListHabits,
  useCreateGoal,
  useCreateCalendarEvent,
  useCreateHabit,
  useUpdateHabit,
  useDeleteGoal,
  useDeleteHabit,
  getListGoalsQueryKey,
  getListHabitsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

// ─── Types ───────────────────────────────────────────────────────────────────

type GoalType =
  | "milestone"
  | "readiness"
  | "measurement"
  | "performance"
  | "consistency"
  | "quota"
  | "leveling"
  | "avoidance";

interface GoalForm {
  title: string;
  goalType: GoalType | "";
  // milestone
  subtasks: string[];
  subtaskDates: string[];
  // readiness
  eventDate: string;
  readinessSessions: number;
  // measurement / performance / quota
  currentValue: string;
  targetValue: string;
  unit: string;
  direction: "up" | "down";
  // consistency
  targetFrequency: number;
  // leveling
  tiers: string[];
  // avoidance
  avoidanceLimit: number;
  // step 4
  targetDate: string;
  category: string;
  notes: string;
}

const DEFAULT_FORM: GoalForm = {
  title: "",
  goalType: "",
  subtasks: [""],
  subtaskDates: [""],
  eventDate: "",
  readinessSessions: 3,
  currentValue: "",
  targetValue: "",
  unit: "",
  direction: "up",
  targetFrequency: 5,
  tiers: ["Beginner", "Intermediate", "Advanced"],
  avoidanceLimit: 0,
  targetDate: "",
  category: "personal",
  notes: "",
};

const GOAL_TYPES: { type: GoalType; icon: string; label: string; description: string }[] = [
  { type: "milestone", icon: "list", label: "Multi-Step Goal", description: "A big goal broken into smaller steps" },
  { type: "readiness", icon: "calendar", label: "Event Prep", description: "Training or preparing for a specific date" },
  { type: "measurement", icon: "trending-up", label: "Track a Number", description: "Move a metric toward a target" },
  { type: "performance", icon: "award", label: "Beat My Best", description: "Crush a personal record" },
  { type: "consistency", icon: "repeat", label: "Show Up", description: "Build a streak or hit a frequency" },
  { type: "quota", icon: "package", label: "Hit a Total", description: "Accumulate an amount over time" },
  { type: "leveling", icon: "bar-chart-2", label: "Level Up", description: "Progress through skill stages" },
  { type: "avoidance", icon: "slash", label: "Cut It Out", description: "Reduce or eliminate something" },
];

const CATEGORIES = [
  "health", "fitness", "career", "financial", "relationships",
  "spirituality", "learning", "lifestyle", "personal",
];

const TOTAL_STEPS = 5;

// ─── GoalCreationModal ────────────────────────────────────────────────────────

function GoalCreationModal({
  visible,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const createGoal = useCreateGoal();
  const createCalendarEvent = useCreateCalendarEvent();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<GoalForm>(DEFAULT_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const patch = useCallback((updates: Partial<GoalForm>) => {
    setForm((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetAndClose = useCallback(() => {
    setStep(1);
    setForm(DEFAULT_FORM);
    onClose();
  }, [onClose]);

  const canAdvance = useCallback(() => {
    if (step === 1) return form.title.trim().length > 0;
    if (step === 2) return form.goalType !== "";
    return true;
  }, [step, form.title, form.goalType]);

  const handleCreate = useCallback(async () => {
    setIsSaving(true);
    try {
      const goalTitle = form.title.trim();

      const activeSubtasks = form.subtasks
        .map((s, i) => ({ name: s.trim(), date: (form.subtaskDates[i] ?? "").trim() }))
        .filter((s) => s.name.length > 0);

      const milestonePayload =
        form.goalType === "milestone"
          ? JSON.stringify(
              activeSubtasks.map((s, i) => ({
                id: i + 1,
                title: `${goalTitle} - ${s.name}`,
                completed: false,
              }))
            )
          : null;

      const tiersPayload =
        form.goalType === "leveling"
          ? JSON.stringify(form.tiers.filter((t) => t.trim()))
          : null;

      const currentVal =
        ["measurement", "performance", "quota"].includes(form.goalType)
          ? parseInt(form.currentValue, 10) || null
          : null;

      const targetVal =
        ["measurement", "performance", "quota", "consistency"].includes(form.goalType)
          ? form.goalType === "consistency"
            ? form.targetFrequency
            : parseInt(form.targetValue, 10) || null
          : null;

      await createGoal.mutateAsync({
        data: {
          title: goalTitle,
          goalType: form.goalType || "milestone",
          category: form.category,
          targetDate: form.targetDate.trim() || null,
          notes: form.notes.trim() || null,
          unit: form.unit.trim() || null,
          direction: form.direction,
          currentValue: currentVal,
          targetValue: targetVal,
          tiers: tiersPayload,
          milestones: milestonePayload,
          avoidanceLimit: form.goalType === "avoidance" ? form.avoidanceLimit : null,
          progressPercent: 0,
        },
      });

      // Fire calendar events for main deadline
      const calendarJobs: Promise<unknown>[] = [];
      if (form.targetDate.trim()) {
        calendarJobs.push(
          createCalendarEvent.mutateAsync({
            data: {
              title: goalTitle,
              date: form.targetDate.trim(),
              type: "goal-deadline",
              notes: `Goal deadline: ${goalTitle}`,
            },
          })
        );
      }

      // Fire calendar events for each milestone sub-task deadline
      if (form.goalType === "milestone") {
        for (const s of activeSubtasks) {
          if (s.date) {
            const combinedTitle = `${goalTitle} - ${s.name}`;
            calendarJobs.push(
              createCalendarEvent.mutateAsync({
                data: {
                  title: combinedTitle,
                  date: s.date,
                  type: "goal-deadline",
                  notes: `Goal deadline: ${combinedTitle}`,
                },
              })
            );
          }
        }
      }

      await Promise.all(calendarJobs);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess();
      resetAndClose();
    } catch {
      Alert.alert("Could not save goal. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [form, createGoal, createCalendarEvent, onSuccess, resetAndClose]);

  // ── Step renderers ──────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <View style={styles.stepBody}>
      <Text style={[styles.stepHeading, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        What do you want to achieve?
      </Text>
      <Text style={[styles.stepSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        Be specific. Vague goals stay dreams.
      </Text>
      <TextInput
        style={[
          styles.bigInput,
          { color: colors.foreground, borderColor: form.title ? colors.primary : colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" },
        ]}
        value={form.title}
        onChangeText={(t) => patch({ title: t })}
        placeholder="e.g. Run a sub-4 hour marathon"
        placeholderTextColor={colors.mutedForeground}
        multiline
        autoFocus
      />
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepBody}>
      <Text style={[styles.stepHeading, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        How do you want to track progress?
      </Text>
      <View style={styles.typeGrid}>
        {GOAL_TYPES.map(({ type, icon, label, description }) => {
          const selected = form.goalType === type;
          return (
            <TouchableOpacity
              key={type}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                patch({ goalType: type });
              }}
              style={[
                styles.typeCard,
                {
                  backgroundColor: selected ? colors.primary : colors.card,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
              activeOpacity={0.75}
            >
              <Feather
                name={icon as any}
                size={20}
                color={selected ? colors.primaryForeground : colors.primary}
              />
              <Text
                style={[
                  styles.typeLabel,
                  {
                    color: selected ? colors.primaryForeground : colors.foreground,
                    fontFamily: "Inter_600SemiBold",
                  },
                ]}
              >
                {label}
              </Text>
              <Text
                style={[
                  styles.typeDesc,
                  {
                    color: selected ? colors.primaryForeground : colors.mutedForeground,
                    fontFamily: "Inter_400Regular",
                    opacity: selected ? 0.9 : 1,
                  },
                ]}
              >
                {description}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderFrequencySelector = (value: number, min: number, max: number, onChange: (v: number) => void) => (
    <View style={styles.stepperRow}>
      <TouchableOpacity
        onPress={() => onChange(Math.max(min, value - 1))}
        style={[styles.stepperBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
        disabled={value <= min}
      >
        <Feather name="minus" size={16} color={value <= min ? colors.mutedForeground : colors.foreground} />
      </TouchableOpacity>
      <Text style={[styles.stepperVal, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        {value}
      </Text>
      <TouchableOpacity
        onPress={() => onChange(Math.min(max, value + 1))}
        style={[styles.stepperBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
        disabled={value >= max}
      >
        <Feather name="plus" size={16} color={value >= max ? colors.mutedForeground : colors.foreground} />
      </TouchableOpacity>
    </View>
  );

  const renderStep3 = () => {
    const labelStyle = [styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }];
    const inputStyle = [styles.fieldInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }];

    const EXAMPLES: Record<GoalType, string[]> = {
      milestone:    ["Launch my business", "Get promoted", "Plan a wedding", "Write a book"],
      readiness:    ["Run a marathon", "Pass the bar exam", "Compete in a tournament", "Give a TED talk"],
      measurement:  ["Lose 20 lbs", "Sleep 7.5hrs average", "Save $10,000", "Reach 180 lbs"],
      performance:  ["Bench press 315 lbs", "Run a 5-minute mile", "Do 20 pull-ups", "Shoot 80 in golf"],
      consistency:  ["Work out 4x a week", "Pray every morning", "Read 20 minutes daily", "No alcohol on weekdays"],
      quota:        ["Read 24 books this year", "Log 100 workouts", "Walk 1 million steps", "Save $500/month"],
      leveling:     ["Learn Spanish", "Master BJJ", "Get my real estate license", "Become a better public speaker"],
      avoidance:    ["Stop scrolling before bed", "Quit porn", "Limit alcohol to once a week", "No junk food on weekdays"],
    };

    const renderExamples = (type: GoalType) => (
      <View style={[styles.examplesCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <Text style={[styles.examplesLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
          EXAMPLES
        </Text>
        {EXAMPLES[type].map((ex) => (
          <Text key={ex} style={[styles.examplesItem, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {ex}
          </Text>
        ))}
      </View>
    );

    switch (form.goalType) {
      case "milestone": {
        const milestoneSteps = [
          { label: "Lay the foundation", done: false },
          { label: "Frame the structure", done: false },
          { label: "Walls + insulation", done: false },
          { label: "Interior & finishes", done: false },
          { label: "Move in", done: true },
        ];
        return (
          <View style={styles.stepBody}>
            <Text style={[styles.stepHeading, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              Break it into steps
            </Text>
            <View style={[styles.howItWorksCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Text style={[styles.examplesLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
                HOW IT WORKS
              </Text>
              <Text style={[styles.howItWorksTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                Build a House
              </Text>
              <View style={styles.stepChain}>
                {milestoneSteps.map((s, i) => (
                  <View key={i} style={styles.stepChainRow}>
                    <View style={styles.stepChainLeft}>
                      <View style={[
                        styles.stepChainBox,
                        {
                          borderColor: s.done ? colors.primary : colors.mutedForeground,
                          backgroundColor: s.done ? colors.primary : "transparent",
                        },
                      ]}>
                        {s.done && <Feather name="check" size={9} color={colors.primaryForeground} />}
                      </View>
                      {i < milestoneSteps.length - 1 && (
                        <View style={[styles.stepChainLine, { backgroundColor: colors.border }]} />
                      )}
                    </View>
                    <Text style={[
                      styles.stepChainLabel,
                      {
                        color: s.done ? colors.mutedForeground : colors.foreground,
                        fontFamily: "Inter_400Regular",
                        textDecorationLine: s.done ? "line-through" : "none",
                        opacity: s.done ? 0.6 : 1,
                      },
                    ]}>
                      {s.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
            <Text style={[styles.stepSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Break your goal into steps. Check them off as you go.
            </Text>
            {form.subtasks.map((task, i) => (
              <View key={i} style={styles.subtaskRow}>
                <TextInput
                  style={[inputStyle, { flex: 1 }]}
                  value={task}
                  onChangeText={(v) => {
                    const next = [...form.subtasks];
                    next[i] = v;
                    patch({ subtasks: next });
                  }}
                  placeholder={`Step ${i + 1}`}
                  placeholderTextColor={colors.mutedForeground}
                />
                <TextInput
                  style={[inputStyle, styles.subtaskDateInput]}
                  value={form.subtaskDates[i] ?? ""}
                  onChangeText={(v) => {
                    const next = [...form.subtaskDates];
                    next[i] = v;
                    patch({ subtaskDates: next });
                  }}
                  placeholder="Due date"
                  placeholderTextColor={colors.mutedForeground}
                />
                {form.subtasks.length > 1 && (
                  <TouchableOpacity
                    onPress={() => {
                      const nextTasks = form.subtasks.filter((_, idx) => idx !== i);
                      const nextDates = form.subtaskDates.filter((_, idx) => idx !== i);
                      patch({ subtasks: nextTasks, subtaskDates: nextDates });
                    }}
                    style={styles.subtaskRemove}
                  >
                    <Feather name="x" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {form.subtasks.length < 10 && (
              <TouchableOpacity
                onPress={() => patch({ subtasks: [...form.subtasks, ""], subtaskDates: [...form.subtaskDates, ""] })}
                style={[styles.addRowBtn, { borderColor: colors.border }]}
              >
                <Feather name="plus" size={15} color={colors.primary} />
                <Text style={[styles.addRowBtnText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
                  Add step
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
      }

      case "readiness":
        return (
          <View style={styles.stepBody}>
            <Text style={[styles.stepHeading, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              Tell me about the event
            </Text>
            {renderExamples("readiness")}
            <Text style={labelStyle}>Event date</Text>
            <TextInput
              style={inputStyle}
              value={form.eventDate}
              onChangeText={(v) => patch({ eventDate: v })}
              placeholder="e.g. 2025-10-15"
              placeholderTextColor={colors.mutedForeground}
            />
            <Text style={[labelStyle, { marginTop: 16 }]}>Prep sessions per week</Text>
            {renderFrequencySelector(form.readinessSessions, 1, 7, (v) => patch({ readinessSessions: v }))}
          </View>
        );

      case "measurement":
      case "performance":
      case "quota": {
        const headings = {
          measurement: "Set the numbers",
          performance: "What's the record to beat?",
          quota: "What are you accumulating?",
        };
        const currentLabels = {
          measurement: "Current value",
          performance: "Current PR",
          quota: "Current total",
        };
        const targetLabels = {
          measurement: "Target value",
          performance: "Target",
          quota: "Target total",
        };
        return (
          <View style={styles.stepBody}>
            <Text style={[styles.stepHeading, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {headings[form.goalType]}
            </Text>
            {renderExamples(form.goalType as "measurement" | "performance" | "quota")}
            <Text style={labelStyle}>{currentLabels[form.goalType]}</Text>
            <TextInput
              style={inputStyle}
              value={form.currentValue}
              onChangeText={(v) => patch({ currentValue: v })}
              placeholder="0"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
            />
            <Text style={[labelStyle, { marginTop: 16 }]}>{targetLabels[form.goalType]}</Text>
            <TextInput
              style={inputStyle}
              value={form.targetValue}
              onChangeText={(v) => patch({ targetValue: v })}
              placeholder="100"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
            />
            <Text style={[labelStyle, { marginTop: 16 }]}>Unit</Text>
            <TextInput
              style={inputStyle}
              value={form.unit}
              onChangeText={(v) => patch({ unit: v })}
              placeholder="lbs, km, reps, pages…"
              placeholderTextColor={colors.mutedForeground}
            />
            {form.goalType === "measurement" && (
              <>
                <Text style={[labelStyle, { marginTop: 16 }]}>Direction</Text>
                <View style={styles.directionRow}>
                  {(["up", "down"] as const).map((d) => (
                    <TouchableOpacity
                      key={d}
                      onPress={() => patch({ direction: d })}
                      style={[
                        styles.directionBtn,
                        {
                          backgroundColor: form.direction === d ? colors.primary : colors.muted,
                          borderColor: form.direction === d ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Feather
                        name={d === "up" ? "arrow-up" : "arrow-down"}
                        size={14}
                        color={form.direction === d ? colors.primaryForeground : colors.foreground}
                      />
                      <Text
                        style={[
                          styles.directionBtnText,
                          {
                            color: form.direction === d ? colors.primaryForeground : colors.foreground,
                            fontFamily: "Inter_500Medium",
                          },
                        ]}
                      >
                        {d === "up" ? "Increase" : "Decrease"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </View>
        );
      }

      case "consistency":
        return (
          <View style={styles.stepBody}>
            <Text style={[styles.stepHeading, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              How often?
            </Text>
            {renderExamples("consistency")}
            <Text style={[styles.stepSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Target times per week
            </Text>
            {renderFrequencySelector(form.targetFrequency, 1, 7, (v) => patch({ targetFrequency: v }))}
          </View>
        );

      case "leveling":
        return (
          <View style={styles.stepBody}>
            <Text style={[styles.stepHeading, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              Name your tiers
            </Text>
            {renderExamples("leveling")}
            <Text style={[styles.stepSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Up to 5, from lowest to highest.
            </Text>
            {form.tiers.map((tier, i) => (
              <View key={i} style={styles.subtaskRow}>
                <TextInput
                  style={[inputStyle, { flex: 1 }]}
                  value={tier}
                  onChangeText={(v) => {
                    const next = [...form.tiers];
                    next[i] = v;
                    patch({ tiers: next });
                  }}
                  placeholder={`Tier ${i + 1}`}
                  placeholderTextColor={colors.mutedForeground}
                />
                {form.tiers.length > 1 && (
                  <TouchableOpacity
                    onPress={() => patch({ tiers: form.tiers.filter((_, idx) => idx !== i) })}
                    style={styles.subtaskRemove}
                  >
                    <Feather name="x" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {form.tiers.length < 5 && (
              <TouchableOpacity
                onPress={() => patch({ tiers: [...form.tiers, ""] })}
                style={[styles.addRowBtn, { borderColor: colors.border }]}
              >
                <Feather name="plus" size={15} color={colors.primary} />
                <Text style={[styles.addRowBtnText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
                  Add tier
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );

      case "avoidance":
        return (
          <View style={styles.stepBody}>
            <Text style={[styles.stepHeading, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              Set your limit
            </Text>
            {renderExamples("avoidance")}
            <Text style={[styles.stepSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Max allowed occurrences per week. Set 0 for full elimination.
            </Text>
            {renderFrequencySelector(form.avoidanceLimit, 0, 7, (v) => patch({ avoidanceLimit: v }))}
          </View>
        );

      default:
        return null;
    }
  };

  const renderStep4 = () => {
    const inputStyle = [styles.fieldInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }];
    const labelStyle = [styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }];
    return (
      <View style={styles.stepBody}>
        <Text style={[styles.stepHeading, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Final details
        </Text>
        <Text style={labelStyle}>Deadline</Text>
        <Text style={[styles.fieldHint, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          This will appear on your calendar as a reminder.
        </Text>
        <TextInput
          style={inputStyle}
          value={form.targetDate}
          onChangeText={(v) => patch({ targetDate: v })}
          placeholder="No deadline"
          placeholderTextColor={colors.mutedForeground}
        />
        <Text style={[labelStyle, { marginTop: 16 }]}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
          <View style={styles.chipRow}>
            {CATEGORIES.map((cat) => {
              const active = form.category === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => patch({ category: cat })}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? colors.primary : colors.muted,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: active ? colors.primaryForeground : colors.foreground,
                        fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular",
                      },
                    ]}
                  >
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
        <Text style={[labelStyle, { marginTop: 16 }]}>Notes (optional)</Text>
        <TextInput
          style={[inputStyle, { minHeight: 80, textAlignVertical: "top" }]}
          value={form.notes}
          onChangeText={(v) => patch({ notes: v })}
          placeholder="Anything else to note…"
          placeholderTextColor={colors.mutedForeground}
          multiline
        />
      </View>
    );
  };

  const renderStep5 = () => {
    const typeInfo = GOAL_TYPES.find((t) => t.type === form.goalType);
    const metricLine = (() => {
      switch (form.goalType) {
        case "milestone": return `${form.subtasks.filter((s) => s.trim()).length} steps`;
        case "readiness": return form.eventDate ? `Event: ${form.eventDate}` : "No event date set";
        case "measurement": return `${form.currentValue || "?"} → ${form.targetValue || "?"} ${form.unit}`;
        case "performance": return `PR ${form.currentValue || "?"} → ${form.targetValue || "?"} ${form.unit}`;
        case "consistency": return `${form.targetFrequency}x per week`;
        case "quota": return `${form.currentValue || "0"} → ${form.targetValue || "?"} ${form.unit}`;
        case "leveling": return form.tiers.filter((t) => t.trim()).join(" → ");
        case "avoidance": return form.avoidanceLimit === 0 ? "Full elimination" : `Max ${form.avoidanceLimit}/week`;
        default: return "";
      }
    })();
    return (
      <View style={styles.stepBody}>
        <Text style={[styles.stepHeading, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Review your goal
        </Text>
        <View style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.reviewTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {form.title}
          </Text>
          {typeInfo && (
            <View style={[styles.typeBadge, { backgroundColor: colors.primary }]}>
              <Feather name={typeInfo.icon as any} size={12} color={colors.primaryForeground} />
              <Text style={[styles.typeBadgeText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                {typeInfo.label}
              </Text>
            </View>
          )}
          {metricLine ? (
            <Text style={[styles.reviewMetric, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {metricLine}
            </Text>
          ) : null}
          <View style={styles.reviewRow}>
            <Feather name="tag" size={13} color={colors.mutedForeground} />
            <Text style={[styles.reviewRowText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {form.category.charAt(0).toUpperCase() + form.category.slice(1)}
            </Text>
          </View>
          {form.targetDate ? (
            <View style={styles.reviewRow}>
              <Feather name="calendar" size={13} color={colors.mutedForeground} />
              <Text style={[styles.reviewRowText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {form.targetDate}
              </Text>
            </View>
          ) : null}
          {form.notes ? (
            <Text style={[styles.reviewNotes, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {form.notes}
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  const renderCurrentStep = () => {
    switch (step) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      case 5: return renderStep5();
      default: return null;
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={resetAndClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
          {/* Header row */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={resetAndClose} style={styles.modalCloseBtn}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              New goal
            </Text>
            <View style={{ width: 36 }} />
          </View>

          {/* Step dots */}
          <View style={styles.stepDots}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor: i + 1 === step ? colors.primary : i + 1 < step ? colors.primary : colors.muted,
                    opacity: i + 1 === step ? 1 : i + 1 < step ? 0.4 : 0.3,
                    width: i + 1 === step ? 20 : 8,
                  },
                ]}
              />
            ))}
          </View>

          {/* Step content */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
          >
            {renderCurrentStep()}
          </ScrollView>

          {/* Nav buttons */}
          <View style={[styles.navRow, { paddingBottom: insets.bottom + 16, borderTopColor: colors.border }]}>
            {step > 1 ? (
              <TouchableOpacity
                onPress={() => setStep((s) => s - 1)}
                style={[styles.navBack, { borderColor: colors.border }]}
              >
                <Feather name="arrow-left" size={16} color={colors.foreground} />
                <Text style={[styles.navBtnText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                  Back
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={{ flex: 1 }} />
            )}

            {step < TOTAL_STEPS ? (
              <TouchableOpacity
                onPress={() => {
                  if (!canAdvance()) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setStep((s) => s + 1);
                }}
                disabled={!canAdvance()}
                style={[
                  styles.navNext,
                  { backgroundColor: canAdvance() ? colors.primary : colors.muted },
                ]}
                activeOpacity={0.8}
              >
                <Text style={[styles.navBtnText, { color: canAdvance() ? colors.primaryForeground : colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
                  Next
                </Text>
                <Feather name="arrow-right" size={16} color={canAdvance() ? colors.primaryForeground : colors.mutedForeground} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleCreate}
                disabled={isSaving}
                style={[styles.navNext, { backgroundColor: isSaving ? colors.muted : colors.primary }]}
                activeOpacity={0.8}
              >
                {isSaving ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <>
                    <Text style={[styles.navBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                      Create goal
                    </Text>
                    <Feather name="check" size={16} color={colors.primaryForeground} />
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── GoalsScreen ──────────────────────────────────────────────────────────────

export default function GoalsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: goals, isLoading: goalsLoading } = useListGoals();
  const { data: habits, isLoading: habitsLoading } = useListHabits();
  const createHabit = useCreateHabit();
  const updateHabit = useUpdateHabit();
  const deleteGoal = useDeleteGoal();
  const deleteHabit = useDeleteHabit();

  const [showModal, setShowModal] = useState(false);
  const [newHabitName, setNewHabitName] = useState("");
  const [showHabitInput, setShowHabitInput] = useState(false);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const tabBarH = Platform.OS === "web" ? 84 : 83;

  const handleAddHabit = async () => {
    if (!newHabitName.trim()) return;
    await createHabit.mutateAsync({ data: { name: newHabitName.trim() } });
    queryClient.invalidateQueries({ queryKey: getListHabitsQueryKey() });
    setNewHabitName("");
    setShowHabitInput(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const toggleHabit = async (id: number, completed: boolean, streak: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await updateHabit.mutateAsync({ id, data: { completedToday: !completed, streak: !completed ? streak + 1 : Math.max(0, streak - 1) } });
    queryClient.invalidateQueries({ queryKey: getListHabitsQueryKey() });
  };

  const handleGoalSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
  }, [queryClient]);

  return (
    <>
      <GoalCreationModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={handleGoalSuccess}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: bottomPad + tabBarH + 16, paddingHorizontal: 20 }}
      >
        <Text style={[styles.header, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Goals</Text>

        {/* Big Goals */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Big Goals</Text>
          <TouchableOpacity onPress={() => setShowModal(true)}>
            <Feather name="plus" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {goalsLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : goals?.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="flag" size={24} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              No goals yet. Add something meaningful.
            </Text>
          </View>
        ) : (
          goals?.map((goal) => {
            const typeInfo = GOAL_TYPES.find((t) => t.type === (goal as any).goalType);
            return (
              <View key={goal.id} style={[styles.goalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.goalHeader}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[styles.goalTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]} numberOfLines={2}>
                      {goal.title}
                    </Text>
                    {typeInfo && (
                      <View style={styles.goalTypeBadge}>
                        <Feather name={typeInfo.icon as any} size={11} color={colors.primary} />
                        <Text style={[styles.goalTypeBadgeText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
                          {typeInfo.label}
                        </Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => { deleteGoal.mutate({ id: goal.id }); queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() }); }}>
                    <Feather name="trash-2" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
                {goal.targetDate && (
                  <Text style={[styles.goalDate, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    Target: {goal.targetDate}
                  </Text>
                )}
                <View style={styles.progressRow}>
                  <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
                    <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${goal.progressPercent}%` }]} />
                  </View>
                  <Text style={[styles.progressPct, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                    {goal.progressPercent}%
                  </Text>
                </View>
              </View>
            );
          })
        )}

        {/* Daily Habits */}
        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Daily Habits</Text>
          <TouchableOpacity onPress={() => setShowHabitInput((v) => !v)}>
            <Feather name={showHabitInput ? "x" : "plus"} size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {showHabitInput && (
          <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              style={[styles.textInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
              value={newHabitName}
              onChangeText={setNewHabitName}
              placeholder="Name this habit..."
              placeholderTextColor={colors.mutedForeground}
              onSubmitEditing={handleAddHabit}
              returnKeyType="done"
              autoFocus
            />
            <TouchableOpacity onPress={handleAddHabit} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
              <Feather name="check" size={16} color={colors.primaryForeground} />
            </TouchableOpacity>
          </View>
        )}

        {habitsLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : habits?.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="check-circle" size={24} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              No habits yet. Small things compound.
            </Text>
          </View>
        ) : (
          habits?.map((habit) => (
            <TouchableOpacity
              key={habit.id}
              style={[styles.habitRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => toggleHabit(habit.id, habit.completedToday, habit.streak)}
            >
              <View style={[styles.habitCheck, { borderColor: habit.completedToday ? colors.primary : colors.border, backgroundColor: habit.completedToday ? colors.primary : "transparent" }]}>
                {habit.completedToday && <Feather name="check" size={14} color={colors.primaryForeground} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.habitName, { color: colors.foreground, fontFamily: "Inter_500Medium", textDecorationLine: habit.completedToday ? "line-through" : "none", opacity: habit.completedToday ? 0.6 : 1 }]}>
                  {habit.name}
                </Text>
                <Text style={[styles.habitStreak, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {habit.streak} day streak
                </Text>
              </View>
              <TouchableOpacity onPress={() => { deleteHabit.mutate({ id: habit.id }); queryClient.invalidateQueries({ queryKey: getListHabitsQueryKey() }); }}>
                <Feather name="trash-2" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Screen
  header: { fontSize: 28, marginBottom: 24 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 17 },
  goalCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 10 },
  goalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  goalTitle: { fontSize: 15, lineHeight: 21 },
  goalDate: { fontSize: 12, marginBottom: 10 },
  goalTypeBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  goalTypeBadgeText: { fontSize: 11 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  progressPct: { fontSize: 12, width: 32, textAlign: "right" },
  habitRow: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 8, gap: 14 },
  habitCheck: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, justifyContent: "center", alignItems: "center" },
  habitName: { fontSize: 15, marginBottom: 2 },
  habitStreak: { fontSize: 12 },
  inputRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10, gap: 10 },
  textInput: { flex: 1, fontSize: 15 },
  addBtn: { width: 32, height: 32, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  emptyCard: { borderRadius: 14, borderWidth: 1, padding: 24, alignItems: "center", gap: 10, marginBottom: 12 },
  emptyText: { fontSize: 14, textAlign: "center" },

  // Modal shell
  modalContainer: { flex: 1, paddingHorizontal: 20 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  modalTitle: { fontSize: 17 },
  modalCloseBtn: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },

  // Step dots
  stepDots: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 24, justifyContent: "center" },
  dot: { height: 8, borderRadius: 4 },

  // Step body
  stepBody: { paddingBottom: 24, gap: 8 },
  stepHeading: { fontSize: 22, lineHeight: 30, marginBottom: 4 },
  stepSub: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  modalScroll: { paddingBottom: 16 },

  // Big title input
  bigInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 80,
    textAlignVertical: "top",
    marginTop: 8,
  },

  // Goal type grid
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  typeCard: {
    width: "47%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  typeLabel: { fontSize: 14 },
  typeDesc: { fontSize: 12, lineHeight: 17 },

  // Fields
  fieldLabel: { fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", marginTop: 4 },
  fieldHint: { fontSize: 12, lineHeight: 17, marginTop: 2, marginBottom: 4 },
  subtaskDateInput: { width: 100, flexShrink: 0 },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginTop: 4,
  },

  // Subtask / tier rows
  subtaskRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  subtaskRemove: { padding: 8 },
  addRowBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 10, borderStyle: "dashed", padding: 12, marginTop: 4, justifyContent: "center" },
  addRowBtnText: { fontSize: 14 },

  // Frequency stepper
  stepperRow: { flexDirection: "row", alignItems: "center", gap: 20, marginTop: 8 },
  stepperBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  stepperVal: { fontSize: 28, minWidth: 40, textAlign: "center" },

  // Direction toggle
  directionRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  directionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: 10, paddingVertical: 10 },
  directionBtnText: { fontSize: 14 },

  // Category chips
  chipRow: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13 },

  // Review card
  reviewCard: { borderRadius: 16, borderWidth: 1, padding: 18, gap: 10, marginTop: 8 },
  reviewTitle: { fontSize: 20, lineHeight: 28 },
  typeBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: "flex-start" },
  typeBadgeText: { fontSize: 12 },
  reviewMetric: { fontSize: 14, lineHeight: 20 },
  reviewRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  reviewRowText: { fontSize: 13 },
  reviewNotes: { fontSize: 13, lineHeight: 19, marginTop: 4 },

  // Examples card
  examplesCard: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 4, marginBottom: 4 },
  examplesLabel: { fontSize: 10, letterSpacing: 0.8, marginBottom: 2 },
  examplesItem: { fontSize: 13, lineHeight: 20 },

  // How it works / step chain
  howItWorksCard: { borderWidth: 1, borderStyle: "dashed", borderRadius: 10, padding: 14, gap: 8, marginBottom: 4 },
  howItWorksTitle: { fontSize: 14, marginBottom: 4 },
  stepChain: { gap: 0 },
  stepChainRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, minHeight: 28 },
  stepChainLeft: { alignItems: "center", width: 16 },
  stepChainBox: { width: 16, height: 16, borderRadius: 3, borderWidth: 1.5, justifyContent: "center", alignItems: "center" },
  stepChainLine: { width: 1.5, flex: 1, minHeight: 12 },
  stepChainLabel: { fontSize: 13, lineHeight: 20, paddingTop: 0, flex: 1 },

  // Nav
  navRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 12, borderTopWidth: 1 },
  navBack: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: 12, paddingVertical: 13 },
  navNext: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 13 },
  navBtnText: { fontSize: 15 },
});
