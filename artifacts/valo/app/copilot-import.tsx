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
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

// ── Types ─────────────────────────────────────────────────────────────────────

type ParsedExercise = {
  name: string;
  matchedExerciseId: number | null;
  matchedExerciseName: string | null;
  confidence: "high" | "medium" | "low";
  prescribedSets: number | null;
  prescribedReps: number | null;
  prescribedWeightKg: number | null;
  restSec: number | null;
  supersetGroupId: number | null;
  notes: string | null;
};

type ParsedTemplate = {
  templateName: string;
  category: string;
  estimatedDurationMin: number | null;
  exercises: ParsedExercise[];
};

type SearchExercise = { id: number; name: string; category: string; trackingType: string };

type Resolution = { exerciseId: number; exerciseName: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  strength: { bg: "#F5DDD8", text: "#A06050" },
  cardio: { bg: "#D8EBE3", text: "#4A7D68" },
  hiit: { bg: "#E8E4F8", text: "#6A5A9A" },
  mobility: { bg: "#EDE5D8", text: "#8A6D3A" },
  sport: { bg: "#D8EBF5", text: "#4A6D8A" },
};

function catStyle(cat: string) {
  return CATEGORY_COLORS[cat.toLowerCase()] ?? { bg: "#F0ECE6", text: "#8A7D70" };
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function CopilotImportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [mode, setMode] = useState<"text" | "image">("text");
  const [rawText, setRawText] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [imagePickedMsg, setImagePickedMsg] = useState<string | null>(null);

  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");

  // Resolution map: index in exercises[] → { exerciseId, exerciseName }
  const [resolutions, setResolutions] = useState<Map<number, Resolution>>(new Map());
  const [skipped, setSkipped] = useState<Set<number>>(new Set());

  const [saving, setSaving] = useState(false);

  // Exercise search modal
  const [showSearch, setShowSearch] = useState(false);
  const [pickingIndex, setPickingIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchExercise[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Image picker ─────────────────────────────────────────────────────────

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo library access to pick a workout screenshot.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      base64: true,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0]!;
    if (!asset.base64) {
      Alert.alert("Error", "Could not read the image. Please try again.");
      return;
    }
    setImageBase64(asset.base64);
    const ext = asset.uri?.split(".").pop()?.toLowerCase() ?? "jpg";
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    setImageMimeType(mime);
    setImagePickedMsg(`Image ready — tap Parse to extract the workout.`);
    setParsed(null);
  }

  async function captureImage() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow camera access to photograph a workout.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      base64: true,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0]!;
    if (!asset.base64) {
      Alert.alert("Error", "Could not read the photo. Please try again.");
      return;
    }
    setImageBase64(asset.base64);
    setImageMimeType("image/jpeg");
    setImagePickedMsg("Photo ready — tap Parse to extract the workout.");
    setParsed(null);
  }

  // ── Parse ─────────────────────────────────────────────────────────────────

  async function handleParse() {
    if (mode === "text" && !rawText.trim()) {
      Alert.alert("Nothing to parse", "Paste your workout text first.");
      return;
    }
    if (mode === "image" && !imageBase64) {
      Alert.alert("No image", "Pick a workout screenshot first.");
      return;
    }
    setParsing(true);
    setParsed(null);
    setResolutions(new Map());
    setSkipped(new Set());
    try {
      const body =
        mode === "text"
          ? JSON.stringify({ text: rawText.trim() })
          : JSON.stringify({ imageBase64, mimeType: imageMimeType });

      const result = await customFetch<ParsedTemplate>("/api/workout/templates/import", {
        method: "POST",
        body,
      });
      setParsed(result);
      setTemplateName(result.templateName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Parse failed";
      Alert.alert("Parse failed", msg);
    } finally {
      setParsing(false);
    }
  }

  // ── Exercise search ────────────────────────────────────────────────────────

  const runSearch = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const res = await customFetch<SearchExercise[]>(
        `/api/exercises?search=${encodeURIComponent(q)}&limit=40`,
      );
      setSearchResults(res);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(() => { void runSearch(searchQuery.trim()); }, 320);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery, runSearch]);

  function openPicker(idx: number) {
    setPickingIndex(idx);
    setSearchQuery("");
    setSearchResults([]);
    setShowSearch(true);
  }

  function pickResolution(ex: SearchExercise) {
    if (pickingIndex === null) return;
    setResolutions((prev) => {
      const next = new Map(prev);
      next.set(pickingIndex, { exerciseId: ex.id, exerciseName: ex.name });
      return next;
    });
    setSkipped((prev) => { const next = new Set(prev); next.delete(pickingIndex); return next; });
    setShowSearch(false);
  }

  function toggleSkip(idx: number) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
    setResolutions((prev) => { const next = new Map(prev); next.delete(idx); return next; });
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!parsed) return;
    if (!templateName.trim()) { Alert.alert("Name required", "Give the template a name."); return; }

    // Check for unresolved exercises that are neither resolved nor skipped.
    const needsResolution = parsed.exercises.filter(
      (ex, i) => ex.matchedExerciseId === null && !resolutions.has(i) && !skipped.has(i),
    );
    if (needsResolution.length > 0) {
      Alert.alert(
        "Unresolved exercises",
        `${needsResolution.length} exercise(s) still need attention. Pick an exercise from the library or mark them as skipped.`,
      );
      return;
    }

    setSaving(true);
    try {
      type SavedTpl = { id: number };
      const tpl = await customFetch<SavedTpl>("/api/workout/templates", {
        method: "POST",
        body: JSON.stringify({
          name: templateName.trim(),
          category: parsed.category,
          estimatedDurationMin: parsed.estimatedDurationMin,
        }),
      });

      let orderIndex = 0;
      for (let i = 0; i < parsed.exercises.length; i++) {
        if (skipped.has(i)) continue;
        const ex = parsed.exercises[i]!;
        const resolved = resolutions.get(i);
        const exerciseId = resolved?.exerciseId ?? ex.matchedExerciseId;
        if (!exerciseId) continue;

        await customFetch(`/api/workout/templates/${tpl.id}/exercises`, {
          method: "POST",
          body: JSON.stringify({
            exerciseId,
            orderIndex: orderIndex++,
            prescribedSets: ex.prescribedSets,
            prescribedReps: ex.prescribedReps,
            prescribedWeightKg: ex.prescribedWeightKg,
            restSec: ex.restSec ?? 90,
            supersetGroupId: ex.supersetGroupId,
            notes: ex.notes,
          }),
        });
      }

      Alert.alert("Saved", `"${templateName.trim()}" has been added to your templates.`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert("Save failed", "Could not save the template. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  const needsAttentionCount = parsed
    ? parsed.exercises.filter(
        (ex, i) => ex.matchedExerciseId === null && !resolutions.has(i) && !skipped.has(i),
      ).length
    : 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Import workout
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Mode tabs */}
          <View style={[styles.tabRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => setMode("text")}
              style={[styles.tab, mode === "text" && { backgroundColor: colors.card }]}
              activeOpacity={0.8}
            >
              <Feather name="align-left" size={15} color={mode === "text" ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.tabText, { color: mode === "text" ? colors.primary : colors.mutedForeground, fontFamily: mode === "text" ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                Paste text
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setMode("image")}
              style={[styles.tab, mode === "image" && { backgroundColor: colors.card }]}
              activeOpacity={0.8}
            >
              <Feather name="image" size={15} color={mode === "image" ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.tabText, { color: mode === "image" ? colors.primary : colors.mutedForeground, fontFamily: mode === "image" ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                Screenshot
              </Text>
            </TouchableOpacity>
          </View>

          {/* Input area */}
          {mode === "text" ? (
            <View style={styles.inputSection}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                PASTE YOUR WORKOUT
              </Text>
              <TextInput
                value={rawText}
                onChangeText={setRawText}
                placeholder={`e.g.\nPush Day\nBench Press 4x8 @ 80kg\nIncline DB Press 3x12\n...`}
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={10}
                textAlignVertical="top"
                style={[
                  styles.textArea,
                  { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" },
                ]}
              />
            </View>
          ) : (
            <View style={styles.imageSection}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                WORKOUT SCREENSHOT
              </Text>
              {imagePickedMsg ? (
                <View style={[styles.imageReadyCard, { backgroundColor: "#D8EBE3", borderColor: "#A8D8B8" }]}>
                  <Feather name="check-circle" size={18} color="#4A7D68" />
                  <Text style={[styles.imageReadyText, { color: "#4A7D68", fontFamily: "Inter_500Medium" }]}>
                    {imagePickedMsg}
                  </Text>
                </View>
              ) : (
                <View style={[styles.imagePlaceholder, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Feather name="image" size={32} color={colors.mutedForeground} />
                  <Text style={[styles.imagePlaceholderText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    Pick a screenshot of your workout
                  </Text>
                </View>
              )}
              <View style={styles.imageButtons}>
                <TouchableOpacity
                  onPress={pickImage}
                  style={[styles.imageBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  activeOpacity={0.8}
                >
                  <Feather name="image" size={16} color={colors.foreground} />
                  <Text style={[styles.imageBtnText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                    Photo library
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={captureImage}
                  style={[styles.imageBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  activeOpacity={0.8}
                >
                  <Feather name="camera" size={16} color={colors.foreground} />
                  <Text style={[styles.imageBtnText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                    Camera
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Parse button */}
          <TouchableOpacity
            onPress={() => { void handleParse(); }}
            disabled={parsing}
            style={[styles.parseBtn, { backgroundColor: colors.primary, opacity: parsing ? 0.7 : 1 }]}
            activeOpacity={0.85}
          >
            {parsing ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <>
                <Feather name="cpu" size={17} color={colors.primaryForeground} />
                <Text style={[styles.parseBtnText, { color: colors.primaryForeground, fontFamily: "Inter_700Bold" }]}>
                  Parse with AI
                </Text>
              </>
            )}
          </TouchableOpacity>

          {parsing && (
            <Text style={[styles.parsingNote, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Analysing your workout and matching exercises to the library...
            </Text>
          )}

          {/* Parsed result */}
          {parsed && (
            <View style={styles.resultSection}>
              <Text style={[styles.resultHeading, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                Parsed result
              </Text>

              {/* Template name */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                  TEMPLATE NAME
                </Text>
                <TextInput
                  value={templateName}
                  onChangeText={setTemplateName}
                  style={[
                    styles.nameInput,
                    { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" },
                  ]}
                />
              </View>

              {/* Stats row */}
              <View style={styles.statsRow}>
                {parsed.estimatedDurationMin ? (
                  <View style={[styles.statChip, { backgroundColor: colors.muted }]}>
                    <Feather name="clock" size={13} color={colors.mutedForeground} />
                    <Text style={[styles.statChipText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      {parsed.estimatedDurationMin} min
                    </Text>
                  </View>
                ) : null}
                {(() => { const cs = catStyle(parsed.category); return (
                  <View style={[styles.statChip, { backgroundColor: cs.bg }]}>
                    <Text style={[styles.statChipText, { color: cs.text, fontFamily: "Inter_600SemiBold" }]}>
                      {parsed.category.toUpperCase()}
                    </Text>
                  </View>
                ); })()}
                <View style={[styles.statChip, { backgroundColor: colors.muted }]}>
                  <Text style={[styles.statChipText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    {parsed.exercises.length} exercise{parsed.exercises.length !== 1 ? "s" : ""}
                  </Text>
                </View>
              </View>

              {needsAttentionCount > 0 && (
                <View style={[styles.warningBanner, { backgroundColor: "#FFF4E0", borderColor: "#F0C060" }]}>
                  <Feather name="alert-triangle" size={15} color="#C08020" />
                  <Text style={[styles.warningText, { color: "#8A5A10", fontFamily: "Inter_500Medium" }]}>
                    {needsAttentionCount} exercise{needsAttentionCount !== 1 ? "s" : ""} need your attention. Pick from the library or skip.
                  </Text>
                </View>
              )}

              {/* Exercise list */}
              {parsed.exercises.map((ex, i) => {
                const isResolved = resolutions.has(i);
                const isSkipped = skipped.has(i);
                const isMatched = ex.matchedExerciseId !== null && ex.confidence === "high";
                const showName = isResolved
                  ? resolutions.get(i)!.exerciseName
                  : isMatched
                  ? (ex.matchedExerciseName ?? ex.name)
                  : ex.name;

                return (
                  <View
                    key={i}
                    style={[
                      styles.exerciseCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: isSkipped
                          ? colors.border
                          : isMatched || isResolved
                          ? "#A8D8B8"
                          : "#F0C060",
                        opacity: isSkipped ? 0.5 : 1,
                      },
                    ]}
                  >
                    <View style={styles.exerciseTop}>
                      {/* Status icon */}
                      {isSkipped ? (
                        <Feather name="minus-circle" size={16} color={colors.mutedForeground} />
                      ) : isMatched || isResolved ? (
                        <Feather name="check-circle" size={16} color="#4A7D68" />
                      ) : (
                        <Feather name="alert-circle" size={16} color="#C08020" />
                      )}

                      <Text
                        style={[
                          styles.exerciseName,
                          {
                            color: isSkipped ? colors.mutedForeground : colors.foreground,
                            fontFamily: "Inter_600SemiBold",
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {showName}
                      </Text>

                      {/* Actions */}
                      <View style={styles.exerciseActions}>
                        {!isMatched && !isSkipped && (
                          <TouchableOpacity
                            onPress={() => openPicker(i)}
                            style={[styles.pickBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                          >
                            <Text style={[styles.pickBtnText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                              {isResolved ? "Change" : "Pick"}
                            </Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          onPress={() => toggleSkip(i)}
                          hitSlop={8}
                          style={styles.skipBtn}
                        >
                          <Text style={[styles.skipBtnText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                            {isSkipped ? "Restore" : "Skip"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Targets row */}
                    {!isSkipped && (
                      <View style={styles.targetsRow}>
                        {ex.prescribedSets != null && (
                          <Text style={[styles.targetChip, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                            {ex.prescribedSets} sets
                          </Text>
                        )}
                        {ex.prescribedReps != null && (
                          <Text style={[styles.targetChip, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                            {ex.prescribedReps} reps
                          </Text>
                        )}
                        {ex.prescribedWeightKg != null && (
                          <Text style={[styles.targetChip, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                            {ex.prescribedWeightKg} kg
                          </Text>
                        )}
                        {ex.restSec != null && (
                          <Text style={[styles.targetChip, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                            {ex.restSec}s rest
                          </Text>
                        )}
                        {ex.supersetGroupId != null && (
                          <Text style={[styles.targetChip, { color: "#C17B3F", fontFamily: "Inter_500Medium" }]}>
                            Superset
                          </Text>
                        )}
                      </View>
                    )}

                    {/* Low-confidence note */}
                    {!isMatched && !isResolved && !isSkipped && ex.confidence !== "high" && (
                      <Text style={[styles.unmatchedNote, { color: "#A06020", fontFamily: "Inter_400Regular" }]}>
                        "{ex.name}" not found in library — pick the closest match or skip.
                      </Text>
                    )}
                  </View>
                );
              })}

              {/* Save button */}
              <TouchableOpacity
                onPress={() => { void handleSave(); }}
                disabled={saving || needsAttentionCount > 0}
                style={[
                  styles.saveBtn,
                  {
                    backgroundColor: needsAttentionCount > 0 ? colors.muted : colors.primary,
                    opacity: saving ? 0.7 : 1,
                  },
                ]}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color={needsAttentionCount > 0 ? colors.mutedForeground : colors.primaryForeground} />
                ) : (
                  <Text
                    style={[
                      styles.saveBtnText,
                      {
                        color: needsAttentionCount > 0 ? colors.mutedForeground : colors.primaryForeground,
                        fontFamily: "Inter_700Bold",
                      },
                    ]}
                  >
                    {needsAttentionCount > 0
                      ? `Resolve ${needsAttentionCount} exercise${needsAttentionCount !== 1 ? "s" : ""} first`
                      : "Save as template"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Exercise search modal */}
      <Modal
        visible={showSearch}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSearch(false)}
      >
        <View style={styles.searchModalBg}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setShowSearch(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.searchSheet}>
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
                        onPress={() => pickResolution(item)}
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
                    <View style={styles.searchEmpty}>
                      <Text style={[styles.searchEmptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                        {searchQuery.trim() ? "No exercises found." : "Type to search the library."}
                      </Text>
                    </View>
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
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17 },
  content: { padding: 16, gap: 16 },

  tabRow: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabText: { fontSize: 14 },

  inputSection: { gap: 8 },
  imageSection: { gap: 12 },
  fieldLabel: { fontSize: 11, letterSpacing: 0.6 },
  textArea: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    minHeight: 180,
    lineHeight: 22,
  },
  imagePlaceholder: {
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderRadius: 16,
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  imagePlaceholderText: { fontSize: 14 },
  imageReadyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  imageReadyText: { fontSize: 14, flex: 1 },
  imageButtons: { flexDirection: "row", gap: 10 },
  imageBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  imageBtnText: { fontSize: 14 },

  parseBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
  },
  parseBtnText: { fontSize: 16 },
  parsingNote: { fontSize: 13, textAlign: "center", lineHeight: 20 },

  resultSection: { gap: 16 },
  resultHeading: { fontSize: 18 },
  fieldGroup: { gap: 6 },
  nameInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
  },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  statChipText: { fontSize: 12 },

  warningBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  warningText: { flex: 1, fontSize: 13, lineHeight: 19 },

  exerciseCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  exerciseTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  exerciseName: { flex: 1, fontSize: 14 },
  exerciseActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  pickBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  pickBtnText: { fontSize: 12 },
  skipBtn: { padding: 4 },
  skipBtnText: { fontSize: 12 },
  targetsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  targetChip: { fontSize: 12 },
  unmatchedNote: { fontSize: 12, lineHeight: 18 },

  saveBtn: { paddingVertical: 16, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  saveBtnText: { fontSize: 16 },

  searchModalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
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
  searchEmpty: { paddingVertical: 40, alignItems: "center" },
  searchEmptyText: { fontSize: 14 },
});
