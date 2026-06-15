import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

// ─── Types ────────────────────────────────────────────────────────────────────

type Template = { id: number; name: string; category: string; estimatedDurationMin: number | null };

type ProgramDay = {
  weekNumber: number;
  dayOfWeek: string; // mon | tue | wed | thu | fri | sat | sun
  templateId: number | null;
  templateName: string | null;
};

type ExerciseSuggestion = {
  exerciseId: number;
  name: string;
  suggestedWeightKg: number | null;
  suggestedReps: number | null;
  lastSessionDate: string | null;
  lastAvgWeightKg: number | null;
  lastAvgReps: number | null;
  trend: "improving" | "maintaining" | "declining";
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS: { key: string; label: string; short: string }[] = [
  { key: "mon", label: "Monday",    short: "M"  },
  { key: "tue", label: "Tuesday",   short: "Tu" },
  { key: "wed", label: "Wednesday", short: "W"  },
  { key: "thu", label: "Thursday",  short: "Th" },
  { key: "fri", label: "Friday",    short: "F"  },
  { key: "sat", label: "Saturday",  short: "Sa" },
  { key: "sun", label: "Sunday",    short: "Su" },
];

const MAX_WEEKS = 16;

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  strength: { bg: "#F5DDD8", text: "#A06050" },
  cardio:   { bg: "#D8EBE3", text: "#4A7D68" },
  hiit:     { bg: "#E8E4F8", text: "#6A5A9A" },
  mobility: { bg: "#EDE5D8", text: "#8A6D3A" },
  sport:    { bg: "#D8EBF5", text: "#4A6D8A" },
};

function catStyle(cat: string) {
  return CATEGORY_COLORS[cat.toLowerCase()] ?? { bg: "#F0ECE6", text: "#8A7D70" };
}

