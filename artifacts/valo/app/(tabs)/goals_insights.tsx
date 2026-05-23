import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";
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
  Switch,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import {
  useListGoals,
  useListInsights,
  useCreateGoal,
  useUpdateGoal,
  useCreateCalendarEvent,
  useDeleteGoal,
  getListGoalsQueryKey,
  type Goal,
  type InsightEntry,
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
  prepStartDate: string;
  prepEndDate: string;
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
  prepStartDate: "",
  prepEndDate: "",
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

// ─── Progress Check-in helpers ────────────────────────────────────────────────

function daysSinceUpdate(goal: Goal): number {
  const raw = goal.updatedAt;
  if (!raw) return 0;
  const ms = Date.now() - new Date(raw).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

// ─── Date Picker ──────────────────────────────────────────────────────────────

const PICKER_ITEM_H = 44;
const PICKER_VISIBLE = 5;
const PICKER_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const PICKER_MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const _BASE_YEAR = new Date().getFullYear();
const PICKER_YEAR_STRS = Array.from({ length: 7 }, (_, i) => String(_BASE_YEAR + i));
const PICKER_YEAR_NUMS = Array.from({ length: 7 }, (_, i) => _BASE_YEAR + i);
const PICKER_HOURS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const PICKER_MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
const PICKER_AMPM = ["AM", "PM"];

function formatDateDisplay(iso: string): string {
  if (!iso) return "";
  const hasTime = iso.includes("T");
  const datePart = hasTime ? iso.split("T")[0]! : iso;
  const parts = datePart.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return iso;
  const dateStr = `${PICKER_MONTHS_SHORT[m - 1]} ${d}, ${y}`;
  if (!hasTime) return dateStr;
  const timePart = iso.split("T")[1]!;
  const [hStr, mStr] = timePart.split(":");
  const h24 = Number(hStr);
  const ampm = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 || 12;
  return `${dateStr} at ${h12}:${mStr} ${ampm}`;
}

type PickerColors = ReturnType<typeof useColors>;

function PickerColumn({
  items,
  selectedIndex,
  onSelect,
  colors,
}: {
  items: string[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  colors: PickerColors;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const isScrollingRef = useRef(false);

  useEffect(() => {
    if (isScrollingRef.current) return;
    const safe = Math.max(0, Math.min(selectedIndex, items.length - 1));
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: safe * PICKER_ITEM_H, animated: false });
    }, 60);
    return () => clearTimeout(t);
  }, [selectedIndex, items.length]);

  return (
    <View style={{ flex: 1, height: PICKER_ITEM_H * PICKER_VISIBLE, overflow: "hidden" }}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={PICKER_ITEM_H}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: PICKER_ITEM_H * 2 }}
        onScrollBeginDrag={() => { isScrollingRef.current = true; }}
        onMomentumScrollEnd={(e) => {
          isScrollingRef.current = false;
          const idx = Math.round(e.nativeEvent.contentOffset.y / PICKER_ITEM_H);
          onSelect(Math.max(0, Math.min(idx, items.length - 1)));
        }}
        onScrollEndDrag={(e) => {
          isScrollingRef.current = false;
          const idx = Math.round(e.nativeEvent.contentOffset.y / PICKER_ITEM_H);
          onSelect(Math.max(0, Math.min(idx, items.length - 1)));
        }}
      >
        {items.map((item, i) => (
          <TouchableOpacity
            key={i}
            style={{ height: PICKER_ITEM_H, justifyContent: "center", alignItems: "center" }}
            onPress={() => {
              scrollRef.current?.scrollTo({ y: i * PICKER_ITEM_H, animated: true });
              onSelect(i);
            }}
          >
            <Text
              style={{
                fontSize: 16,
                color: i === selectedIndex ? colors.foreground : colors.mutedForeground,
                fontFamily: i === selectedIndex ? "Inter_600SemiBold" : "Inter_400Regular",
              }}
            >
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function DatePickerField({
  value,
  onChange,
  placeholder = "Set deadline",
  compact = false,
  showTime = false,
  colors,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  compact?: boolean;
  showTime?: boolean;
  colors: PickerColors;
}) {
  const [open, setOpen] = useState(false);
  const [timeEnabled, setTimeEnabled] = useState(false);

  const parseIsoFull = (iso: string) => {
    const hasTime = iso.includes("T");
    const datePart = hasTime ? iso.split("T")[0]! : iso;
    const parts = datePart.split("-").map(Number);
    const now = new Date();
    const base = {
      month: (parts[1] ?? now.getMonth() + 1) - 1,
      day: (parts[2] ?? now.getDate()) - 1,
      year: parts[0] ?? now.getFullYear(),
      hour: 6,   // default: index 6 = "7" AM
      minute: 0,
      ampm: 0,
    };
    if (hasTime) {
      const timePart = iso.split("T")[1]!;
      const [hStr, mStr] = timePart.split(":");
      const h24 = Number(hStr);
      base.ampm = h24 < 12 ? 0 : 1;
      const h12 = h24 % 12; // 0 for midnight/noon
      // index: h12=0 → "12" (index 11), h12=1-11 → "1"-"11" (index 0-10)
      base.hour = h12 === 0 ? 11 : h12 - 1;
      const rounded = String(Math.round(Number(mStr) / 5) * 5).padStart(2, "0");
      const mIdx = PICKER_MINUTES.indexOf(rounded);
      base.minute = mIdx >= 0 ? mIdx : 0;
    }
    return base;
  };

  const todayBase = new Date();
  const initial = value
    ? parseIsoFull(value)
    : { month: todayBase.getMonth(), day: todayBase.getDate() - 1, year: todayBase.getFullYear(), hour: 6, minute: 0, ampm: 0 };

  const [selMonth, setSelMonth] = useState(initial.month);
  const [selDay, setSelDay] = useState(initial.day);
  const [selYear, setSelYear] = useState(initial.year);
  const [selHour, setSelHour] = useState(initial.hour);
  const [selMinute, setSelMinute] = useState(initial.minute);
  const [selAmPm, setSelAmPm] = useState(initial.ampm);

  const daysInMonth = new Date(selYear, selMonth + 1, 0).getDate();
  const dayItems = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => String(i + 1)),
    [daysInMonth],
  );
  const clampedDay = Math.min(selDay, daysInMonth - 1);
  const yearIdx = Math.max(0, PICKER_YEAR_NUMS.indexOf(selYear));

  const handleOpen = () => {
    const now = new Date();
    const parsed = value
      ? parseIsoFull(value)
      : { month: now.getMonth(), day: now.getDate() - 1, year: now.getFullYear(), hour: 6, minute: 0, ampm: 0 };
    setSelMonth(parsed.month);
    setSelDay(parsed.day);
    setSelYear(parsed.year);
    setSelHour(parsed.hour);
    setSelMinute(parsed.minute);
    setSelAmPm(parsed.ampm);
    setTimeEnabled(showTime && value.includes("T"));
    setOpen(true);
  };

  const handleConfirm = () => {
    const mm = String(selMonth + 1).padStart(2, "0");
    const dd = String(clampedDay + 1).padStart(2, "0");
    if (!showTime || !timeEnabled) {
      onChange(`${selYear}-${mm}-${dd}`);
    } else {
      const hourVal = selHour + 1; // 1-12
      let h24: number;
      if (selAmPm === 0) {
        h24 = hourVal === 12 ? 0 : hourVal;
      } else {
        h24 = hourVal === 12 ? 12 : hourVal + 12;
      }
      onChange(`${selYear}-${mm}-${dd}T${String(h24).padStart(2, "0")}:${PICKER_MINUTES[selMinute]!}`);
    }
    setOpen(false);
  };

  const colLabels = showTime && timeEnabled
    ? ["MON", "DAY", "YEAR", "HOUR", "MIN", "AM/PM"]
    : ["MONTH", "DAY", "YEAR"];

  return (
    <>
      <TouchableOpacity
        onPress={handleOpen}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          borderWidth: 1,
          borderRadius: 10,
          paddingHorizontal: 10,
          paddingVertical: compact ? 8 : 10,
          borderColor: value ? colors.primary : colors.border,
          backgroundColor: colors.card,
          ...(compact ? { width: 130 } : {}),
          marginTop: compact ? 0 : 4,
        }}
      >
        <Feather
          name="calendar"
          size={14}
          color={value ? colors.primary : colors.mutedForeground}
        />
        <Text
          style={{
            fontSize: compact ? 13 : 15,
            color: value ? colors.foreground : colors.mutedForeground,
            fontFamily: "Inter_400Regular",
            flexShrink: 1,
          }}
          numberOfLines={1}
        >
          {value ? formatDateDisplay(value) : placeholder}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setOpen(false)}
          />
          <View
            style={{
              backgroundColor: colors.card,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingBottom: 36,
              borderTopWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingHorizontal: 20,
                paddingTop: 16,
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderColor: colors.border,
              }}
            >
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={{ fontSize: 15, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 16, color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>
                {showTime && timeEnabled ? "Pick date & time" : "Pick a date"}
              </Text>
              <TouchableOpacity onPress={handleConfirm}>
                <Text style={{ fontSize: 15, color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
                  Done
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", paddingHorizontal: 20, paddingTop: 10, paddingBottom: 2 }}>
              {colLabels.map((label) => (
                <Text
                  key={label}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    fontSize: 10,
                    letterSpacing: 0.5,
                    color: colors.mutedForeground,
                    fontFamily: "Inter_500Medium",
                  }}
                >
                  {label}
                </Text>
              ))}
            </View>

            <View style={{ flexDirection: "row", paddingHorizontal: 20, position: "relative" }}>
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: 20,
                  right: 20,
                  top: PICKER_ITEM_H * 2,
                  height: PICKER_ITEM_H,
                  borderTopWidth: 1,
                  borderBottomWidth: 1,
                  borderColor: colors.border,
                }}
              />
              <PickerColumn
                items={PICKER_MONTHS}
                selectedIndex={selMonth}
                onSelect={setSelMonth}
                colors={colors}
              />
              <PickerColumn
                items={dayItems}
                selectedIndex={clampedDay}
                onSelect={setSelDay}
                colors={colors}
              />
              <PickerColumn
                items={PICKER_YEAR_STRS}
                selectedIndex={yearIdx}
                onSelect={(i) => setSelYear(PICKER_YEAR_NUMS[i]!)}
                colors={colors}
              />
              {showTime && timeEnabled && (
                <>
                  <PickerColumn
                    items={PICKER_HOURS}
                    selectedIndex={selHour}
                    onSelect={setSelHour}
                    colors={colors}
                  />
                  <PickerColumn
                    items={PICKER_MINUTES}
                    selectedIndex={selMinute}
                    onSelect={setSelMinute}
                    colors={colors}
                  />
                  <PickerColumn
                    items={PICKER_AMPM}
                    selectedIndex={selAmPm}
                    onSelect={setSelAmPm}
                    colors={colors}
                  />
                </>
              )}
            </View>

            {showTime && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 20,
                  paddingTop: 12,
                  paddingBottom: 4,
                  marginTop: 4,
                  borderTopWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                  Add a time (optional)
                </Text>
                <Switch
                  value={timeEnabled}
                  onValueChange={setTimeEnabled}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.card}
                />
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── goalToForm ───────────────────────────────────────────────────────────────

