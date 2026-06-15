import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import DraggableFlatList, {
  type RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TemplateSlot {
  key: string; // local unique key (for DraggableFlatList)
  id?: number; // DB id if loaded from server
  exerciseId: number;
  exerciseName: string;
  exerciseCategory: string;
  trackingType: string;
  prescribedSets: string;
  prescribedReps: string;
  prescribedWeightKg: string;
  prescribedDurationSec: string;
  restSec: string;
  supersetGroupId: number | null;
  notes: string;
}

export interface TemplateEditorData {
  name: string;
  category: string;
  estimatedDurationMin: number | null;
  notes: string | null;
  slots: TemplateSlot[];
}

export interface TemplateEditorProps {
  title?: string;
  initialName?: string;
  initialCategory?: string;
  initialDurationMin?: number | null;
  initialNotes?: string | null;
  initialSlots?: TemplateSlot[];
  onSave: (data: TemplateEditorData) => Promise<void>;
  isSaving?: boolean;
  rightAction?: React.ReactNode;
}

type SearchExercise = {
  id: number;
  name: string;
  category: string;
  trackingType: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = ["strength", "cardio", "hiit", "mobility", "sport"] as const;

const SUPERSET_COLORS = [
  "#C17B3F", "#4A8C72", "#7A5A9A", "#4A6D8A", "#8A5A30",
];

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  strength: { bg: "#F5DDD8", text: "#A06050" },
  cardio: { bg: "#D8EBE3", text: "#4A7D68" },
  hiit: { bg: "#E8E4F8", text: "#6A5A9A" },
  mobility: { bg: "#EDE5D8", text: "#8A6D3A" },
  sport: { bg: "#D8EBF5", text: "#4A6D8A" },
};

let _keyCounter = 0;
function newKey() {
  return `slot-${Date.now()}-${++_keyCounter}`;
}

function supersetColor(groupId: number) {
  return SUPERSET_COLORS[(groupId - 1) % SUPERSET_COLORS.length]!;
}

function catStyle(cat: string) {
  return CATEGORY_COLORS[cat.toLowerCase()] ?? { bg: "#F0ECE6", text: "#8A7D70" };
}

// ── Main component ─────────────────────────────────────────────────────────────

export function TemplateEditor({
  title = "Template",
  initialName = "",
  initialCategory = "strength",
  initialDurationMin = null,
  initialNotes = null,
  initialSlots = [],
  onSave,
  isSaving = false,
  rightAction,
}: TemplateEditorProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // ── Template metadata state ──────────────────────────────────────────────
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState(initialCategory);
  const [durationMin, setDurationMin] = useState(
    initialDurationMin != null ? String(initialDurationMin) : "",
  );
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [showNotes, setShowNotes] = useState(!!initialNotes);

  // ── Slot state ───────────────────────────────────────────────────────────
  const [slots, setSlots] = useState<TemplateSlot[]>(initialSlots);
  const nextGroupRef = useRef(
    Math.max(0, ...initialSlots.map((s) => s.supersetGroupId ?? 0)) + 1,
  );

  // ── Exercise search modal ────────────────────────────────────────────────
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchExercise[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const results = await customFetch<SearchExercise[]>(
        `/api/exercises?search=${encodeURIComponent(q)}&limit=40`,
      );
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void runSearch(searchQuery.trim());
    }, 320);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, runSearch]);

  function openSearch() {
    setSearchQuery("");
    setSearchResults([]);
    setShowSearch(true);
  }

  function pickExercise(ex: SearchExercise) {
    setShowSearch(false);
    const slot: TemplateSlot = {
      key: newKey(),
      exerciseId: ex.id,
      exerciseName: ex.name,
      exerciseCategory: ex.category,
      trackingType: ex.trackingType,
      prescribedSets: "3",
      prescribedReps: ex.trackingType === "duration" ? "" : "10",
      prescribedWeightKg: "",
      prescribedDurationSec: ex.trackingType === "duration" ? "60" : "",
      restSec: "90",
      supersetGroupId: null,
      notes: "",
    };
    setSlots((prev) => [...prev, slot]);
  }

  // ── Field update helpers ─────────────────────────────────────────────────
  function updateSlot(key: string, patch: Partial<TemplateSlot>) {
    setSlots((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function removeSlot(key: string) {
    setSlots((prev) => prev.filter((s) => s.key !== key));
  }

  // ── Superset grouping ────────────────────────────────────────────────────
  function toggleSuperset(key: string) {
    const idx = slots.findIndex((s) => s.key === key);
    if (idx === -1 || idx === slots.length - 1) {
      Alert.alert("Superset", "Add another exercise below to create a superset.");
      return;
    }
    const current = slots[idx]!;
    const next = slots[idx + 1]!;

    if (
      current.supersetGroupId !== null &&
      current.supersetGroupId === next.supersetGroupId
    ) {
      // Break the superset between these two.
      const gid = current.supersetGroupId;
      setSlots((prev) =>
        prev.map((s) =>
          s.supersetGroupId === gid ? { ...s, supersetGroupId: null } : s,
        ),
      );
    } else {
      // Group them together.
      const gid = nextGroupRef.current++;
      setSlots((prev) =>
        prev.map((s, i) =>
          i === idx || i === idx + 1 ? { ...s, supersetGroupId: gid } : s,
        ),
      );
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!name.trim()) {
      Alert.alert("Name required", "Give your template a name before saving.");
      return;
    }
    await onSave({
      name: name.trim(),
      category,
      estimatedDurationMin: durationMin.trim() ? parseInt(durationMin.trim(), 10) : null,
      notes: notes.trim() || null,
      slots,
    });
  }

  // ── Render slot row ───────────────────────────────────────────────────────
  const renderSlot = useCallback(
    ({ item, drag, isActive }: RenderItemParams<TemplateSlot>) => {
      const ss = item.supersetGroupId !== null;
      const ssColor = ss ? supersetColor(item.supersetGroupId!) : null;
      const cs = catStyle(item.exerciseCategory);
      const isDuration = item.trackingType === "duration";
      const isCardio = ["distance_duration", "cardio_machine"].includes(item.trackingType);

      return (
        <ScaleDecorator activeScale={0.98}>
          <View
            style={[
              styles.slotCard,
              {
                backgroundColor: isActive ? colors.muted : colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            {ss && (
              <View style={[styles.supersetBar, { backgroundColor: ssColor! }]} />
            )}
            <View style={styles.slotMain}>
              {/* Top row: name + drag handle + remove */}
              <View style={styles.slotTopRow}>
                <TouchableOpacity onPressIn={drag} hitSlop={8} style={styles.dragHandle}>
                  <Feather name="menu" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
                <View style={styles.slotNameWrap}>
                  <Text
                    style={[styles.slotName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}
                    numberOfLines={1}
                  >
                    {item.exerciseName}
                  </Text>
                  <View style={[styles.catBadge, { backgroundColor: cs.bg }]}>
                    <Text style={[styles.catBadgeText, { color: cs.text, fontFamily: "Inter_600SemiBold" }]}>
                      {item.exerciseCategory.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => removeSlot(item.key)}
                  hitSlop={8}
                  style={styles.removeBtn}
                >
                  <Feather name="x" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              {/* Inputs row */}
              <View style={styles.slotInputsRow}>
                <SlotInput
                  label="Sets"
                  value={item.prescribedSets}
                  onChangeText={(v) => updateSlot(item.key, { prescribedSets: v })}
                  colors={colors}
                />
                {isDuration || isCardio ? (
                  <SlotInput
                    label="Sec"
                    value={item.prescribedDurationSec}
                    onChangeText={(v) => updateSlot(item.key, { prescribedDurationSec: v })}
                    colors={colors}
                  />
                ) : (
                  <SlotInput
                    label="Reps"
                    value={item.prescribedReps}
                    onChangeText={(v) => updateSlot(item.key, { prescribedReps: v })}
                    colors={colors}
                  />
                )}
                {!["bodyweight_reps", "reps_only", "duration", "distance_duration", "cardio_machine"].includes(item.trackingType) && (
                  <SlotInput
                    label="kg"
                    value={item.prescribedWeightKg}
                    onChangeText={(v) => updateSlot(item.key, { prescribedWeightKg: v })}
                    colors={colors}
                    decimal
                  />
                )}
                <SlotInput
                  label="Rest(s)"
                  value={item.restSec}
                  onChangeText={(v) => updateSlot(item.key, { restSec: v })}
                  colors={colors}
                />
              </View>

              {/* Bottom row: superset toggle + notes */}
              <View style={styles.slotBottomRow}>
                <TouchableOpacity
                  onPress={() => toggleSuperset(item.key)}
                  style={[
                    styles.supersetBtn,
                    ss
                      ? { backgroundColor: ssColor! + "22", borderColor: ssColor! }
                      : { backgroundColor: colors.muted, borderColor: colors.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.supersetBtnText,
                      { color: ss ? ssColor! : colors.mutedForeground, fontFamily: "Inter_500Medium" },
                    ]}
                  >
                    {ss ? "Superset" : "+ Superset"}
                  </Text>
                </TouchableOpacity>

                <TextInput
                  value={item.notes}
                  onChangeText={(v) => updateSlot(item.key, { notes: v })}
                  placeholder="Notes..."
                  placeholderTextColor={colors.mutedForeground}
                  style={[
                    styles.slotNotesInput,
                    { color: colors.foreground, borderColor: colors.border, fontFamily: "Inter_400Regular" },
                  ]}
                />
              </View>
            </View>
          </View>
        </ScaleDecorator>
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colors, slots],
  );

  // ── Header component for DraggableFlatList ───────────────────────────────
  const ListHeader = (
    <View style={styles.listHeader}>
      {/* Name */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          NAME
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Push Day, Upper Body..."
          placeholderTextColor={colors.mutedForeground}
          style={[
            styles.nameInput,
            { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" },
          ]}
        />
      </View>

      {/* Category */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          CATEGORY
        </Text>
        <View style={styles.categoryRow}>
          {CATEGORIES.map((cat) => {
            const selected = category === cat;
            const cs = catStyle(cat);
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => setCategory(cat)}
                style={[
                  styles.catPill,
                  selected
                    ? { backgroundColor: cs.bg, borderColor: cs.text }
                    : { backgroundColor: colors.muted, borderColor: colors.border },
                ]}
              >
                <Text
                  style={[
                    styles.catPillText,
                    { color: selected ? cs.text : colors.mutedForeground, fontFamily: selected ? "Inter_600SemiBold" : "Inter_400Regular" },
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Duration + Notes toggle */}
      <View style={styles.metaRow}>
        <View style={[styles.fieldGroup, { flex: 1 }]}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            DURATION (MIN)
          </Text>
          <TextInput
            value={durationMin}
            onChangeText={(v) => setDurationMin(v.replace(/[^0-9]/g, ""))}
            placeholder="60"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
            maxLength={3}
            style={[
              styles.smallInput,
              { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" },
            ]}
          />
        </View>
        <TouchableOpacity
          onPress={() => setShowNotes((v) => !v)}
          style={[styles.notesToggle, { backgroundColor: colors.muted, borderColor: colors.border }]}
        >
          <Feather name="file-text" size={14} color={colors.mutedForeground} />
          <Text style={[styles.notesToggleText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {showNotes ? "Hide notes" : "Add notes"}
          </Text>
        </TouchableOpacity>
      </View>

      {showNotes && (
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Template notes (optional)..."
          placeholderTextColor={colors.mutedForeground}
          multiline
          numberOfLines={3}
          style={[
            styles.notesInput,
            { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" },
          ]}
        />
      )}

      {/* Exercises label */}
      <Text style={[styles.exercisesLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
        EXERCISES
      </Text>
      {slots.length === 0 && (
        <View style={[styles.emptyExercises, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Text style={[styles.emptyExercisesText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            No exercises yet. Tap the button below to add from the library.
          </Text>
        </View>
      )}
    </View>
  );

  const ListFooter = (
    <View style={styles.listFooter}>
      <TouchableOpacity
        onPress={openSearch}
        style={[styles.addExBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
        activeOpacity={0.8}
      >
        <Feather name="plus" size={18} color={colors.primary} />
        <Text style={[styles.addExBtnText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
          Add exercise
        </Text>
      </TouchableOpacity>
    </View>
  );

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.headerBtn}
        >
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {title}
        </Text>
        <View style={styles.headerRight}>
          {rightAction}
          <TouchableOpacity
            onPress={() => { void handleSave(); }}
            disabled={isSaving}
            style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: isSaving ? 0.7 : 1 }]}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.saveBtnText, { color: colors.primaryForeground, fontFamily: "Inter_700Bold" }]}>
                Save
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Main draggable list */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <DraggableFlatList
          data={slots}
          keyExtractor={(item) => item.key}
          onDragEnd={({ data }) => setSlots(data)}
          renderItem={renderSlot}
          ListHeaderComponent={ListHeader}
          ListFooterComponent={ListFooter}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 32 }]}
          activationDistance={10}
        />
      </KeyboardAvoidingView>

      {/* Exercise search modal */}
      <Modal
        visible={showSearch}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSearch(false)}
      >
        <View style={styles.searchModalBg}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            onPress={() => setShowSearch(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.searchSheet}
          >
            <View style={[styles.searchCard, { backgroundColor: colors.card }]}>
              <View style={[styles.searchHeader, { borderBottomColor: colors.border }]}>
                <Feather name="search" size={18} color={colors.mutedForeground} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search exercises..."
                  placeholderTextColor={colors.mutedForeground}
                  autoFocus
                  style={[styles.searchInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                />
                <TouchableOpacity onPress={() => setShowSearch(false)}>
                  <Text style={[styles.searchCancel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>

              {searching ? (
                <View style={styles.searchLoading}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : (
                <FlatList
                  data={searchResults}
                  keyExtractor={(e) => String(e.id)}
                  renderItem={({ item }) => {
                    const cs = catStyle(item.category);
                    return (
                      <TouchableOpacity
                        onPress={() => pickExercise(item)}
                        style={[styles.searchResult, { borderBottomColor: colors.border }]}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.searchResultCat, { backgroundColor: cs.bg }]}>
                          <Text style={[styles.searchResultCatText, { color: cs.text, fontFamily: "Inter_600SemiBold" }]}>
                            {item.category.toUpperCase()}
                          </Text>
                        </View>
                        <Text style={[styles.searchResultName, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                          {item.name}
                        </Text>
                        <Feather name="plus" size={16} color={colors.primary} />
                      </TouchableOpacity>
                    );
                  }}
                  ListEmptyComponent={
                    searchQuery.trim().length > 0 && !searching ? (
                      <View style={styles.searchEmpty}>
                        <Text style={[styles.searchEmptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                          No exercises found for that search.
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.searchEmpty}>
                        <Text style={[styles.searchEmptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                          Type to search the exercise library.
                        </Text>
                      </View>
                    )
                  }
                  keyboardShouldPersistTaps="handled"
                  style={{ maxHeight: 360 }}
                />
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

// ── Slot input sub-component ──────────────────────────────────────────────────

function SlotInput({
  label,
  value,
  onChangeText,
  colors,
  decimal = false,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  decimal?: boolean;
}) {
  return (
    <View style={styles.slotInputWrap}>
      <Text style={[styles.slotInputLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={(v) => onChangeText(decimal ? v.replace(/[^0-9.]/g, "") : v.replace(/[^0-9]/g, ""))}
        keyboardType={decimal ? "decimal-pad" : "number-pad"}
        maxLength={5}
        style={[
          styles.slotInputField,
          { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, fontFamily: "Inter_400Regular" },
        ]}
        placeholder="-"
        placeholderTextColor={colors.mutedForeground}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { padding: 4 },
  headerTitle: { fontSize: 17, flex: 1, textAlign: "center" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 10 },
  saveBtnText: { fontSize: 14 },

  listContent: { paddingHorizontal: 0 },
  listHeader: { paddingHorizontal: 16, paddingTop: 20, gap: 18 },
  listFooter: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },

  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 11, letterSpacing: 0.6 },

  nameInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
  },
  smallInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    width: 80,
  },

  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  catPillText: { fontSize: 13 },

  metaRow: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  notesToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
  },
  notesToggleText: { fontSize: 13 },
  notesInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: "top",
  },

  exercisesLabel: { fontSize: 11, letterSpacing: 0.6, marginTop: 4 },
  emptyExercises: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  emptyExercisesText: { fontSize: 14, lineHeight: 20, textAlign: "center" },

  // Slot card
  slotCard: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  supersetBar: { width: 4, borderRadius: 4 },
  slotMain: { flex: 1, padding: 14, gap: 10 },

  slotTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dragHandle: { padding: 2 },
  slotNameWrap: { flex: 1, gap: 4 },
  slotName: { fontSize: 14 },
  catBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  catBadgeText: { fontSize: 9, letterSpacing: 0.4 },
  removeBtn: { padding: 4 },

  slotInputsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  slotInputWrap: { alignItems: "center", gap: 4 },
  slotInputLabel: { fontSize: 10, letterSpacing: 0.4 },
  slotInputField: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    width: 60,
    textAlign: "center",
  },

  slotBottomRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  supersetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  supersetBtnText: { fontSize: 11 },
  slotNotesInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    height: 30,
  },

  addExBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  addExBtnText: { fontSize: 15 },

  // Search modal
  searchModalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  searchSheet: { maxHeight: "75%" },
  searchCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" },
  searchHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 16 },
  searchCancel: { fontSize: 14 },
  searchLoading: { paddingVertical: 40, alignItems: "center" },
  searchResult: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchResultCat: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  searchResultCatText: { fontSize: 9, letterSpacing: 0.4 },
  searchResultName: { flex: 1, fontSize: 15 },
  searchEmpty: { paddingVertical: 40, alignItems: "center", paddingHorizontal: 24 },
  searchEmptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
});