function abbrev(name: string, maxChars = 9): string {
  if (name.length <= maxChars) return name;
  // Try first word
  const first = name.split(" ")[0]!;
  if (first.length <= maxChars) return first;
  return first.slice(0, maxChars - 1) + "…";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CopilotProgramEditScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name: string; totalWeeks: string; notes: string }>();

  const isNew = !params.id;
  const programId = params.id ? parseInt(params.id, 10) : null;

  const [name, setName] = useState(params.name ?? "");
  const [totalWeeks, setTotalWeeks] = useState(Math.max(1, parseInt(params.totalWeeks ?? "4", 10)));
  const [notes, setNotes] = useState(params.notes ?? "");
  const [schedule, setSchedule] = useState<ProgramDay[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [saving, setSaving] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [isAttached, setIsAttached] = useState(false);

  // Picker modal
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerCell, setPickerCell] = useState<{ week: number; day: string } | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");

  // Suggestions modal
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);
  const [suggestions, setSuggestions] = useState<ExerciseSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsTemplate, setSuggestionsTemplate] = useState<string>("");

  useEffect(() => {
    loadTemplates();
    if (programId) loadSchedule();
  }, [programId]);

  async function loadTemplates() {
    try {
      const data = await customFetch<Template[]>("/api/workout/templates");
      setTemplates(data);
    } catch {
      // silent
    }
  }

  async function loadSchedule() {
    if (!programId) return;
    try {
      const data = await customFetch<{ program: { startDate: string | null }; days: ProgramDay[] }>(
        `/api/workout/programs/${programId}/days`,
      );
      setSchedule(data.days);
      setIsAttached(Boolean(data.program.startDate));
    } catch {
      // silent
    }
  }

  function getCell(week: number, day: string): ProgramDay | undefined {
    return schedule.find((d) => d.weekNumber === week && d.dayOfWeek === day);
  }

  function openPicker(week: number, day: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPickerCell({ week, day });
    setTemplateSearch("");
    setPickerVisible(true);
  }

  function assignTemplate(week: number, day: string, template: Template | null) {
    setSchedule((prev) => {
      const filtered = prev.filter((d) => !(d.weekNumber === week && d.dayOfWeek === day));
      if (template === null) return filtered; // rest day — no entry
      return [...filtered, { weekNumber: week, dayOfWeek: day, templateId: template.id, templateName: template.name }];
    });
    setPickerVisible(false);
  }

  async function openSuggestions(templateId: number, templateName: string) {
    setSuggestionsTemplate(templateName);
    setSuggestionsVisible(true);
    setSuggestionsLoading(true);
    setSuggestions([]);
    try {
      // Get exercises for the template first
      type TemplateExercise = { exerciseId: number; name: string; prescribedWeightKg: number | null; prescribedReps: number | null };
      const exercises = await customFetch<TemplateExercise[]>(`/api/workout/templates/${templateId}/exercises`);
      // Fetch suggestions for each exercise in parallel
      const results = await Promise.all(
        exercises.map(async (ex) => {
          try {
            const s = await customFetch<{ suggestion: { suggestedWeightKg: number | null; suggestedReps: number | null; lastSessionDate: string | null; lastAvgWeightKg: number | null; lastAvgReps: number | null; trend: string } | null; reason: string }>(
              `/api/workout/exercises/${ex.exerciseId}/suggestions`,
            );
            return {
              exerciseId: ex.exerciseId,
              name: ex.name,
              suggestedWeightKg: s.suggestion?.suggestedWeightKg ?? null,
              suggestedReps: s.suggestion?.suggestedReps ?? null,
              lastSessionDate: s.suggestion?.lastSessionDate ?? null,
              lastAvgWeightKg: s.suggestion?.lastAvgWeightKg ?? null,
              lastAvgReps: s.suggestion?.lastAvgReps ?? null,
              trend: (s.suggestion?.trend ?? "maintaining") as ExerciseSuggestion["trend"],
            };
          } catch {
            return { exerciseId: ex.exerciseId, name: ex.name, suggestedWeightKg: null, suggestedReps: null, lastSessionDate: null, lastAvgWeightKg: null, lastAvgReps: null, trend: "maintaining" as const };
          }
        }),
      );
      setSuggestions(results);
    } catch {
      // silent
    } finally {
      setSuggestionsLoading(false);
    }
  }

  async function save() {
    if (!name.trim()) { Alert.alert("Name required", "Give your program a name."); return; }
    setSaving(true);
    try {
      let pid = programId;
      if (isNew) {
        const created = await customFetch<{ id: number }>("/api/workout/programs", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), totalWeeks, notes: notes.trim() || null }),
        });
        pid = created.id;
      } else {
        await customFetch(`/api/workout/programs/${pid}`, {
          method: "PATCH",
          body: JSON.stringify({ name: name.trim(), totalWeeks, notes: notes.trim() || null }),
        });
      }
      // Save schedule
      const daysToSave = schedule
        .filter((d) => d.weekNumber <= totalWeeks && d.templateId !== null)
        .map((d) => ({ weekNumber: d.weekNumber, dayOfWeek: d.dayOfWeek, templateId: d.templateId }));
      await customFetch(`/api/workout/programs/${pid}/days`, {
        method: "PUT",
        body: JSON.stringify({ days: daysToSave }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch {
      Alert.alert("Could not save", "Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAttach() {
    if (!programId) { Alert.alert("Save first", "Save the program before attaching it to the calendar."); return; }
    setAttaching(true);
    try {
      const today = new Date().toISOString().split("T")[0]!;
      await customFetch(`/api/workout/programs/${programId}/attach`, {
        method: "POST",
        body: JSON.stringify({ startDate: today }),
      });
      setIsAttached(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert("Attached", "Workouts have been added to your calendar.");
    } catch {
      Alert.alert("Could not attach", "Please try again.");
    } finally {
      setAttaching(false);
    }
  }

  async function handleDetach() {
    if (!programId) return;
    Alert.alert("Detach program", "This will remove all workout events from your calendar.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Detach",
        style: "destructive",
        onPress: async () => {
          setAttaching(true);
          try {
            await customFetch(`/api/workout/programs/${programId}/attach`, { method: "DELETE" });
            setIsAttached(false);
          } catch {
            Alert.alert("Could not detach", "Please try again.");
          } finally {
            setAttaching(false);
          }
        },
      },
    ]);
  }

  const filteredTemplates = templates.filter((t) =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase()),
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.root, { backgroundColor: colors.background }]}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {isNew ? "New Program" : "Edit Program"}
        </Text>
        <TouchableOpacity onPress={save} disabled={saving} style={styles.saveBtn}>
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.saveBtnText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Metadata form */}
        <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              style={[styles.fieldInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
              placeholder="e.g. 5/3/1 Block, PPL Program"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="done"
            />
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Weeks</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                onPress={() => setTotalWeeks((w) => Math.max(1, w - 1))}
                style={[styles.stepBtn, { borderColor: colors.border }]}
              >
                <Feather name="minus" size={16} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={[styles.stepValue, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                {totalWeeks}
              </Text>
              <TouchableOpacity
                onPress={() => setTotalWeeks((w) => Math.min(MAX_WEEKS, w + 1))}
                style={[styles.stepBtn, { borderColor: colors.border }]}
              >
                <Feather name="plus" size={16} color={colors.foreground} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={[styles.fieldRow, { alignItems: "flex-start" }]}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 3 }]}>Notes</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              style={[styles.fieldInput, { color: colors.foreground, fontFamily: "Inter_400Regular", minHeight: 56 }]}
              placeholder="Optional description…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              returnKeyType="done"
            />
          </View>
        </View>

        {/* Schedule grid */}
        <View style={styles.gridSection}>
          <Text style={[styles.gridLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
            SCHEDULE
          </Text>
          <Text style={[styles.gridHint, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Tap a day to assign a template. Leave empty for rest days.
          </Text>

          {/* Day header row */}
          <View style={styles.gridRow}>
            <View style={styles.weekNumHeader} />
            {DAYS.map((d) => (
              <Text
                key={d.key}
                style={[styles.dayHeader, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}
              >
                {d.short}
              </Text>
            ))}
          </View>

          {/* Week rows */}
          {Array.from({ length: totalWeeks }, (_, wi) => {
            const week = wi + 1;
            return (
              <View key={week} style={styles.gridRow}>
                <Text style={[styles.weekNum, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  W{week}
                </Text>
                {DAYS.map((d) => {
                  const cell = getCell(week, d.key);
                  const hasTemplate = Boolean(cell?.templateId);
                  return (
                    <TouchableOpacity
                      key={d.key}
                      onPress={() => openPicker(week, d.key)}
                      style={[
                        styles.cell,
                        {
                          backgroundColor: hasTemplate ? colors.secondary : colors.muted,
                          borderColor: hasTemplate ? colors.primary + "60" : colors.border,
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      {hasTemplate ? (
                        <>
                          <Text
                            style={[styles.cellText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}
                            numberOfLines={2}
                          >
                            {abbrev(cell!.templateName ?? "")}
                          </Text>
                          <TouchableOpacity
                            hitSlop={6}
                            onPress={() => openSuggestions(cell!.templateId!, cell!.templateName ?? "")}
                            style={styles.suggestionBtn}
                          >
                            <Feather name="trending-up" size={10} color={colors.primary + "90"} />
                          </TouchableOpacity>
                        </>
                      ) : (
                        <Feather name="plus" size={14} color={colors.mutedForeground + "80"} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </View>

        {/* Calendar attachment */}
        {!isNew && (
          <View style={[styles.attachCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[styles.attachTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                {isAttached ? "Attached to calendar" : "Attach to calendar"}
              </Text>
              <Text style={[styles.attachSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {isAttached
                  ? "Workouts appear on your Plan page. Detach to remove them."
                  : "Adds each workout day as an event on your Plan page."}
              </Text>
            </View>
            {attaching ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : isAttached ? (
              <TouchableOpacity onPress={handleDetach} style={[styles.detachBtn, { borderColor: colors.border }]}>
                <Text style={[styles.detachBtnText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Detach</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={handleAttach} style={[styles.attachBtn, { backgroundColor: colors.primary }]}>
                <Feather name="calendar" size={14} color={colors.primaryForeground} />
                <Text style={[styles.attachBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>Attach</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>

      {/* Template picker modal */}
      <Modal visible={pickerVisible} transparent animationType="slide" onRequestClose={() => setPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setPickerVisible(false)} />
          <View style={[styles.pickerSheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                {pickerCell ? `${DAYS.find((d) => d.key === pickerCell.day)?.label}, Week ${pickerCell.week}` : "Pick template"}
              </Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)} hitSlop={10}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={[styles.searchRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Feather name="search" size={15} color={colors.mutedForeground} />
              <TextInput
                value={templateSearch}
                onChangeText={setTemplateSearch}
                style={[styles.searchInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                placeholder="Search templates…"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>

            {/* Rest day option */}
            <TouchableOpacity
              style={[styles.pickerRow, { borderBottomColor: colors.border }]}
              onPress={() => pickerCell && assignTemplate(pickerCell.week, pickerCell.day, null)}
            >
              <View style={[styles.restBadge, { backgroundColor: colors.muted }]}>
                <Feather name="moon" size={14} color={colors.mutedForeground} />
              </View>
              <Text style={[styles.pickerRowName, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Rest day (clear)
              </Text>
            </TouchableOpacity>

            <FlatList
              data={filteredTemplates}
              keyExtractor={(t) => String(t.id)}
              style={{ maxHeight: 340 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const cs = catStyle(item.category);
                return (
                  <TouchableOpacity
                    style={[styles.pickerRow, { borderBottomColor: colors.border }]}
                    onPress={() => pickerCell && assignTemplate(pickerCell.week, pickerCell.day, item)}
                  >
                    <View style={[styles.catBadge, { backgroundColor: cs.bg }]}>
                      <Text style={[styles.catBadgeText, { color: cs.text, fontFamily: "Inter_600SemiBold" }]}>
                        {item.category.slice(0, 3).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickerRowName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                        {item.name}
                      </Text>
                      {item.estimatedDurationMin ? (
                        <Text style={[styles.pickerRowSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                          {item.estimatedDurationMin} min
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={[styles.pickerEmpty, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  No templates found
                </Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Suggestions modal */}
      <Modal visible={suggestionsVisible} transparent animationType="slide" onRequestClose={() => setSuggestionsVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setSuggestionsVisible(false)} />
          <View style={[styles.pickerSheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={styles.pickerHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.pickerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                  Next session targets
                </Text>
                <Text style={[styles.pickerSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {suggestionsTemplate}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSuggestionsVisible(false)} hitSlop={10}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            {suggestionsLoading ? (
              <View style={styles.suggestLoading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 10 }]}>
                  Analysing your history…
                </Text>
              </View>
            ) : suggestions.length === 0 ? (
              <Text style={[styles.pickerEmpty, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                No exercises found in this template.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                {suggestions.map((s) => {
                  const hasHistory = s.lastSessionDate !== null;
                  const trendIcon = s.trend === "improving" ? "trending-up" : s.trend === "declining" ? "trending-down" : "minus";
                  const trendColor = s.trend === "improving" ? "#4A7D68" : s.trend === "declining" ? "#A05050" : colors.mutedForeground;
                  return (
                    <View key={s.exerciseId} style={[styles.suggestionRow, { borderBottomColor: colors.border }]}>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={[styles.suggestionName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                          {s.name}
                        </Text>
                        {hasHistory ? (
                          <Text style={[styles.suggestionLast, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                            Last:{" "}
                            {s.lastAvgWeightKg !== null ? `${s.lastAvgWeightKg}kg` : ""}
                            {s.lastAvgWeightKg !== null && s.lastAvgReps !== null ? " × " : ""}
                            {s.lastAvgReps !== null ? `${s.lastAvgReps} reps` : ""}
                          </Text>
                        ) : (
                          <Text style={[styles.suggestionLast, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                            No history yet
                          </Text>
                        )}
                      </View>
                      {hasHistory && (s.suggestedWeightKg !== null || s.suggestedReps !== null) ? (
                        <View style={styles.suggestionTarget}>
                          <Feather name={trendIcon} size={13} color={trendColor} />
                          <Text style={[styles.suggestionTargetText, { color: trendColor, fontFamily: "Inter_600SemiBold" }]}>
                            {s.suggestedWeightKg !== null ? `${s.suggestedWeightKg}kg` : ""}
                            {s.suggestedWeightKg !== null && s.suggestedReps !== null ? " × " : ""}
                            {s.suggestedReps !== null ? `${s.suggestedReps}` : ""}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17 },
  saveBtn: { padding: 4, minWidth: 44, alignItems: "flex-end" },
  saveBtnText: { fontSize: 15 },
  content: { paddingHorizontal: 16, paddingTop: 20, gap: 20 },

  formCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  fieldRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  fieldLabel: { fontSize: 14, width: 52 },
  fieldInput: { flex: 1, fontSize: 15 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 16 },

  stepper: { flexDirection: "row", alignItems: "center", gap: 16 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  stepValue: { fontSize: 17, minWidth: 24, textAlign: "center" },

  gridSection: { gap: 10 },
  gridLabel: { fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase" },
  gridHint: { fontSize: 12, marginTop: -4 },

  gridRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  weekNumHeader: { width: 28 },
  weekNum: { width: 28, fontSize: 11, textAlign: "center" },
  dayHeader: { flex: 1, textAlign: "center", fontSize: 11 },

  cell: {
    flex: 1,
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 3,
    gap: 2,
  },
  cellText: { fontSize: 9, textAlign: "center", lineHeight: 12 },
  suggestionBtn: { padding: 2 },

  attachCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  attachTitle: { fontSize: 14 },
  attachSub: { fontSize: 12, lineHeight: 17 },
  attachBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 11 },
  attachBtnText: { fontSize: 13 },
  detachBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 11, borderWidth: 1 },
  detachBtnText: { fontSize: 13 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  pickerSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 12 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  pickerHeader: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  pickerTitle: { fontSize: 17 },
  pickerSub: { fontSize: 13, marginTop: 2 },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 14 },

  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerRowName: { fontSize: 15 },
  pickerRowSub: { fontSize: 12, marginTop: 1 },
  pickerEmpty: { textAlign: "center", paddingVertical: 24, fontSize: 14 },

  restBadge: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  catBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, minWidth: 40, alignItems: "center" },
  catBadgeText: { fontSize: 10 },

  suggestLoading: { alignItems: "center", paddingVertical: 36 },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  suggestionName: { fontSize: 14 },
  suggestionLast: { fontSize: 12 },
  suggestionTarget: { flexDirection: "row", alignItems: "center", gap: 4 },
  suggestionTargetText: { fontSize: 14 },
});