function goalToForm(goal: Goal): GoalForm {
  const g = goal as any;
  let subtasks = [""];
  let subtaskDates = [""];
  if (g.goalType === "milestone" && g.milestones) {
    try {
      const ms: Array<{ id: number; title: string; completed: boolean }> = JSON.parse(g.milestones);
      const prefix = `${goal.title} - `;
      subtasks = ms.map((m) => (m.title.startsWith(prefix) ? m.title.slice(prefix.length) : m.title));
      subtaskDates = ms.map(() => "");
    } catch { /* leave defaults */ }
  }
  let prepStartDate = "";
  let prepEndDate = "";
  let eventDate = "";
  if (g.goalType === "readiness" && goal.targetDate) {
    try {
      const p = JSON.parse(goal.targetDate);
      prepStartDate = p.prepStart ?? "";
      prepEndDate = p.prepEnd ?? "";
      eventDate = p.eventDate ?? "";
    } catch { /* leave defaults */ }
  }
  let tiers = ["Beginner", "Intermediate", "Advanced"];
  if (g.goalType === "leveling" && g.tiers) {
    try { tiers = JSON.parse(g.tiers); } catch { /* leave defaults */ }
  }
  return {
    title: goal.title,
    goalType: (g.goalType as GoalType) || "",
    subtasks,
    subtaskDates,
    prepStartDate,
    prepEndDate,
    eventDate,
    readinessSessions: 3,
    currentValue: g.currentValue != null ? String(g.currentValue) : "",
    targetValue: g.goalType === "consistency"
      ? g.targetValue != null ? String(g.targetValue) : ""
      : g.targetValue != null ? String(g.targetValue) : "",
    unit: g.unit ?? "",
    direction: (g.direction as "up" | "down") ?? "up",
    targetFrequency: g.goalType === "consistency" && g.targetValue != null ? Number(g.targetValue) : 5,
    tiers,
    avoidanceLimit: g.avoidanceLimit ?? 0,
    targetDate: g.goalType === "readiness" ? "" : (goal.targetDate ?? ""),
    category: goal.category ?? "personal",
    notes: g.notes ?? "",
  };
}

