import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import {
  useListGoals,
  useUpdateGoal,
  useDeleteGoal,
  getListGoalsQueryKey,
  type Goal,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

// ─── Types ────────────────────────────────────────────────────────────────────

type MilestoneItem = { id: number; title: string; completed: boolean; date?: string };
type SaveStatus = "idle" | "saving" | "saved" | "error";

// ─── Constants ────────────────────────────────────────────────────────────────

const GOAL_TYPE_LABELS: Record<string, string> = {
  milestone: "Milestone",
  measurement: "Track a Number",
  performance: "Beat My Best",
  consistency: "Show Up",
  quota: "Hit a Total",
  leveling: "Level Up",
  avoidance: "Cut It Out",
  readiness: "Event Prep",
};

const CATEGORIES = [
  "personal", "health", "work", "relationships",
  "learning", "finance", "fitness", "creative",
];

const CAT_COLORS: Record<string, string> = {
  health: "#10B981", work: "#3B82F6", relationships: "#EC4899",
  learning: "#F59E0B", finance: "#8B5CF6", personal: "#6B7280",
  fitness: "#EF4444", creative: "#14B8A6",
};

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  if (!iso) return "";
  const datePart = iso.split("T")[0]!;
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
}

function daysUntil(iso: string): number {
  const t = new Date(iso.includes("T") ? iso : iso + "T12:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((t.getTime() - now.getTime()) / 86400000);
}

// ─── SaveIndicator ────────────────────────────────────────────────────────────

function SaveIndicator({ status }: { status: SaveStatus }) {
  const colors = useColors();
  if (status === "idle") return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      {status === "saving" && (
        <>
          <ActivityIndicator size={12} color={colors.mutedForeground} />
          <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Saving...</Text>
        </>
      )}
      {status === "saved" && (
        <>
          <Feather name="check" size={12} color="#10B981" />
          <Text style={{ fontSize: 12, color: "#10B981", fontFamily: "Inter_400Regular" }}>Saved</Text>
        </>
      )}
      {status === "error" && (
        <>
          <Feather name="alert-circle" size={12} color="#EF4444" />
          <Text style={{ fontSize: 12, color: "#EF4444", fontFamily: "Inter_400Regular" }}>Error saving</Text>
        </>
      )}
    </View>
  );
}

// ─── Stepper ──────────────────────────────────────────────────────────────────

function Stepper({ value, min = 0, max = 100, step = 1, onSave }: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onSave: (v: number) => void;
}) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <TouchableOpacity
        onPress={() => { if (value - step >= min) onSave(value - step); }}
        disabled={value <= min}
        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.muted, justifyContent: "center", alignItems: "center" }}
      >
        <Feather name="minus" size={16} color={value <= min ? colors.border : colors.foreground} />
      </TouchableOpacity>
      <Text style={{ fontSize: 22, color: colors.foreground, fontFamily: "Inter_700Bold", minWidth: 40, textAlign: "center" }}>{value}</Text>
      <TouchableOpacity
        onPress={() => { if (value + step <= max) onSave(value + step); }}
        disabled={value >= max}
        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.muted, justifyContent: "center", alignItems: "center" }}
      >
        <Feather name="plus" size={16} color={value >= max ? colors.border : colors.foreground} />
      </TouchableOpacity>
    </View>
  );
}

// ─── DateField ────────────────────────────────────────────────────────────────

