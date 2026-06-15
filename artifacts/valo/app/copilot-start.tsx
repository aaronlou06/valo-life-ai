import React, { useEffect, useState } from "react";
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
import * as Haptics from "expo-haptics";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useWorkoutCopilot } from "@/contexts/WorkoutCopilotContext";

type WorkoutTemplate = {
  id: number;
  name: string;
  category: string;
  estimatedDurationMin: number | null;
  notes: string | null;
};

type WorkoutSession = {
  id: number;
  name: string;
  status: string;
  startedAt: string;
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  strength:  { bg: "#F5DDD8", text: "#A06050" },
  cardio:    { bg: "#D8EBE3", text: "#4A7D68" },
  hiit:      { bg: "#E8E4F8", text: "#6A5A9A" },
  mobility:  { bg: "#EDE5D8", text: "#8A6D3A" },
  sport:     { bg: "#D8EBF5", text: "#4A6D8A" },
};

function categoryStyle(cat: string) {
  return CATEGORY_COLORS[cat.toLowerCase()] ?? { bg: "#F0ECE6", text: "#8A7D70" };
}

function formatDuration(min: number | null): string {
  if (!min) return "";
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min} min`;
}

export default function CopilotStartScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeSession, startSession, endSession } = useWorkoutCopilot();

  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [creating, setCreating] = useState(false);
  const [freestyleName, setFreestyleName] = useState("Freestyle Workout");
  const [showFreestyleModal, setShowFreestyleModal] = useState(false);
  const [duplicating, setDuplicating] = useState<number | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoadingTemplates(true);
    try {
      const data = await customFetch<WorkoutTemplate[]>("/api/workout/templates");
      setTemplates(data);
    } catch {
      // silently show empty state
    } finally {
      setLoadingTemplates(false);
    }
  }

  async function startFromTemplate(template: WorkoutTemplate) {
    if (creating) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setCreating(true);
    try {
      const session = await customFetch<WorkoutSession>("/api/workout/sessions", {
        method: "POST",
        body: JSON.stringify({ name: template.name, templateId: template.id }),
      });
      startSession({
        name: template.name,
        source: "template",
        sessionId: session.id,
        templateId: template.id,
      });
      router.push({
        pathname: "/copilot-workout" as never,
        params: { sessionId: String(session.id), templateId: String(template.id) },
      });
    } catch {
      Alert.alert("Could not start workout", "Please check your connection and try again.");
    } finally {
      setCreating(false);
    }
  }

  async function startFreestyle() {
    const name = freestyleName.trim() || "Freestyle Workout";
    if (creating) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setCreating(true);
    setShowFreestyleModal(false);
    try {
      const session = await customFetch<WorkoutSession>("/api/workout/sessions", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      startSession({ name, source: "start", sessionId: session.id, templateId: null });
      router.push({
        pathname: "/copilot-workout" as never,
        params: { sessionId: String(session.id) },
      });
    } catch {
      Alert.alert("Could not start workout", "Please check your connection and try again.");
    } finally {
      setCreating(false);
    }
  }

  function handleResume() {
    if (!activeSession?.sessionId) return;
    router.push({
      pathname: "/copilot-workout" as never,
      params: {
        sessionId: String(activeSession.sessionId),
        templateId: activeSession.templateId ? String(activeSession.templateId) : undefined,
      },
    });
  }

  function handleEndSession() {
    Alert.alert(
      "End workout?",
      "This will abandon the current session without saving a summary.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End",
          style: "destructive",
          onPress: () => {
            endSession();
          },
        },
      ],
    );
  }

  function handleTemplateMenu(t: WorkoutTemplate) {
    Alert.alert(t.name, "What would you like to do?", [
      {
        text: "Edit",
        onPress: () =>
          router.push({
            pathname: "/copilot-edit" as never,
            params: {
              id: String(t.id),
              name: t.name,
              category: t.category,
              duration: t.estimatedDurationMin ? String(t.estimatedDurationMin) : "",
              notes: t.notes ?? "",
            },
          }),
      },
      {
        text: "Duplicate",
        onPress: () => handleDuplicateTemplate(t),
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => handleDeleteTemplate(t),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function handleDuplicateTemplate(t: WorkoutTemplate) {
    setDuplicating(t.id);
    try {
      await customFetch(`/api/workout/templates/${t.id}/duplicate`, { method: "POST" });
      await loadTemplates();
    } catch {
      Alert.alert("Failed", "Could not duplicate the template.");
    } finally {
      setDuplicating(null);
    }
  }

  function handleDeleteTemplate(t: WorkoutTemplate) {
    Alert.alert("Delete template", `Delete "${t.name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await customFetch(`/api/workout/templates/${t.id}`, { method: "DELETE" });
            setTemplates((prev) => prev.filter((tpl) => tpl.id !== t.id));
          } catch {
            Alert.alert("Failed", "Could not delete the template.");
          }
        },
      },
    ]);
  }

  const bg = colors.background;

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
        >
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Start a workout
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Active session resume card */}
        {activeSession && (
          <View style={[styles.resumeCard, { backgroundColor: "#F5DDD8", borderColor: "#E8C8B8" }]}>
            <View style={styles.resumeTop}>
              <View style={[styles.resumeIcon, { backgroundColor: "#EAC4A8" }]}>
                <Feather name="activity" size={18} color="#A06050" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.resumeName, { color: "#7A4030", fontFamily: "Inter_600SemiBold" }]}>
                  {activeSession.name}
                </Text>
                <Text style={[styles.resumeSub, { color: "#A06050", fontFamily: "Inter_400Regular" }]}>
                  Session in progress
                </Text>
              </View>
            </View>
            <View style={styles.resumeActions}>
              <TouchableOpacity
                onPress={handleResume}
                style={[styles.resumeBtn, { backgroundColor: "#A06050" }]}
                activeOpacity={0.85}
              >
                <Text style={[styles.resumeBtnText, { color: "#FFFFFF", fontFamily: "Inter_600SemiBold" }]}>
                  Resume
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleEndSession}
                style={[styles.resumeBtn, { backgroundColor: "#EAC4A8" }]}
                activeOpacity={0.85}
              >
                <Text style={[styles.resumeBtnText, { color: "#7A4030", fontFamily: "Inter_600SemiBold" }]}>
                  End
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Freestyle option */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
            Quick start
          </Text>
          <TouchableOpacity
            onPress={() => setShowFreestyleModal(true)}
            disabled={creating}
            activeOpacity={0.8}
            style={[styles.freestyleCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={[styles.freestyleIcon, { backgroundColor: colors.secondary }]}>
              <Feather name="zap" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.freestyleTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                Freestyle workout
              </Text>
              <Text style={[styles.freestyleSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Build it as you go — add exercises on the fly
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Templates */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
            Your templates
          </Text>

          <View style={styles.templateActionsRow}>
            <TouchableOpacity
              onPress={() => router.push("/copilot-create" as never)}
              style={[styles.actionBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              activeOpacity={0.8}
            >
              <Feather name="plus" size={15} color={colors.primary} />
              <Text style={[styles.actionBtnText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                New
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/copilot-import" as never)}
              style={[styles.actionBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
              activeOpacity={0.8}
            >
              <Feather name="upload" size={15} color={colors.foreground} />
              <Text style={[styles.actionBtnText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                Import
              </Text>
            </TouchableOpacity>
          </View>

          {loadingTemplates ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : templates.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                No templates yet. Tap New to create one, or Import to parse a workout with AI.
              </Text>
            </View>
          ) : (
            templates.map((t) => {
              const cs = categoryStyle(t.category);
              return (
                <View
                  key={t.id}
                  style={[styles.templateCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <TouchableOpacity
                    onPress={() => startFromTemplate(t)}
                    disabled={creating}
                    activeOpacity={0.8}
                    style={styles.templateCardInner}
                  >
                    <View style={[styles.categoryBadge, { backgroundColor: cs.bg }]}>
                      <Text style={[styles.categoryText, { color: cs.text, fontFamily: "Inter_600SemiBold" }]}>
                        {t.category.toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.templateName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                        {t.name}
                      </Text>
                      {t.estimatedDurationMin ? (
                        <Text style={[styles.templateMeta, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                          {formatDuration(t.estimatedDurationMin)}
                        </Text>
                      ) : null}
                    </View>
                    {creating ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <View style={[styles.startPill, { backgroundColor: colors.primary }]}>
                        <Text style={[styles.startPillText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                          Start
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleTemplateMenu(t)}
                    disabled={creating}
                    style={[styles.templateMenuBtn, { borderLeftColor: colors.border }]}
                    hitSlop={8}
                  >
                    {duplicating === t.id ? (
                      <ActivityIndicator size="small" color={colors.mutedForeground} />
                    ) : (
                      <Feather name="more-vertical" size={18} color={colors.mutedForeground} />
                    )}
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>

      {/* Freestyle name modal */}
      <Modal
        visible={showFreestyleModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFreestyleModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBg}
        >
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setShowFreestyleModal(false)} />
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              Name your workout
            </Text>
            <TextInput
              value={freestyleName}
              onChangeText={setFreestyleName}
              style={[
                styles.modalInput,
                { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.input, fontFamily: "Inter_400Regular" },
              ]}
              placeholder="e.g. Upper Body, Pull Day..."
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="done"
              onSubmitEditing={startFreestyle}
              autoFocus
            />
            <TouchableOpacity
              onPress={startFreestyle}
              style={[styles.modalBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
            >
              <Text style={[styles.modalBtnText, { color: colors.primaryForeground, fontFamily: "Inter_700Bold" }]}>
                Start workout
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowFreestyleModal(false)} style={styles.modalCancel}>
              <Text style={[styles.modalCancelText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
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
  content: { paddingHorizontal: 16, paddingTop: 20, gap: 24 },
  section: { gap: 12 },
  sectionLabel: { fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 2 },

  resumeCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 14,
  },
  resumeTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  resumeIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  resumeName: { fontSize: 15 },
  resumeSub: { fontSize: 13, marginTop: 2 },
  resumeActions: { flexDirection: "row", gap: 10 },
  resumeBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  resumeBtnText: { fontSize: 14 },

  freestyleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  freestyleIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  freestyleTitle: { fontSize: 15 },
  freestyleSub: { fontSize: 13, marginTop: 2 },

  templateCard: {
    flexDirection: "row",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  templateCardInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
  },
  templateMenuBtn: {
    width: 48,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  templateActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionBtnText: { fontSize: 14 },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    minWidth: 72,
    alignItems: "center",
  },
  categoryText: { fontSize: 10, letterSpacing: 0.5 },
  templateName: { fontSize: 15 },
  templateMeta: { fontSize: 13, marginTop: 2 },
  startPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  startPillText: { fontSize: 13 },

  loadingWrap: { alignItems: "center", paddingVertical: 32 },
  emptyCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  emptyText: { fontSize: 14, lineHeight: 20, textAlign: "center" },

  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  modalCard: { borderRadius: 20, padding: 24, gap: 16 },
  modalTitle: { fontSize: 18 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  modalBtn: { paddingVertical: 16, borderRadius: 14, alignItems: "center" },
  modalBtnText: { fontSize: 16 },
  modalCancel: { alignItems: "center", paddingVertical: 8 },
  modalCancelText: { fontSize: 14 },
});