// ─── GoalCreationModal ────────────────────────────────────────────────────────

function GoalCreationModal({
  visible,
  onClose,
  onSuccess,
  editingGoal = null,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingGoal?: Goal | null;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const createCalendarEvent = useCreateCalendarEvent();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<GoalForm>(DEFAULT_FORM);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setStep(1);
      setForm(editingGoal ? goalToForm(editingGoal) : DEFAULT_FORM);
    }
  }, [visible, editingGoal]);

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

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const goalTitle = form.title.trim();

      const activeSubtasks = form.subtasks
        .map((s, i) => ({ name: s.trim(), date: (form.subtaskDates[i] ?? "").trim() }))
        .filter((s) => s.name.length > 0);

      // Preserve completed states when editing milestone goals
      const existingMilestones: Array<{ id: number; title: string; completed: boolean }> =
        editingGoal && (editingGoal as any).goalType === "milestone"
          ? (() => { try { return JSON.parse((editingGoal as any).milestones ?? "[]"); } catch { return []; } })()
          : [];

      const milestonePayload =
        form.goalType === "milestone"
          ? JSON.stringify(
              activeSubtasks.map((s, i) => {
                const fullTitle = `${goalTitle} - ${s.name}`;
                const prev = existingMilestones.find((m) => m.title === fullTitle);
                return { id: i + 1, title: fullTitle, completed: prev?.completed ?? false };
              })
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

      const goalPayload = {
        title: goalTitle,
        goalType: form.goalType || "milestone",
        category: form.category,
        targetDate: form.goalType === "readiness"
          ? JSON.stringify({ prepStart: form.prepStartDate.trim(), prepEnd: form.prepEndDate.trim(), eventDate: form.eventDate.trim() })
          : form.targetDate.trim() || null,
        notes: form.notes.trim() || null,
        unit: form.unit.trim() || null,
        direction: form.direction,
        currentValue: currentVal,
        targetValue: targetVal,
        tiers: tiersPayload,
        milestones: milestonePayload,
        avoidanceLimit: form.goalType === "avoidance" ? form.avoidanceLimit : null,
        progressPercent: editingGoal ? (editingGoal as any).progressPercent ?? 0 : 0,
      };

      if (editingGoal) {
        await updateGoal.mutateAsync({ id: editingGoal.id, data: goalPayload });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSuccess();
        resetAndClose();
        return;
      }

      await createGoal.mutateAsync({ data: goalPayload });

      // Strip time portion for calendar event date field (YYYY-MM-DD only)
      const dateOnly = (dt: string) => dt.split("T")[0] ?? dt;

      // Fire calendar events for main deadline
      const calendarJobs: Promise<unknown>[] = [];
      if (form.targetDate.trim()) {
        calendarJobs.push(
          createCalendarEvent.mutateAsync({
            data: {
              title: goalTitle,
              date: dateOnly(form.targetDate.trim()),
              type: "goal-deadline",
              notes: `Goal deadline: ${goalTitle}`,
            },
          })
        );
      }

      // Fire calendar events for readiness prep start, prep end, and event day
      if (form.goalType === "readiness") {
        if (form.prepStartDate.trim()) {
          calendarJobs.push(
            createCalendarEvent.mutateAsync({
              data: {
                title: `${goalTitle} - Prep begins`,
                date: dateOnly(form.prepStartDate.trim()),
                type: "goal-deadline",
                notes: `Goal deadline: ${goalTitle} - Prep begins`,
              },
            })
          );
        }
        if (form.prepEndDate.trim()) {
          calendarJobs.push(
            createCalendarEvent.mutateAsync({
              data: {
                title: `${goalTitle} - Prep ends`,
                date: dateOnly(form.prepEndDate.trim()),
                type: "goal-deadline",
                notes: `Goal deadline: ${goalTitle} - Prep ends`,
              },
            })
          );
        }
        if (form.eventDate.trim()) {
          calendarJobs.push(
            createCalendarEvent.mutateAsync({
              data: {
                title: `${goalTitle} - Event day`,
                date: dateOnly(form.eventDate.trim()),
                type: "goal-deadline",
                notes: `Goal deadline: ${goalTitle} - Event day`,
              },
            })
          );
        }
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
  }, [form, editingGoal, createGoal, updateGoal, createCalendarEvent, onSuccess, resetAndClose]);

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
                <DatePickerField
                  value={form.subtaskDates[i] ?? ""}
                  onChange={(v) => {
                    const next = [...form.subtaskDates];
                    next[i] = v;
                    patch({ subtaskDates: next });
                  }}
                  placeholder="Due date"
                  compact
                  colors={colors}
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
            <Text style={labelStyle}>When do you start preparing?</Text>
            <DatePickerField
              value={form.prepStartDate}
              onChange={(v) => patch({ prepStartDate: v })}
              placeholder="Set prep start date (optional)"
              colors={colors}
            />
            <Text style={[labelStyle, { marginTop: 16 }]}>When does prep end?</Text>
            <DatePickerField
              value={form.prepEndDate}
              onChange={(v) => patch({ prepEndDate: v })}
              placeholder="Set prep end date (optional)"
              colors={colors}
            />
            <Text style={[labelStyle, { marginTop: 16 }]}>When is the event?</Text>
            <DatePickerField
              value={form.eventDate}
              onChange={(v) => patch({ eventDate: v })}
              placeholder="Set event date (optional)"
              showTime
              colors={colors}
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
        <DatePickerField
          value={form.targetDate}
          onChange={(v) => patch({ targetDate: v })}
          placeholder="Set deadline"
          showTime
          colors={colors}
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
              {editingGoal ? "Edit goal" : "New goal"}
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
                onPress={handleSave}
                disabled={isSaving}
                style={[styles.navNext, { backgroundColor: isSaving ? colors.muted : colors.primary }]}
                activeOpacity={0.8}
              >
                {isSaving ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <>
                    <Text style={[styles.navBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                      {editingGoal ? "Save changes" : "Create goal"}
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

// ─── GoalMenuSheet ────────────────────────────────────────────────────────────

function GoalMenuSheet({
  visible,
  goalTitle,
  onClose,
  onDelete,
}: {
  visible: boolean;
  goalTitle: string;
  onClose: () => void;
  onDelete: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 20, borderTopWidth: 1, borderColor: colors.border }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginTop: 12, marginBottom: 10 }} />
          <Text numberOfLines={1} style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderColor: colors.border }}>
            {goalTitle}
          </Text>
          <TouchableOpacity onPress={onDelete} style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 16 }}>
            <Feather name="trash-2" size={18} color="#EF4444" />
            <Text style={{ fontSize: 16, color: "#EF4444", fontFamily: "Inter_500Medium" }}>Delete goal</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── GoalsScreen ──────────────────────────────────────────────────────────────