function DateField({ label, value, onSave }: {
  label?: string;
  value: string;
  onSave: (v: string) => void;
}) {
  const colors = useColors();
  const [showModal, setShowModal] = useState(false);
  const [inputVal, setInputVal] = useState("");

  const open = () => {
    setInputVal(value ? value.slice(0, 10) : "");
    setShowModal(true);
  };

  const handleConfirm = () => {
    const trimmed = inputVal.trim();
    if (!trimmed) { onSave(""); setShowModal(false); return; }
    const d = new Date(trimmed + "T12:00:00");
    if (!isNaN(d.getTime())) onSave(trimmed);
    setShowModal(false);
  };

  return (
    <View>
      {label ? (
        <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_500Medium", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 }}>{label}</Text>
      ) : null}
      <TouchableOpacity
        onPress={open}
        style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}
      >
        <Feather name="calendar" size={15} color={colors.mutedForeground} />
        <Text style={{ flex: 1, fontSize: 15, color: value ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
          {value ? fmtDate(value) : "Set date"}
        </Text>
        {value ? (
          <TouchableOpacity onPress={() => onSave("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : (
          <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
        )}
      </TouchableOpacity>
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 24, width: 300, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 15, color: colors.foreground, fontFamily: "Inter_600SemiBold", marginBottom: 6 }}>
              {label ?? "Set date"}
            </Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginBottom: 14 }}>
              Enter date as YYYY-MM-DD
            </Text>
            <TextInput
              value={inputVal}
              onChangeText={setInputVal}
              autoFocus
              placeholder="2025-12-31"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numbers-and-punctuation"
              style={{ fontSize: 20, color: colors.foreground, fontFamily: "Inter_500Medium", borderBottomWidth: 2, borderColor: colors.primary, paddingBottom: 6, marginBottom: 24 }}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => setShowModal(false)}
                style={{ flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: colors.muted, alignItems: "center" }}
              >
                <Text style={{ fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirm}
                style={{ flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center" }}
              >
                <Text style={{ fontSize: 14, color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }}>Set</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── InlineNumberEdit ─────────────────────────────────────────────────────────

function InlineNumberEdit({ value, onSave, large }: {
  value: string;
  onSave: (v: string) => void;
  large?: boolean;
}) {
  const colors = useColors();
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);

  useEffect(() => { setLocal(value); }, [value]);

  if (editing) {
    return (
      <TextInput
        value={local}
        onChangeText={setLocal}
        onBlur={() => { setEditing(false); onSave(local); }}
        autoFocus
        keyboardType="numeric"
        style={{
          fontSize: large ? 28 : 20,
          color: colors.foreground,
          fontFamily: "Inter_700Bold",
          borderBottomWidth: 2,
          borderColor: colors.primary,
          padding: 0,
          minWidth: 60,
        }}
      />
    );
  }
  return (
    <TouchableOpacity onPress={() => setEditing(true)}>
      <Text style={{ fontSize: large ? 28 : 20, color: value ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_700Bold" }}>
        {value || "—"}
      </Text>
    </TouchableOpacity>
  );
}

// ─── MilestoneRow ─────────────────────────────────────────────────────────────

function MilestoneRow({ item, goalTitle, onToggle, onSaveName, onSaveDate, onDelete }: {
  item: MilestoneItem;
  goalTitle: string;
  onToggle: () => void;
  onSaveName: (name: string) => void;
  onSaveDate: (date: string) => void;
  onDelete: () => void;
}) {
  const colors = useColors();
  const prefix = `${goalTitle} - `;
  const rawName = item.title.startsWith(prefix) ? item.title.slice(prefix.length) : item.title;
  const [editing, setEditing] = useState(false);
  const [localName, setLocalName] = useState(rawName);
  const [showDateModal, setShowDateModal] = useState(false);
  const [dateInput, setDateInput] = useState("");

  useEffect(() => { setLocalName(rawName); }, [rawName]);

  const handleNameBlur = () => {
    setEditing(false);
    const trimmed = localName.trim();
    if (trimmed && trimmed !== rawName) onSaveName(trimmed);
  };

  const openDate = () => {
    setDateInput(item.date ? item.date.slice(0, 10) : "");
    setShowDateModal(true);
  };

  const handleDateConfirm = () => {
    const trimmed = dateInput.trim();
    if (trimmed) {
      const d = new Date(trimmed + "T12:00:00");
      if (!isNaN(d.getTime())) onSaveDate(trimmed);
    }
    setShowDateModal(false);
  };

  return (
    <View style={{ marginBottom: 4 }}>
      <View style={{
        flexDirection: "row", alignItems: "center", gap: 10,
        paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10,
        backgroundColor: colors.card, borderWidth: 1,
        borderColor: item.completed ? colors.primary + "40" : colors.border,
      }}>
        <TouchableOpacity onPress={onToggle} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
          <View style={{
            width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
            borderColor: item.completed ? colors.primary : colors.border,
            backgroundColor: item.completed ? colors.primary : "transparent",
            justifyContent: "center", alignItems: "center",
          }}>
            {item.completed && <Feather name="check" size={13} color={colors.primaryForeground} />}
          </View>
        </TouchableOpacity>
        <View style={{ flex: 1, gap: 2 }}>
          {editing ? (
            <TextInput
              value={localName}
              onChangeText={setLocalName}
              onBlur={handleNameBlur}
              autoFocus
              style={{ fontSize: 14, color: colors.foreground, fontFamily: "Inter_500Medium", padding: 0 }}
            />
          ) : (
            <TouchableOpacity onPress={() => setEditing(true)} activeOpacity={0.6}>
              <Text style={{
                fontSize: 14,
                color: item.completed ? colors.mutedForeground : colors.foreground,
                fontFamily: item.completed ? "Inter_400Regular" : "Inter_500Medium",
                textDecorationLine: item.completed ? "line-through" : "none",
              }}>
                {localName}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={openDate} activeOpacity={0.6}>
            <Text style={{ fontSize: 12, color: item.date ? colors.primary : colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
              {item.date ? fmtDate(item.date) : "Add due date"}
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="trash-2" size={15} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
      {showDateModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowDateModal(false)}>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" }}>
            <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 24, width: 280, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 14, color: colors.foreground, fontFamily: "Inter_600SemiBold", marginBottom: 12 }}>Due date (YYYY-MM-DD)</Text>
              <TextInput
                value={dateInput}
                onChangeText={setDateInput}
                autoFocus
                placeholder="2025-12-31"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numbers-and-punctuation"
                style={{ fontSize: 18, color: colors.foreground, fontFamily: "Inter_500Medium", borderBottomWidth: 2, borderColor: colors.primary, paddingBottom: 6, marginBottom: 20 }}
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity onPress={() => setShowDateModal(false)} style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.muted, alignItems: "center" }}>
                  <Text style={{ fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDateConfirm} style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.primary, alignItems: "center" }}>
                  <Text style={{ fontSize: 14, color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }}>Set</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

// ─── TierRow ──────────────────────────────────────────────────────────────────

function TierRow({ tier, index, isCurrent, onSelect, onSaveName, onDelete }: {
  tier: string;
  index: number;
  isCurrent: boolean;
  onSelect: () => void;
  onSaveName: (name: string) => void;
  onDelete: () => void;
}) {
  const colors = useColors();
  const [editing, setEditing] = useState(false);
  const [localName, setLocalName] = useState(tier);

  useEffect(() => { setLocalName(tier); }, [tier]);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <TouchableOpacity
        onPress={onSelect}
        style={{
          flex: 1, flexDirection: "row", alignItems: "center", gap: 10,
          paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
          backgroundColor: isCurrent ? colors.primary + "18" : colors.card,
          borderWidth: 1.5, borderColor: isCurrent ? colors.primary : colors.border,
        }}
      >
        <Text style={{ fontSize: 12, color: isCurrent ? colors.primary : colors.mutedForeground, fontFamily: "Inter_600SemiBold", width: 18 }}>
          {index + 1}
        </Text>
        {editing ? (
          <TextInput
            value={localName}
            onChangeText={setLocalName}
            onBlur={() => { setEditing(false); if (localName.trim()) onSaveName(localName.trim()); }}
            autoFocus
            style={{ flex: 1, fontSize: 14, color: colors.foreground, fontFamily: "Inter_500Medium", padding: 0 }}
          />
        ) : (
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setEditing(true)} activeOpacity={0.6}>
            <Text style={{ fontSize: 14, color: isCurrent ? colors.primary : colors.foreground, fontFamily: isCurrent ? "Inter_700Bold" : "Inter_500Medium" }}>
              {tier}
            </Text>
          </TouchableOpacity>
        )}
        {isCurrent && <Feather name="check-circle" size={16} color={colors.primary} />}
      </TouchableOpacity>
      <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Feather name="trash-2" size={15} color={colors.mutedForeground} />
      </TouchableOpacity>
    </View>
  );
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  const colors = useColors();
  return (
    <View style={{ marginTop: 24, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Text style={{ fontSize: 15, color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
    </View>
  );
}

// ─── GoalDetailScreen ─────────────────────────────────────────────────────────

export default function GoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();

  const { data: goals, isLoading } = useListGoals();
  const goal = (goals?.find((g) => g.id === Number(id))) ?? null;
  const ga = goal as any;

  // ── Local state (seeded once from goal) ──────────────────────────────────────
  const [initialized, setInitialized] = useState(false);
  const [title, setTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [category, setCategory] = useState("personal");
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [notes, setNotes] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [targetDate, setTargetDate] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [milestones, setMilestones] = useState<MilestoneItem[]>([]);
  const [currentValue, setCurrentValue] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [unit, setUnit] = useState("");
  const [editingUnit, setEditingUnit] = useState(false);
  const [direction, setDirection] = useState<"up" | "down">("up");
  const [targetFrequency, setTargetFrequency] = useState(5);
  const [avoidanceLimit, setAvoidanceLimit] = useState(0);
  const [tiers, setTiers] = useState<string[]>([]);
  const [currentTierIdx, setCurrentTierIdx] = useState(0);
  const [readinessDates, setReadinessDates] = useState({ prepStart: "", prepEnd: "", eventDate: "" });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  useEffect(() => {
    if (!goal || initialized) return;
    setTitle(goal.title);
    setCategory(goal.category ?? "personal");
    setNotes(ga.notes ?? "");
    setProgressPercent(goal.progressPercent);
    setCurrentValue(ga.currentValue != null ? String(ga.currentValue) : "");
    setTargetValue(ga.targetValue != null ? String(ga.targetValue) : "");
    setUnit(ga.unit ?? "");
    setDirection(ga.direction ?? "up");
    setTargetFrequency(ga.goalType === "consistency" && ga.targetValue ? Number(ga.targetValue) : 5);
    setAvoidanceLimit(ga.avoidanceLimit ?? 0);
    if (ga.goalType === "milestone" && ga.milestones) {
      try { setMilestones(JSON.parse(ga.milestones)); } catch { setMilestones([]); }
    }
    if (ga.goalType === "leveling" && ga.tiers) {
      try {
        const parsed: string[] = JSON.parse(ga.tiers);
        setTiers(parsed);
        // derive current tier from progressPercent
        const idx = parsed.length > 1 ? Math.round(goal.progressPercent / 100 * (parsed.length - 1)) : 0;
        setCurrentTierIdx(idx);
      } catch { setTiers([]); }
    }
    if (ga.goalType === "readiness" && goal.targetDate) {
      try {
        const p = JSON.parse(goal.targetDate);
        setReadinessDates({ prepStart: p.prepStart ?? "", prepEnd: p.prepEnd ?? "", eventDate: p.eventDate ?? "" });
      } catch { /* ignore */ }
    } else {
      setTargetDate(goal.targetDate ?? "");
    }
    setInitialized(true);
  }, [goal?.id]);


  // ── Patch helper ─────────────────────────────────────────────────────────────
  const patch = useCallback(async (data: Record<string, any>): Promise<boolean> => {
    if (!goal) return false;
    setSaveStatus("saving");
    try {
      await updateGoal.mutateAsync({ id: goal.id, data: data as any });
      queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
      return true;
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
      return false;
    }
  }, [goal, updateGoal, queryClient]);

  // ── Milestone helpers ─────────────────────────────────────────────────────────
  const saveMilestones = useCallback((updated: MilestoneItem[]) => {
    const pct = updated.length ? Math.round(updated.filter((m) => m.completed).length / updated.length * 100) : 0;
    setProgressPercent(pct);
    patch({ milestones: JSON.stringify(updated), progressPercent: pct });
  }, [patch]);

  const toggleMilestone = (itemId: number) => {
    const updated = milestones.map((m) => m.id === itemId ? { ...m, completed: !m.completed } : m);
    setMilestones(updated);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    saveMilestones(updated);
  };

  const updateMilestoneName = (itemId: number, newName: string) => {
    const updated = milestones.map((m) => m.id === itemId ? { ...m, title: `${title} - ${newName}` } : m);
    setMilestones(updated);
    saveMilestones(updated);
  };

  const updateMilestoneDate = (itemId: number, date: string) => {
    const updated = milestones.map((m) => m.id === itemId ? { ...m, date } : m);
    setMilestones(updated);
    saveMilestones(updated);
  };

  const deleteMilestone = (itemId: number) => {
    const updated = milestones.filter((m) => m.id !== itemId);
    setMilestones(updated);
    saveMilestones(updated);
  };

  const addMilestone = () => {
    if (!goal) return;
    const newId = milestones.length ? Math.max(...milestones.map((m) => m.id)) + 1 : 1;
    const updated = [...milestones, { id: newId, title: `${title} - New step`, completed: false }];
    setMilestones(updated);
    saveMilestones(updated);
  };

  // ── Tier helpers ──────────────────────────────────────────────────────────────
  const saveTiers = useCallback((updated: string[], tierIdx: number) => {
    setTiers(updated);
    setCurrentTierIdx(tierIdx);
    const pct = updated.length > 1 ? Math.round(tierIdx / (updated.length - 1) * 100) : 0;
    setProgressPercent(pct);
    patch({ tiers: JSON.stringify(updated), progressPercent: pct });
  }, [patch]);

  // ── Measurement progress calc ──────────────────────────────────────────────────
  const calcMeasurementPct = (cur: string, tar: string, dir: "up" | "down") => {
    const c = parseInt(cur, 10);
    const t = parseInt(tar, 10);
    if (!c || !t || t === 0) return 0;
    return dir === "up"
      ? Math.min(100, Math.max(0, Math.round(c / t * 100)))
      : Math.min(100, Math.max(0, Math.round((1 - c / t) * 100)));
  };

  // ── Delete ────────────────────────────────────────────────────────────────────
  const handleDelete = () => {
    Alert.alert(
      "Delete goal",
      `Delete "${title}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteGoal.mutateAsync({ id: goal!.id });
              queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } catch {
              Alert.alert("Could not delete goal. Please try again.");
            }
          },
        },
      ]
    );
  };

  // ── Loading / not found ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!goal) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background, padding: 24 }}>
        <Text style={{ fontSize: 16, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" }}>Goal not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 14, color: colors.primary, fontFamily: "Inter_500Medium" }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const goalType = ga.goalType ?? "";
  const typeLabel = GOAL_TYPE_LABELS[goalType] ?? "Goal";
  const catColor = CAT_COLORS[category] ?? "#6B7280";

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={{ paddingTop: (Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top), backgroundColor: colors.background, borderBottomWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 36, height: 36, justifyContent: "center", alignItems: "center" }}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <SaveIndicator status={saveStatus} />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 100 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        {editingTitle ? (
          <TextInput
            value={title}
            onChangeText={setTitle}
            onBlur={() => {
              setEditingTitle(false);
              const trimmed = title.trim();
              if (trimmed) patch({ title: trimmed });
            }}
            autoFocus
            multiline
            style={{
              fontSize: 28, lineHeight: 36, color: colors.foreground,
              fontFamily: "Inter_700Bold", marginBottom: 14,
              borderBottomWidth: 2, borderColor: colors.primary, paddingBottom: 4,
            }}
          />
        ) : (
          <TouchableOpacity onPress={() => setEditingTitle(true)} activeOpacity={0.7}>
            <Text style={{ fontSize: 28, lineHeight: 36, color: colors.foreground, fontFamily: "Inter_700Bold", marginBottom: 14 }}>
              {title}
            </Text>
          </TouchableOpacity>
        )}

        {/* Type + category badges */}
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
          <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: colors.muted }}>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>{typeLabel}</Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowCatPicker((v) => !v)}
            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: catColor + "22", borderWidth: 1, borderColor: catColor + "44" }}
          >
            <Text style={{ fontSize: 12, color: catColor, fontFamily: "Inter_600SemiBold" }}>
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Category picker */}
        {showCatPicker && (
          <View style={{ marginTop: 10, marginBottom: 4 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4, paddingHorizontal: 2 }}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  onPress={() => {
                    setCategory(cat);
                    setShowCatPicker(false);
                    patch({ category: cat });
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                    borderWidth: 1.5,
                    borderColor: cat === category ? (CAT_COLORS[cat] ?? "#6B7280") + "80" : colors.border,
                    backgroundColor: cat === category ? (CAT_COLORS[cat] ?? "#6B7280") + "22" : colors.card,
                  }}
                >
                  <Text style={{
                    fontSize: 13,
                    color: cat === category ? (CAT_COLORS[cat] ?? "#6B7280") : colors.mutedForeground,
                    fontFamily: cat === category ? "Inter_600SemiBold" : "Inter_400Regular",
                  }}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Progress ─────────────────────────────────────────────────────────── */}
        <SectionLabel label="Progress" />

        <View style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>Overall</Text>
            <Text style={{ fontSize: 13, color: colors.primary, fontFamily: "Inter_600SemiBold" }}>{progressPercent}%</Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.muted, overflow: "hidden" }}>
            <View style={{ width: `${progressPercent}%` as any, height: 8, backgroundColor: colors.primary, borderRadius: 4 }} />
          </View>
          {/* Manual progress stepper for types that don't auto-calculate */}
          {!["milestone", "measurement", "performance", "quota", "leveling"].includes(goalType) && (
            <View style={{ marginTop: 16, alignItems: "center" }}>
              <Stepper
                value={progressPercent}
                min={0}
                max={100}
                step={5}
                onSave={(v) => { setProgressPercent(v); patch({ progressPercent: v }); }}
              />
            </View>
          )}
        </View>

        {/* ── Milestone ────────────────────────────────────────────────────────── */}
        {goalType === "milestone" && (
          <View style={{ marginBottom: 8 }}>
            {milestones.map((m) => (
              <MilestoneRow
                key={m.id}
                item={m}
                goalTitle={title}
                onToggle={() => { toggleMilestone(m.id); }}
                onSaveName={(name) => updateMilestoneName(m.id, name)}
                onSaveDate={(date) => updateMilestoneDate(m.id, date)}
                onDelete={() => deleteMilestone(m.id)}
              />
            ))}
            <TouchableOpacity
              onPress={addMilestone}
              style={{
                flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8,
                paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
                borderWidth: 1.5, borderColor: colors.primary,
                borderStyle: "dashed",
              }}
              activeOpacity={0.7}
            >
              <Feather name="plus" size={15} color={colors.primary} />
              <Text style={{ fontSize: 14, color: colors.primary, fontFamily: "Inter_500Medium" }}>Add step</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Measurement / Performance ─────────────────────────────────────────── */}
        {["measurement", "performance"].includes(goalType) && (
          <View style={{ marginBottom: 8, padding: 16, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12, marginBottom: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_500Medium", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 }}>Current</Text>
                <InlineNumberEdit
                  value={currentValue}
                  large
                  onSave={(v) => {
                    setCurrentValue(v);
                    const pct = calcMeasurementPct(v, targetValue, direction);
                    setProgressPercent(pct);
                    patch({ currentValue: parseInt(v, 10) || 0, progressPercent: pct });
                  }}
                />
              </View>
              <Text style={{ fontSize: 22, color: colors.border, fontFamily: "Inter_400Regular", paddingBottom: 6 }}>→</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_500Medium", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 }}>Target</Text>
                <InlineNumberEdit
                  value={targetValue}
                  large
                  onSave={(v) => {
                    setTargetValue(v);
                    const pct = calcMeasurementPct(currentValue, v, direction);
                    setProgressPercent(pct);
                    patch({ targetValue: parseInt(v, 10) || null, progressPercent: pct });
                  }}
                />
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>Unit:</Text>
              {editingUnit ? (
                <TextInput
                  value={unit}
                  onChangeText={setUnit}
                  onBlur={() => { setEditingUnit(false); patch({ unit: unit.trim() || null }); }}
                  autoFocus
                  style={{ fontSize: 14, color: colors.foreground, fontFamily: "Inter_400Regular", borderBottomWidth: 1, borderColor: colors.primary, padding: 0, minWidth: 80 }}
                />
              ) : (
                <TouchableOpacity onPress={() => setEditingUnit(true)}>
                  <Text style={{ fontSize: 14, color: unit ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{unit || "e.g. reps, kg, km"}</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["up", "down"] as const).map((dir) => (
                <TouchableOpacity
                  key={dir}
                  onPress={() => { setDirection(dir); patch({ direction: dir }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  style={{ flex: 1, paddingVertical: 9, borderRadius: 8, backgroundColor: direction === dir ? colors.primary : colors.muted, alignItems: "center" }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 13, color: direction === dir ? colors.primaryForeground : colors.mutedForeground, fontFamily: "Inter_500Medium" }}>
                    {dir === "up" ? "Increase" : "Decrease"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Quota ────────────────────────────────────────────────────────────── */}
        {goalType === "quota" && (
          <View style={{ marginBottom: 8, padding: 16, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12, marginBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_500Medium", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 }}>Done</Text>
                <InlineNumberEdit
                  value={currentValue}
                  large
                  onSave={(v) => {
                    setCurrentValue(v);
                    const c = parseInt(v, 10);
                    const t = parseInt(targetValue, 10);
                    const pct = c && t ? Math.min(100, Math.round(c / t * 100)) : 0;
                    setProgressPercent(pct);
                    patch({ currentValue: c || 0, progressPercent: pct });
                  }}
                />
              </View>
              <Text style={{ fontSize: 28, color: colors.border, fontFamily: "Inter_400Regular", paddingBottom: 4 }}>/</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_500Medium", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 }}>Target</Text>
                <InlineNumberEdit
                  value={targetValue}
                  large
                  onSave={(v) => {
                    setTargetValue(v);
                    const c = parseInt(currentValue, 10);
                    const t = parseInt(v, 10);
                    const pct = c && t ? Math.min(100, Math.round(c / t * 100)) : 0;
                    setProgressPercent(pct);
                    patch({ targetValue: parseInt(v, 10) || null, progressPercent: pct });
                  }}
                />
              </View>
            </View>
            {editingUnit ? (
              <TextInput
                value={unit}
                onChangeText={setUnit}
                onBlur={() => { setEditingUnit(false); patch({ unit: unit.trim() || null }); }}
                autoFocus
                style={{ fontSize: 14, color: colors.foreground, fontFamily: "Inter_400Regular", borderBottomWidth: 1, borderColor: colors.primary, padding: 0 }}
              />
            ) : (
              <TouchableOpacity onPress={() => setEditingUnit(true)}>
                <Text style={{ fontSize: 14, color: unit ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{unit || "Unit (e.g. books, miles)"}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Consistency ──────────────────────────────────────────────────────── */}
        {goalType === "consistency" && (
          <View style={{ marginBottom: 8, padding: 16, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_500Medium", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 14 }}>Target frequency</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Stepper
                value={targetFrequency}
                min={1}
                max={7}
                step={1}
                onSave={(v) => { setTargetFrequency(v); patch({ targetValue: v }); }}
              />
              <Text style={{ fontSize: 15, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>times per week</Text>
            </View>
          </View>
        )}

        {/* ── Leveling ─────────────────────────────────────────────────────────── */}
        {goalType === "leveling" && (
          <View style={{ marginBottom: 8 }}>
            {tiers.map((tier, i) => (
              <TierRow
                key={i}
                tier={tier}
                index={i}
                isCurrent={i === currentTierIdx}
                onSelect={() => { saveTiers(tiers, i); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                onSaveName={(name) => { const updated = [...tiers]; updated[i] = name; saveTiers(updated, currentTierIdx); }}
                onDelete={() => { const updated = tiers.filter((_, idx) => idx !== i); saveTiers(updated, Math.min(currentTierIdx, updated.length - 1)); }}
              />
            ))}
            <TouchableOpacity
              onPress={() => { const updated = [...tiers, "New tier"]; saveTiers(updated, currentTierIdx); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: colors.primary, borderStyle: "dashed" }}
              activeOpacity={0.7}
            >
              <Feather name="plus" size={15} color={colors.primary} />
              <Text style={{ fontSize: 14, color: colors.primary, fontFamily: "Inter_500Medium" }}>Add tier</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Avoidance ────────────────────────────────────────────────────────── */}
        {goalType === "avoidance" && (
          <View style={{ marginBottom: 8, padding: 16, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 20 }}>
            <View>
              <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_500Medium", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 14 }}>Weekly limit</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Stepper
                  value={avoidanceLimit}
                  min={0}
                  max={7}
                  step={1}
                  onSave={(v) => { setAvoidanceLimit(v); patch({ avoidanceLimit: v }); }}
                />
                <Text style={{ fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                  {avoidanceLimit === 0 ? "— full elimination" : "per week"}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Readiness ────────────────────────────────────────────────────────── */}
        {goalType === "readiness" && (
          <View style={{ marginBottom: 8, gap: 10 }}>
            {readinessDates.eventDate ? (
              <View style={{ padding: 16, borderRadius: 14, backgroundColor: colors.primary + "15", borderWidth: 1, borderColor: colors.primary + "40", alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: colors.primary, fontFamily: "Inter_500Medium", marginBottom: 4 }}>
                  {daysUntil(readinessDates.eventDate) >= 0 ? "Days until event" : "Event was"}
                </Text>
                <Text style={{ fontSize: 52, color: colors.primary, fontFamily: "Inter_700Bold", lineHeight: 60 }}>
                  {Math.abs(daysUntil(readinessDates.eventDate))}
                </Text>
                {daysUntil(readinessDates.eventDate) < 0 && (
                  <Text style={{ fontSize: 12, color: colors.primary, fontFamily: "Inter_400Regular", marginTop: 2 }}>days ago</Text>
                )}
              </View>
            ) : null}
            <DateField
              label="Prep start"
              value={readinessDates.prepStart}
              onSave={(v) => { const u = { ...readinessDates, prepStart: v }; setReadinessDates(u); patch({ targetDate: JSON.stringify(u) }); }}
            />
            <DateField
              label="Prep end"
              value={readinessDates.prepEnd}
              onSave={(v) => { const u = { ...readinessDates, prepEnd: v }; setReadinessDates(u); patch({ targetDate: JSON.stringify(u) }); }}
            />
            <DateField
              label="Event date"
              value={readinessDates.eventDate}
              onSave={(v) => { const u = { ...readinessDates, eventDate: v }; setReadinessDates(u); patch({ targetDate: JSON.stringify(u) }); }}
            />
          </View>
        )}

        {/* ── Details ──────────────────────────────────────────────────────────── */}
        <SectionLabel label="Details" />

        {goalType !== "readiness" && (
          <View style={{ marginBottom: 14 }}>
            <DateField
              label="Deadline"
              value={targetDate}
              onSave={(v) => {
                setTargetDate(v);
                patch({ targetDate: v || null });
              }}
            />
          </View>
        )}

        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_500Medium", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 }}>Notes</Text>
          {editingNotes ? (
            <TextInput
              value={notes}
              onChangeText={setNotes}
              onBlur={() => { setEditingNotes(false); patch({ notes: notes.trim() || null }); }}
              autoFocus
              multiline
              placeholder="Add notes..."
              placeholderTextColor={colors.mutedForeground}
              style={{
                fontSize: 14, color: colors.foreground, fontFamily: "Inter_400Regular", lineHeight: 21,
                minHeight: 80, padding: 14, borderRadius: 10, backgroundColor: colors.card,
                borderWidth: 1.5, borderColor: colors.primary, textAlignVertical: "top",
              }}
            />
          ) : (
            <TouchableOpacity
              onPress={() => setEditingNotes(true)}
              style={{ padding: 14, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, minHeight: 52 }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 14, color: notes ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 21 }}>
                {notes || "Add notes..."}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Delete ───────────────────────────────────────────────────────────── */}
        <View style={{ marginTop: 28, marginBottom: 8 }}>
          <TouchableOpacity
            onPress={handleDelete}
            style={{ paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: "#EF4444", alignItems: "center" }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 16, color: "#EF4444", fontFamily: "Inter_600SemiBold" }}>Delete goal</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
