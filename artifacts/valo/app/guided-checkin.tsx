import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  useUpsertDailyLog,
  useCreateMood,
  useGetSettings,
} from "@workspace/api-client-react";
import { trackEvent } from "@/services/telemetry";
import { useColors } from "@/hooks/useColors";
import { useValoAuth } from "@/contexts/AuthContext";

const USER_GREEN = "#22C55E";

type Colors = ReturnType<typeof useColors>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function GuidedCheckinScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId } = useValoAuth();
  const safeUserId = userId ?? "";

  const { data: settings } = useGetSettings();
  const upsertLog = useUpsertDailyLog();
  const createMood = useCreateMood();

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [guidedConfig, setGuidedConfig] = useState<StoredGuidedConfig | null>(null);

  const GUIDED_CONFIG_KEY = `@valo/guided-config-${safeUserId}`;

  const topPad = (Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top) + 12;

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

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.headerBtn}>
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Guided check-in
        </Text>
        <TouchableOpacity
          onPress={() => setShowConfigModal(true)}
          activeOpacity={0.7}
          style={[styles.headerBtn, { alignItems: "flex-end" }]}
        >
          <Text style={[styles.customizeText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
            Customize
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: Math.max(insets.bottom, 16) + 32,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <GuidedCheckin
          cards={activeCards}
          answers={answers}
          onAnswer={(id, val) => setAnswers((prev) => ({ ...prev, [id]: val }))}
          isSaving={isSaving}
          saved={saved}
          onSave={handleGuidedSave}
        />
      </ScrollView>

      {guidedConfig && (
        <GuidedConfigModal
          visible={showConfigModal}
          config={guidedConfig}
          onChange={saveGuidedConfig}
          onClose={() => setShowConfigModal(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    minWidth: 72,
    height: 32,
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
  },
  customizeText: { fontSize: 14 },

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