export default function GoalsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: goals, isLoading: goalsLoading } = useListGoals();
  const { data: insights, isLoading: insightsLoading } = useListInsights();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();

  const [showModal, setShowModal] = useState(false);
  const [menuGoal, setMenuGoal] = useState<Goal | null>(null);

  // Progress check-in state
  const [checkinGoalId, setCheckinGoalId] = useState<number | null>(null);
  const [checkinPercent, setCheckinPercent] = useState("");
  const [checkinNote, setCheckinNote] = useState("");
  const [checkinSaving, setCheckinSaving] = useState(false);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const tabBarH = Platform.OS === "web" ? 84 : 83;

  const handleGoalSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
  }, [queryClient]);

  const handleCheckinSave = useCallback(async (goal: Goal) => {
    const pct = Math.min(100, Math.max(0, parseInt(checkinPercent, 10) || 0));
    setCheckinSaving(true);
    try {
      await updateGoal.mutateAsync({
        id: goal.id,
        data: {
          progressPercent: pct,
          ...(checkinNote.trim() ? { notes: checkinNote.trim() } : {}),
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCheckinGoalId(null);
      setCheckinNote("");
    } catch {
      Alert.alert("Could not save. Please try again.");
    } finally {
      setCheckinSaving(false);
    }
  }, [checkinPercent, checkinNote, updateGoal, queryClient]);

  const handleGoalMenuDelete = useCallback(() => {
    const target = menuGoal;
    setMenuGoal(null);
    if (!target) return;
    setTimeout(() => {
      Alert.alert(
        "Delete goal",
        `Delete "${target.title}"? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => {
            deleteGoal.mutate({ id: target.id });
            queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
          }},
        ]
      );
    }, 350);
  }, [menuGoal, deleteGoal, queryClient]);

  return (
    <>
      <GoalCreationModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={handleGoalSuccess}
      />
      <GoalMenuSheet
        visible={menuGoal !== null}
        goalTitle={menuGoal?.title ?? ""}
        onClose={() => setMenuGoal(null)}
        onDelete={handleGoalMenuDelete}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: bottomPad + tabBarH + 16, paddingHorizontal: 20 }}
      >
        <Text style={[styles.header, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Goals</Text>

        {/* ── Progress Check-in ─────────────────────────────────────────── */}
        {!goalsLoading && (goals ?? []).filter((g) => g.progressPercent < 100).length > 0 && (() => {
          const topGoals = (goals ?? []).filter((g) => g.progressPercent < 100).slice(0, 3);
          return (
            <View style={{ marginBottom: 28 }}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                  Progress Check-in
                </Text>
                <Text style={[styles.checkinDateLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {todayLabel()}
                </Text>
              </View>

              {topGoals.map((goal) => {
                const days = daysSinceUpdate(goal);
                const isStale = days >= 7;
                const isOpen = checkinGoalId === goal.id;
                return (
                  <View
                    key={goal.id}
                    style={[styles.checkinCard, { backgroundColor: colors.card, borderColor: isStale ? "#C49040" : colors.border }]}
                  >
                    {/* Card header row */}
                    <View style={styles.checkinCardTop}>
                      <Text
                        style={[styles.checkinGoalTitle, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}
                        numberOfLines={2}
                      >
                        {goal.title}
                      </Text>
                      <TouchableOpacity
                        onPress={() => {
                          if (isOpen) {
                            setCheckinGoalId(null);
                          } else {
                            setCheckinGoalId(goal.id);
                            setCheckinPercent(String(goal.progressPercent));
                            setCheckinNote("");
                          }
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ padding: 2 }}
                      >
                        <Feather
                          name={isOpen ? "x" : "plus-circle"}
                          size={18}
                          color={colors.primary}
                        />
                      </TouchableOpacity>
                    </View>

                    {/* Progress bar */}
                    <View style={[styles.progressRow, { marginTop: 10 }]}>
                      <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
                        <View
                          style={[
                            styles.progressFill,
                            { backgroundColor: colors.primary, width: `${goal.progressPercent}%` as any },
                          ]}
                        />
                      </View>
                      <Text style={[styles.progressPct, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                        {goal.progressPercent}%
                      </Text>
                    </View>

                    {/* Staleness / last-update label */}
                    {isStale ? (
                      <View style={styles.staleRow}>
                        <Feather name="clock" size={11} color="#C49040" />
                        <Text style={[styles.staleText, { fontFamily: "Inter_400Regular" }]}>
                          No update in {days} day{days !== 1 ? "s" : ""}
                        </Text>
                      </View>
                    ) : days > 0 ? (
                      <Text style={[styles.lastUpdateText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                        Updated {days === 1 ? "yesterday" : `${days}d ago`}
                      </Text>
                    ) : null}

                    {/* Inline update form */}
                    {isOpen && (
                      <View style={[styles.checkinForm, { borderTopColor: colors.border }]}>
                        <View style={styles.checkinPctRow}>
                          <Text style={[styles.checkinPctLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                            Progress %
                          </Text>
                          <TextInput
                            style={[
                              styles.checkinPctInput,
                              { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, fontFamily: "Inter_600SemiBold" },
                            ]}
                            value={checkinPercent}
                            onChangeText={setCheckinPercent}
                            keyboardType="numeric"
                            maxLength={3}
                            selectTextOnFocus
                          />
                        </View>
                        <TextInput
                          style={[
                            styles.checkinNoteInput,
                            { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, fontFamily: "Inter_400Regular" },
                          ]}
                          placeholder="Add a note (optional)"
                          placeholderTextColor={colors.mutedForeground}
                          value={checkinNote}
                          onChangeText={setCheckinNote}
                          multiline
                        />
                        <TouchableOpacity
                          style={[styles.checkinSaveBtn, { backgroundColor: colors.primary }]}
                          onPress={() => handleCheckinSave(goal)}
                          disabled={checkinSaving}
                          activeOpacity={0.8}
                        >
                          {checkinSaving ? (
                            <ActivityIndicator size="small" color={colors.primaryForeground} />
                          ) : (
                            <Text style={[styles.checkinSaveBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                              Save
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })()}

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
              <TouchableOpacity
                key={goal.id}
                style={[styles.goalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push(`/goal/${goal.id}`)}
                activeOpacity={0.85}
              >
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
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation(); setMenuGoal(goal); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ padding: 4 }}
                  >
                    <Feather name="more-horizontal" size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
                {goal.targetDate && (goal as any).goalType !== "readiness" && (
                  <Text style={[styles.goalDate, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    Due: {formatDateDisplay(goal.targetDate)}
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
              </TouchableOpacity>
            );
          })
        )}

        {/* ── Insights ───────────────────────────────────────────────────── */}
        <View style={[styles.sectionHeader, { marginTop: 32 }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Insights</Text>
        </View>

        {insightsLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : !insights?.length ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="zap" size={24} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Insights appear after a few days of logging.
            </Text>
          </View>
        ) : (
          insights.map((insight: InsightEntry) => (
            <View
              key={insight.id}
              style={[styles.insightCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[styles.insightLabelRow]}>
                <View style={[styles.insightLabelBadge, { backgroundColor: colors.muted }]}>
                  <Text style={[styles.insightLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                    {insight.label}
                  </Text>
                </View>
                <Text style={[styles.insightDate, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {insight.date}
                </Text>
              </View>

              <Text style={[styles.insightContent, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                {insight.content}
              </Text>

              {insight.followUpQuestion ? (
                <View style={[styles.insightFollowUp, { borderTopColor: colors.border }]}>
                  <Feather name="message-circle" size={13} color={colors.primary} />
                  <Text style={[styles.insightFollowUpText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    {insight.followUpQuestion}
                  </Text>
                </View>
              ) : null}
            </View>
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

  // Progress Check-in
  checkinDateLabel: { fontSize: 13 },
  checkinCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  checkinCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  checkinGoalTitle: { flex: 1, fontSize: 14, lineHeight: 20 },
  staleRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  staleText: { fontSize: 12, color: "#C49040" },
  lastUpdateText: { fontSize: 12, marginTop: 8 },
  checkinForm: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  checkinPctRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  checkinPctLabel: { fontSize: 13 },
  checkinPctInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 15,
    width: 64,
    textAlign: "center",
  },
  checkinNoteInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 60,
    textAlignVertical: "top",
  },
  checkinSaveBtn: {
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  checkinSaveBtnText: { fontSize: 14 },

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

  // Insight cards
  insightCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
    gap: 10,
  },
  insightLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  insightLabelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  insightLabel: { fontSize: 11, letterSpacing: 0.3 },
  insightDate: { fontSize: 11 },
  insightContent: { fontSize: 14, lineHeight: 22 },
  insightFollowUp: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  insightFollowUpText: { fontSize: 13, lineHeight: 19, flex: 1 },

  // Nav
  navRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 12, borderTopWidth: 1 },
  navBack: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: 12, paddingVertical: 13 },
  navNext: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 13 },
  navBtnText: { fontSize: 15 },
});
