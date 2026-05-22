import React, { useRef, useEffect, useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { consumeVoiceTrigger } from "@/lib/voiceTrigger";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Animated,
  TextInput,
  Alert,
  Modal,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useUpsertDailyLog, useCreateMood, useGetSettings } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useVapiDebrief, type DebriefExtraction } from "@/hooks/useVapiDebrief";
import { useVoiceContext, type VoiceContextData } from "@/hooks/useVoiceContext";
import { useValoAuth } from "@/contexts/AuthContext";

const STEPS_GOAL = 10_000;
const VALO_BLUE = "#3B82F6";
const USER_GREEN = "#22C55E";
const GOOD_GREEN = "#4CAF50";
const OK_AMBER = "#F59E0B";
const LOW_RED = "#EF4444";

function sleepColor(hours: number | null, avg: number | null): string {
  if (hours == null || avg == null) return OK_AMBER;
  if (hours >= avg - 0.25) return GOOD_GREEN;
  if (hours >= avg - 0.75) return OK_AMBER;
  return LOW_RED;
}

function buildPersonalizedPrompts(ctx: VoiceContextData): string[] {
  const prompts: string[] = [];

  if (
    ctx.hrv_today != null &&
    ctx.hrv_avg != null &&
    ctx.hrv_today < ctx.hrv_avg - 10
  ) {
    const delta = Math.round(ctx.hrv_avg - ctx.hrv_today);
    prompts.push(
      `Your HRV is ${delta} below your average — Valo will ask what may have affected your recovery`
    );
  }

  if (
    ctx.sleep_hours != null &&
    ctx.sleep_avg_30d != null &&
    ctx.sleep_hours < ctx.sleep_avg_30d - 0.75
  ) {
    prompts.push(
      "You slept less than usual — Valo will check how your energy has been holding up"
    );
  }

  if (
    ctx.top_goal &&
    ctx.top_goal_progress != null &&
    ctx.top_goal_progress < 25
  ) {
    prompts.push(
      `Progress toward "${ctx.top_goal}" — Valo will check what has moved recently`
    );
  }

  const pendingHabit =
    ctx.habits_pending_today && ctx.habits_pending_today !== "none"
      ? ctx.habits_pending_today.split(",")[0]?.trim()
      : null;
  if (pendingHabit && prompts.length < 3) {
    prompts.push(
      `"${pendingHabit}" hasn't been logged yet — Valo will check if you got to it`
    );
  }

  if (ctx.workout_logged === "no" && prompts.length < 3) {
    prompts.push("No workout logged today — Valo will ask about your movement");
  }

  if (ctx.meeting_count > 4 && prompts.length < 3) {
    prompts.push(
      `You had ${ctx.meeting_count} meetings today — Valo will check how you handled the load`
    );
  }

  const fallbacks = [
    "What moved the needle for you today?",
    "What felt hard, and what felt easy?",
    "What would you do differently tomorrow?",
  ];
  while (prompts.length < 3) {
    prompts.push(fallbacks[prompts.length] ?? fallbacks[0]!);
  }

  return prompts.slice(0, 3);
}

function DataTile({
  label,
  value,
  sub,
  dotColor,
}: {
  label: string;
  value: string;
  sub?: string;
  dotColor?: string;
}) {
  const colors = useColors();
  return (
    <View style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.tileLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
        {label}
      </Text>
      <View style={styles.tileValueRow}>
        {dotColor && <View style={[styles.tileDot, { backgroundColor: dotColor }]} />}
        <Text style={[styles.tileValue, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {value}
        </Text>
      </View>
      {sub ? (
        <Text style={[styles.tileSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

function DataTiles({ ctx }: { ctx: VoiceContextData }) {
  const sleepDot = sleepColor(ctx.sleep_hours, ctx.sleep_avg_30d);
  const sleepVal = ctx.sleep_hours != null ? `${ctx.sleep_hours}h` : "—";
  const sleepSub =
    ctx.sleep_avg_30d != null
      ? `avg ${ctx.sleep_avg_30d}h`
      : "no avg yet";

  const hrvDelta =
    ctx.hrv_today != null && ctx.hrv_avg != null
      ? Math.round(ctx.hrv_today - ctx.hrv_avg)
      : null;
  const hrvDeltaStr =
    hrvDelta != null
      ? `${hrvDelta >= 0 ? "↑" : "↓"}${Math.abs(hrvDelta)} vs avg`
      : ctx.hrv_avg != null
      ? `avg ${ctx.hrv_avg}`
      : undefined;

  const stepsVal =
    ctx.steps_today != null
      ? ctx.steps_today.toLocaleString()
      : "—";
  const stepsPct =
    ctx.steps_today != null
      ? Math.min(100, Math.round((ctx.steps_today / STEPS_GOAL) * 100))
      : null;
  const stepsSub =
    stepsPct != null ? `${stepsPct}% of ${(STEPS_GOAL / 1000).toFixed(0)}k goal` : undefined;

  const workoutVal =
    ctx.workout_type
      ? `${ctx.workout_type}${ctx.workout_duration ? `, ${ctx.workout_duration}min` : ""}`
      : "Not logged";

  const moodVal =
    ctx.mood_avg_today != null
      ? `${ctx.mood_avg_today}/10`
      : "—";
  const moodSub =
    ctx.mood_count_today > 0
      ? `${ctx.mood_count_today} check-in${ctx.mood_count_today > 1 ? "s" : ""}`
      : "No check-ins";

  return (
    <View style={styles.tilesGrid}>
      <DataTile
        label="SLEEP"
        value={sleepVal}
        sub={sleepSub}
        dotColor={sleepDot}
      />
      <DataTile
        label="HRV"
        value={ctx.hrv_today != null ? `${ctx.hrv_today}` : "—"}
        sub={hrvDeltaStr}
        dotColor={
          hrvDelta != null
            ? hrvDelta >= 5
              ? GOOD_GREEN
              : hrvDelta >= -5
              ? OK_AMBER
              : LOW_RED
            : undefined
        }
      />
      <DataTile
        label="RECOVERY"
        value={ctx.recovery_score != null ? `${ctx.recovery_score}%` : "—"}
      />
      <DataTile
        label="WORKOUT"
        value={workoutVal}
        sub={ctx.workout_duration ? undefined : ctx.workout_type ? undefined : undefined}
      />
      <DataTile label="MOOD" value={moodVal} sub={moodSub} />
      <DataTile label="STEPS" value={stepsVal} sub={stepsSub} />
    </View>
  );
}

function PromptCards({ ctx }: { ctx: VoiceContextData }) {
  const colors = useColors();
  const prompts = buildPersonalizedPrompts(ctx);
  return (
    <View style={{ gap: 8 }}>
      {prompts.map((p, i) => (
        <View
          key={i}
          style={[styles.promptCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={[styles.promptDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.promptText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
            {p}
          </Text>
        </View>
      ))}
    </View>
  );
}

type CheckInMode = "voice" | "guided" | "manual";

type GuidedCardDef =
  | { id: string; question: string; type: "choice"; options: string[]; category: string }
  | { id: string; question: string; type: "text"; category: string };

const GUIDED_CARDS: GuidedCardDef[] = [
  { id: "sleep",            question: "How did you sleep last night?",              type: "choice", options: ["Great", "Good", "Fair", "Poor"],               category: "Health" },
  { id: "energy",           question: "How's your energy today?",                   type: "choice", options: ["High", "Good", "Low", "Drained"],               category: "Health" },
  { id: "mood",             question: "How are you feeling overall?",               type: "choice", options: ["Great", "Good", "Okay", "Rough"],               category: "Health" },
  { id: "stress",           question: "How was your stress today?",                 type: "choice", options: ["Low", "Moderate", "High", "Very high"],         category: "Health" },
  { id: "water",            question: "How's your water intake?",                   type: "choice", options: ["On track", "Behind"],                           category: "Health" },
  { id: "workout",          question: "Did you work out today?",                    type: "choice", options: ["Yes", "No", "Rest day"],                        category: "Fitness" },
  { id: "steps",            question: "How many steps did you get today?",          type: "choice", options: ["10k+", "7–10k", "5–7k", "Under 5k"],            category: "Fitness" },
  { id: "nutrition",        question: "How did you eat today?",                     type: "choice", options: ["Clean", "Pretty good", "Could be better", "Off track"], category: "Nutrition" },
  { id: "productivity",     question: "How productive were you today?",             type: "choice", options: ["Very", "Somewhat", "Not really", "Not at all"], category: "Productivity" },
  { id: "connections",      question: "Did you have any meaningful conversations today?", type: "choice", options: ["Yes", "No"],                             category: "Relationships" },
  { id: "habits",           question: "Did you complete your habits?",              type: "choice", options: ["All of them", "Most of them", "A few", "None"], category: "Mindset" },
  { id: "gratitude",        question: "What are you grateful for today?",           type: "text",                                                              category: "Mindset" },
  { id: "win",              question: "What was one win today?",                    type: "text",                                                              category: "Mindset" },
  { id: "tomorrow",         question: "What's your intention for tomorrow?",        type: "text",                                                              category: "Mindset" },
  { id: "spiritual_habits", question: "Did you complete your spiritual habits?",    type: "choice", options: ["All of them", "Most of them", "A few", "None"], category: "Spirituality" },
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

// ─── Guided card config ──────────────────────────────────────────────────────

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

// ─── Customize modal ─────────────────────────────────────────────────────────

function CategoryTag({ category }: { category: string }) {
  const meta = CATEGORY_META[category];
  const color = meta?.color ?? "#999";
  return (
    <View style={[configStyles.catTag, { backgroundColor: color + "25" }]}>
      <Text style={[configStyles.catTagText, { color, fontFamily: "Inter_600SemiBold" }]}>
        {category}
      </Text>
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

  // localActive: ordered list of active card IDs
  const [localActive, setLocalActive] = useState<string[]>([]);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible) return;
    const hiddenSet = new Set(config.hidden);
    // order may contain only active IDs or all IDs — filter to just active
    const activeFromOrder = config.order.filter((id) => !hiddenSet.has(id));
    // guarantee always-show cards are present
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
    // collapse that category once added
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

  // build inactive-by-category map
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
            {
              backgroundColor: isActive ? colors.muted : colors.card,
              borderBottomColor: colors.border,
            },
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
            <Text
              style={[configStyles.rowQuestion, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
              numberOfLines={2}
            >
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
          { backgroundColor: colors.muted, borderTopColor: colors.border, borderBottomColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 20 },
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
              <Text style={[configStyles.folderName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                {cat}
              </Text>
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
                    <Text
                      style={[configStyles.rowQuestion, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                      numberOfLines={2}
                    >
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
            {/* Sheet handle */}
            <View style={configStyles.handleWrap}>
              <View style={[configStyles.handle, { backgroundColor: colors.border }]} />
            </View>

            {/* Header */}
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

function ModeToggle({ mode, onSelect }: { mode: CheckInMode; onSelect: (m: CheckInMode) => void }) {
  const colors = useColors();
  const MODES: { key: CheckInMode; label: string }[] = [
    { key: "voice", label: "Voice" },
    { key: "guided", label: "Guided" },
    { key: "manual", label: "Manual" },
  ];
  return (
    <View style={[styles.modeToggle, { backgroundColor: colors.muted }]}>
      {MODES.map(({ key, label }) => {
        const active = mode === key;
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onSelect(key)}
            style={[styles.modePill, active && { backgroundColor: colors.primary }]}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.modePillText,
                {
                  color: active ? colors.primaryForeground : colors.mutedForeground,
                  fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular",
                },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

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
            <View
              key={card.id}
              style={[styles.guidedCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Text style={[styles.guidedQuestion, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                {card.question}
              </Text>
              <View style={styles.guidedOptions}>
                {card.options.map((opt) => {
                  const selected = answers[card.id] === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        onAnswer(card.id, opt);
                      }}
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
          <View
            key={card.id}
            style={[styles.guidedCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
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
        <View style={[styles.saveBtn, { backgroundColor: "#22C55E" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="check-circle" size={20} color="#fff" />
            <Text style={[styles.saveBtnText, { color: "#fff", fontFamily: "Inter_600SemiBold" }]}>
              Check-in saved!
            </Text>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={[
            styles.saveBtn,
            { backgroundColor: canSave ? colors.primary : colors.muted },
          ]}
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

export default function VoiceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId, getToken } = useValoAuth();
  const safeUserId = userId ?? "";

  const { data: ctx, isLoading: ctxLoading } = useVoiceContext(safeUserId);

  const { callState, transcript, startCall, endCall, isMuted, toggleMute, isValoSpeaking, debriefExtraction, clearExtraction } =
    useVapiDebrief(safeUserId, getToken as () => Promise<string | null>, ctx?.first_call_completed ?? true);

  const scrollRef = useRef<ScrollView>(null);
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.5)).current;
  const processingDots = useRef(new Animated.Value(0)).current;

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const tabBarH = Platform.OS === "web" ? 84 : 83;

  const [mode, setMode] = useState<CheckInMode>("voice");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [guidedConfig, setGuidedConfig] = useState<StoredGuidedConfig | null>(null);

  const [currentSpeaker, setCurrentSpeaker] = useState<"assistant" | "user" | null>(null);
  const [currentText, setCurrentText] = useState("");
  const liveCardOpacity = useRef(new Animated.Value(1)).current;

  const upsertLog = useUpsertDailyLog();
  const createMood = useCreateMood();
  const { data: settings } = useGetSettings();

  const GUIDED_CONFIG_KEY = `@valo/guided-config-${safeUserId}`;

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
    setIsSaving(true);
    try {
      const moodScore = answers.mood ? MOOD_SCORE[answers.mood] : undefined;
      const sleepHours = answers.sleep ? SLEEP_HOURS[answers.sleep] : undefined;
      const workoutTypeVal = answers.workout !== undefined ? WORKOUT_TYPE[answers.workout] : undefined;
      const stressEffort = answers.stress ? STRESS_EFFORT[answers.stress] : undefined;

      await Promise.all([
        moodScore !== undefined
          ? createMood.mutateAsync({
              data: { score: moodScore, note: answers.win?.trim() || null },
            })
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
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setAnswers({});
      }, 2000);
    } catch {
      Alert.alert("Could not save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [answers, upsertLog, createMood]);

  const isActive = callState === "active";
  const isLoading = callState === "loading";
  const isEnding = callState === "ending";
  const isIdle = callState === "idle";
  const showSummary = isIdle && debriefExtraction != null;

  useEffect(() => {
    if (isActive || isLoading) {
      const loop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseScale, {
              toValue: 1.25,
              duration: 900,
              useNativeDriver: true,
            }),
            Animated.timing(pulseScale, {
              toValue: 1,
              duration: 900,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(pulseOpacity, {
              toValue: 0.9,
              duration: 900,
              useNativeDriver: true,
            }),
            Animated.timing(pulseOpacity, {
              toValue: 0.2,
              duration: 900,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      loop.start();
      return () => {
        loop.stop();
        pulseScale.setValue(1);
        pulseOpacity.setValue(0.5);
      };
    }
  }, [isActive, isLoading]);

  useEffect(() => {
    if (isEnding) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(processingDots, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(processingDots, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [isEnding]);

  useEffect(() => {
    if (!isActive) {
      setCurrentSpeaker(null);
      setCurrentText("");
      liveCardOpacity.setValue(1);
      return;
    }
    if (transcript.length === 0) return;
    const last = transcript[transcript.length - 1];
    if (!last) return;
    const role = last.role as "assistant" | "user";
    if (currentSpeaker === null) {
      setCurrentSpeaker(role);
      setCurrentText(last.text);
    } else if (role === currentSpeaker) {
      setCurrentText(last.text);
    } else {
      Animated.timing(liveCardOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setCurrentSpeaker(role);
        setCurrentText(last.text);
        Animated.timing(liveCardOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
    }
  }, [isActive, transcript.length, transcript[transcript.length - 1]?.text]);

  useFocusEffect(
    useCallback(() => {
      if (consumeVoiceTrigger()) {
        startCall();
      }
    }, [startCall])
  );

  const handleMicPress = useCallback(() => {
    if (isLoading || isEnding) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (isActive) {
      endCall();
    } else {
      startCall();
    }
  }, [isActive, isLoading, isEnding, startCall, endCall]);

  const handleMicLongPress = useCallback(() => {
    if (isLoading || isEnding || isActive) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    startCall();
  }, [isLoading, isEnding, isActive, startCall]);

  const ringColor = isActive
    ? isValoSpeaking
      ? VALO_BLUE
      : USER_GREEN
    : colors.primary;

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: topPad + 16,
        paddingBottom: bottomPad + tabBarH + 24,
        paddingHorizontal: 20,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Text style={[styles.header, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        Check in
      </Text>

      <ModeToggle mode={mode} onSelect={setMode} />

      {mode === "voice" && (
      <>
      {/* ── MIC BUTTON (idle + active + loading) ────────────────────────── */}
      {!isEnding && !showSummary && (
        <View style={styles.micSection}>
          <View style={styles.micWrapper}>
            {(isActive || isLoading) && (
              <Animated.View
                style={[
                  styles.pulseRing,
                  {
                    borderColor: ringColor,
                    transform: [{ scale: pulseScale }],
                    opacity: pulseOpacity,
                  },
                ]}
              />
            )}
            <TouchableOpacity
              onPress={handleMicPress}
              disabled={isLoading || isEnding}
              activeOpacity={0.8}
              style={[
                styles.micButton,
                {
                  backgroundColor: isActive
                    ? colors.primary
                    : colors.card,
                  borderColor: isActive ? colors.primary : colors.border,
                },
              ]}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.primary} size="large" />
              ) : (
                <Feather
                  name={isActive ? "square" : "mic"}
                  size={34}
                  color={isActive ? colors.primaryForeground : colors.foreground}
                />
              )}
            </TouchableOpacity>
          </View>

          {!isActive && !isLoading && (
            <Text style={[styles.micHint, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Tap to begin your evening debrief
            </Text>
          )}

        </View>
      )}

      {/* ── ENDING STATE: processing ────────────────────────────────────── */}
      {isEnding && (
        <View style={styles.processingContainer}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.processingTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Processing your debrief…
          </Text>
          <Text style={[styles.processingSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Valo is extracting your insights
          </Text>
        </View>
      )}

      {/* ── SUMMARY CARD ────────────────────────────────────────────────── */}
      {showSummary && debriefExtraction != null && (
        <View style={{ gap: 12 }}>
          <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.summaryTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              Debrief complete
            </Text>

            {/* Metadata row: mood score, energy, primary emotion */}
            <View style={styles.summaryMeta}>
              {debriefExtraction.mood_score != null && (
                <View style={[styles.summaryChip, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.summaryChipText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                    Mood {debriefExtraction.mood_score}/10
                  </Text>
                </View>
              )}
              {debriefExtraction.energy_level != null && (
                <View style={[styles.summaryChip, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.summaryChipText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                    {debriefExtraction.energy_level} energy
                  </Text>
                </View>
              )}
              {debriefExtraction.primary_emotion != null && (
                <View style={[styles.summaryChip, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.summaryChipText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                    {debriefExtraction.primary_emotion}
                  </Text>
                </View>
              )}
            </View>

            {/* Valo's observation */}
            {debriefExtraction.valo_observation != null && (
              <View style={{ gap: 6 }}>
                <Text style={[styles.summarySubheading, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                  VALO'S OBSERVATION
                </Text>
                <Text style={[styles.summaryObservation, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                  {debriefExtraction.valo_observation}
                </Text>
              </View>
            )}

            {/* Win / struggle / intention */}
            {(debriefExtraction.one_win != null || debriefExtraction.one_struggle != null || debriefExtraction.tomorrow_intention != null) && (
              <View style={{ gap: 8, marginTop: 4 }}>
                <Text style={[styles.summarySubheading, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                  KEY POINTS
                </Text>
                {debriefExtraction.one_win != null && (
                  <View style={styles.summaryPoint}>
                    <View style={[styles.summaryDot, { backgroundColor: GOOD_GREEN }]} />
                    <Text style={[styles.summaryPointText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                      {debriefExtraction.one_win}
                    </Text>
                  </View>
                )}
                {debriefExtraction.one_struggle != null && (
                  <View style={styles.summaryPoint}>
                    <View style={[styles.summaryDot, { backgroundColor: OK_AMBER }]} />
                    <Text style={[styles.summaryPointText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                      {debriefExtraction.one_struggle}
                    </Text>
                  </View>
                )}
                {debriefExtraction.tomorrow_intention != null && (
                  <View style={styles.summaryPoint}>
                    <View style={[styles.summaryDot, { backgroundColor: colors.primary }]} />
                    <Text style={[styles.summaryPointText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                      Tomorrow: {debriefExtraction.tomorrow_intention}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Flags */}
            {debriefExtraction.flags.length > 0 && (
              <View style={{ gap: 6, marginTop: 4 }}>
                <Text style={[styles.summarySubheading, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                  VALO NOTED
                </Text>
                <View style={styles.summaryMeta}>
                  {debriefExtraction.flags.map((flag, i) => (
                    <View key={i} style={[styles.summaryChip, { backgroundColor: colors.muted }]}>
                      <Text style={[styles.summaryChipText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                        {flag}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[styles.newDebriefBtn, { borderColor: colors.border }]}
            onPress={() => { clearExtraction(); }}
          >
            <Text style={[styles.newDebriefText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              Start a new debrief
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── PRE-CALL: data tiles + prompts ──────────────────────────────── */}
      {(isIdle && !showSummary) && (
        <>
          {ctxLoading ? (
            <View style={styles.ctxLoading}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={[styles.ctxLoadingText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Loading your data…
              </Text>
            </View>
          ) : ctx ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                WHAT VALO SEES TODAY
              </Text>
              <DataTiles ctx={ctx} />

              <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 20 }]}>
                VALO WILL ASK ABOUT
              </Text>
              <PromptCards ctx={ctx} />
            </>
          ) : null}
        </>
      )}

      {/* ── LOADING: connecting ─────────────────────────────────────────── */}
      {isLoading && (
        <View style={styles.processingContainer}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.processingTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Connecting to Valo…
          </Text>
        </View>
      )}

      {/* ── ACTIVE CALL: speaker status ─────────────────────────────────── */}
      {isActive && (
        <View style={styles.speakerStatus}>
          <View style={[styles.speakerDot, { backgroundColor: isValoSpeaking ? VALO_BLUE : USER_GREEN }]} />
          <Text style={[styles.speakerLabel, { color: isValoSpeaking ? VALO_BLUE : USER_GREEN, fontFamily: "Inter_600SemiBold" }]}>
            {isValoSpeaking ? "Valo is speaking" : "Listening to you"}
          </Text>
        </View>
      )}

      {/* ── ACTIVE CALL: live single-message display ─────────────────────── */}
      {isActive && currentSpeaker !== null && currentText.length > 0 && (
        <Animated.View
          style={[
            styles.liveCard,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: liveCardOpacity },
          ]}
        >
          <Text
            style={[
              styles.liveCardLabel,
              {
                color: currentSpeaker === "assistant" ? VALO_BLUE : USER_GREEN,
                fontFamily: "Inter_600SemiBold",
              },
            ]}
          >
            {currentSpeaker === "assistant" ? "Valo" : "You"}
          </Text>
          <Text
            style={[styles.liveCardText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
            numberOfLines={5}
            ellipsizeMode="tail"
          >
            {currentText}
          </Text>
        </Animated.View>
      )}

      {/* ── ACTIVE CALL: mute + end controls ────────────────────────────── */}
      {isActive && (
        <View style={styles.callControls}>
          <TouchableOpacity
            style={[
              styles.controlBtn,
              {
                backgroundColor: isMuted ? colors.muted : colors.card,
                borderColor: colors.border,
              },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              toggleMute();
            }}
          >
            <Feather
              name={isMuted ? "mic-off" : "mic"}
              size={18}
              color={isMuted ? colors.mutedForeground : colors.foreground}
            />
            <Text style={[styles.controlBtnText, { color: isMuted ? colors.mutedForeground : colors.foreground, fontFamily: "Inter_500Medium" }]}>
              {isMuted ? "Unmute" : "Mute"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlBtn, styles.endBtn]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              endCall();
            }}
          >
            <Feather name="phone-off" size={18} color="#fff" />
            <Text style={[styles.controlBtnText, { color: "#fff", fontFamily: "Inter_500Medium" }]}>
              End call
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── POST-CALL TRANSCRIPT ─────────────────────────────────────────── */}
      {isIdle && transcript.length > 0 && !showSummary && (
        <View style={{ gap: 8 }}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            TRANSCRIPT
          </Text>
          {transcript.map((entry, i) => (
            <View key={i} style={styles.transcriptRow}>
              <Text
                style={[
                  styles.transcriptSpeaker,
                  {
                    color: entry.role === "assistant" ? VALO_BLUE : colors.primary,
                    fontFamily: "Inter_600SemiBold",
                  },
                ]}
              >
                {entry.role === "assistant" ? "Valo" : "You"}
              </Text>
              <View
                style={[
                  styles.transcriptBubble,
                  {
                    backgroundColor: entry.role === "assistant" ? colors.card : colors.secondary,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[styles.transcriptText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                >
                  {entry.text}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
      </>
      )}

      {mode === "guided" && (
        <>
          <View style={styles.guidedHeader}>
            <Text style={[styles.guidedHeaderLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              {activeCards.length} questions
            </Text>
            <TouchableOpacity
              onPress={() => setShowConfigModal(true)}
              style={[styles.customizeBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
              activeOpacity={0.75}
            >
              <Feather name="sliders" size={13} color={colors.primary} />
              <Text style={[styles.customizeBtnText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
                Customize
              </Text>
            </TouchableOpacity>
          </View>

          <GuidedCheckin
            cards={activeCards}
            answers={answers}
            onAnswer={(id, val) => setAnswers((prev) => ({ ...prev, [id]: val }))}
            isSaving={isSaving}
            saved={saved}
            onSave={handleGuidedSave}
          />

          {guidedConfig && (
            <GuidedConfigModal
              visible={showConfigModal}
              config={guidedConfig}
              onChange={saveGuidedConfig}
              onClose={() => setShowConfigModal(false)}
            />
          )}
        </>
      )}

      {mode === "manual" && (
        <View style={styles.manualPlaceholder}>
          <Text style={[styles.manualText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Manual logging coming soon.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 28, marginBottom: 20 },

  sectionTitle: {
    fontSize: 11,
    letterSpacing: 0.9,
    marginBottom: 10,
  },

  // Data tiles
  tilesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 4,
  },
  tile: {
    flex: 1,
    minWidth: "45%",
    maxWidth: "49%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  tileLabel: { fontSize: 10, letterSpacing: 0.7 },
  tileValueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tileDot: { width: 8, height: 8, borderRadius: 4 },
  tileValue: { fontSize: 20 },
  tileSub: { fontSize: 12 },

  // Prompts
  promptCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  promptDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  promptText: { flex: 1, fontSize: 14, lineHeight: 20 },

  // Processing / loading states
  processingContainer: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  processingTitle: { fontSize: 18 },
  processingSub: { fontSize: 14 },

  // Context loading
  ctxLoading: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 16 },
  ctxLoadingText: { fontSize: 14 },

  // Speaker status
  speakerStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  speakerDot: { width: 8, height: 8, borderRadius: 4 },
  speakerLabel: { fontSize: 13 },

  // Mic
  micSection: { alignItems: "center", gap: 16, marginVertical: 24 },
  micWrapper: {
    width: 140,
    height: 140,
    justifyContent: "center",
    alignItems: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
  },
  micButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  micHint: { fontSize: 14, textAlign: "center" },

  // Call controls
  callControls: { flexDirection: "row", gap: 12 },
  controlBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
  },
  endBtn: { backgroundColor: "#EF4444", borderColor: "#EF4444" },
  controlBtnText: { fontSize: 14 },

  // Live single-message card (during active call)
  liveCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 6,
    marginVertical: 8,
    alignItems: "center",
  },
  liveCardLabel: {
    fontSize: 11,
    letterSpacing: 0.8,
    alignSelf: "center",
  },
  liveCardText: {
    fontSize: 17,
    lineHeight: 26,
    textAlign: "center",
  },

  // Transcript
  transcriptRow: { gap: 4 },
  transcriptSpeaker: { fontSize: 11, letterSpacing: 0.5, paddingLeft: 4 },
  transcriptBubble: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  transcriptText: { fontSize: 14, lineHeight: 21 },

  // Summary
  summaryMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 4 },
  summaryChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  summaryChipText: { fontSize: 12 },
  summaryObservation: { fontSize: 15, lineHeight: 22 },
  summaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  summaryTitle: { fontSize: 20 },
  summarySubheading: { fontSize: 11, letterSpacing: 0.8 },
  summaryPoint: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  summaryDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  summaryPointText: { flex: 1, fontSize: 15, lineHeight: 22 },
  newDebriefBtn: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
  },
  newDebriefText: { fontSize: 14 },

  // Mode toggle
  modeToggle: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
    gap: 2,
  },
  modePill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: "center",
  },
  modePillText: { fontSize: 14 },

  // Guided header + customize button
  guidedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  guidedHeaderLabel: { fontSize: 13 },
  customizeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  customizeBtnText: { fontSize: 13 },

  // Guided check-in cards
  guidedCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  guidedQuestion: { fontSize: 15, lineHeight: 21 },
  guidedOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  guidedOption: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  guidedOptionText: { fontSize: 14 },
  guidedTextInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 72,
    textAlignVertical: "top",
  },

  // Save button
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  saveBtnText: { fontSize: 16 },

  // Manual placeholder
  manualPlaceholder: {
    paddingVertical: 60,
    alignItems: "center",
  },
  manualText: { fontSize: 15 },
});
