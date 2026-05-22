import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
  Platform,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/useColors";
import { useValoAuth } from "@/contexts/AuthContext";
import { useHealthKitSync } from "@/hooks/useHealthKitSync";
import { requestHealthKitPermissions } from "@/lib/healthKit";
import { useListGoals, useListHabits } from "@workspace/api-client-react";

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

function formatTime(hhmm: string): string {
  const parts = hhmm.split(":");
  const h = parseInt(parts[0] ?? "20", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function getInitials(name: string | null, email: string | null): string {
  const src = name?.trim() ?? email?.trim() ?? "";
  if (!src) return "?";
  const parts = src.split(/\s+/);
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CORE_VALUES = [
  "Faith", "Family", "Health", "Excellence", "Growth",
  "Service", "Integrity", "Freedom", "Creativity", "Leadership",
];

const TREND_DOMAINS = [
  { key: "physical", label: "Physical", icon: "activity" },
  { key: "mental", label: "Mental", icon: "sun" },
  { key: "career", label: "Career", icon: "briefcase" },
  { key: "relationships", label: "Relationships", icon: "users" },
  { key: "habits", label: "Habits", icon: "check-circle" },
] as const;

const INTEGRATIONS = [
  { key: "apple-health", label: "Apple Health", icon: "heart" },
  { key: "apple-calendar", label: "Apple Calendar", icon: "calendar" },
  { key: "garmin", label: "Garmin", icon: "activity" },
  { key: "whoop", label: "Whoop", icon: "zap" },
  { key: "oura", label: "Oura", icon: "moon" },
  { key: "spotify", label: "Spotify", icon: "music" },
  { key: "superpower", label: "Superpower", icon: "star" },
  { key: "screen-time", label: "Screen Time", icon: "smartphone" },
] as const;

// ─── Scroll picker constants (mirrors goals_insights.tsx) ─────────────────────

const PICKER_ITEM_H = 44;
const PICKER_VISIBLE = 5;
const PICKER_HOURS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const PICKER_MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
const PICKER_AMPM = ["AM", "PM"];

// ─── Notification prefs ───────────────────────────────────────────────────────

const NOTIF_PREFS_KEY = "@valo/notification-prefs";

interface NotificationPrefs {
  dailyReminder: boolean;
  goalDeadlines: boolean;
  habitReminders: boolean;
  weeklyInsights: boolean;
  morningBriefing: boolean;
}

const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
  dailyReminder: true,
  goalDeadlines: true,
  habitReminders: false,
  weeklyInsights: true,
  morningBriefing: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  const colors = useColors();
  return (
    <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
      {label}
    </Text>
  );
}

function SavedBadge({ visible }: { visible: boolean }) {
  const colors = useColors();
  if (!visible) return null;
  return (
    <Text style={[styles.savedBadge, { color: colors.primary, fontFamily: "Inter_400Regular" }]}>
      Saved
    </Text>
  );
}

function ChevronRow({
  icon,
  label,
  value,
  onPress,
  destructive,
  accentColor,
  last,
}: {
  icon: string;
  label: string;
  value?: string;
  onPress: () => void;
  destructive?: boolean;
  accentColor?: string;
  last?: boolean;
}) {
  const colors = useColors();
  const rowColor = accentColor ?? (destructive ? colors.destructive : undefined);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.chevronRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      <View style={styles.chevronLeft}>
        <Feather
          name={icon as any}
          size={17}
          color={rowColor ?? colors.mutedForeground}
        />
        <Text
          style={[
            styles.chevronLabel,
            { color: rowColor ?? colors.foreground, fontFamily: "Inter_400Regular" },
          ]}
        >
          {label}
        </Text>
      </View>
      <View style={styles.chevronRight}>
        {value ? (
          <Text style={[styles.chevronValue, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {value}
          </Text>
        ) : null}
        {!destructive && <Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
      </View>
    </TouchableOpacity>
  );
}

function TrendCard({ label, icon }: { label: string; icon: string }) {
  const colors = useColors();
  const AMBER = "#F59E0B";
  return (
    <View style={[styles.trendCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.trendTop}>
        <Feather name={icon as any} size={13} color={colors.mutedForeground} />
        <Text style={[styles.trendLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {label}
        </Text>
      </View>
      <Text style={[styles.trendArrow, { color: AMBER }]}>{"→"}</Text>
      <Text style={[styles.trendStatus, { color: AMBER, fontFamily: "Inter_500Medium" }]}>Steady</Text>
    </View>
  );
}

// ─── Scroll column picker ─────────────────────────────────────────────────────

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

// ─── Time picker modal (scroll columns) ──────────────────────────────────────

function TimePickerModal({
  visible,
  value,
  onClose,
  onSave,
}: {
  visible: boolean;
  value: string;
  onClose: () => void;
  onSave: (hhmm: string) => void;
}) {
  const colors = useColors();

  function parseValue(hhmm: string) {
    const parts = hhmm.split(":");
    const h24 = parseInt(parts[0] ?? "20", 10);
    const m = parseInt(parts[1] ?? "0", 10);
    const isPm = h24 >= 12;
    const h12 = h24 % 12 || 12;
    const hourIdx = PICKER_HOURS.indexOf(String(h12));
    const minIdx = PICKER_MINUTES.indexOf(String(m).padStart(2, "0"));
    const ampmIdx = isPm ? 1 : 0;
    return {
      hourIdx: hourIdx < 0 ? 6 : hourIdx,
      minIdx: minIdx < 0 ? 6 : minIdx,
      ampmIdx,
    };
  }

  const initial = parseValue(value);
  const [hourIdx, setHourIdx] = useState(initial.hourIdx);
  const [minIdx, setMinIdx] = useState(initial.minIdx);
  const [ampmIdx, setAmpmIdx] = useState(initial.ampmIdx);

  useEffect(() => {
    if (visible) {
      const p = parseValue(value);
      setHourIdx(p.hourIdx);
      setMinIdx(p.minIdx);
      setAmpmIdx(p.ampmIdx);
    }
  }, [visible, value]);

  function handleSave() {
    const h12 = parseInt(PICKER_HOURS[hourIdx] ?? "8", 10);
    const mm = PICKER_MINUTES[minIdx] ?? "00";
    const isPm = ampmIdx === 1;
    const h24 = isPm ? (h12 % 12) + 12 : h12 % 12;
    onSave(`${String(h24).padStart(2, "0")}:${mm}`);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.modalBox, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Check-in time
          </Text>

          {/* Columns + selection indicator */}
          <View style={styles.pickerWrapper}>
            {/* Selection indicator */}
            <View
              pointerEvents="none"
              style={[
                styles.pickerIndicator,
                {
                  top: PICKER_ITEM_H * 2,
                  height: PICKER_ITEM_H,
                  borderTopColor: colors.border,
                  borderBottomColor: colors.border,
                },
              ]}
            />

            <PickerColumn
              items={PICKER_HOURS}
              selectedIndex={hourIdx}
              onSelect={setHourIdx}
              colors={colors}
            />
            <PickerColumn
              items={PICKER_MINUTES}
              selectedIndex={minIdx}
              onSelect={setMinIdx}
              colors={colors}
            />
            <PickerColumn
              items={PICKER_AMPM}
              selectedIndex={ampmIdx}
              onSelect={setAmpmIdx}
              colors={colors}
            />
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}>
              <Text style={[styles.modalCancelText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]}
              onPress={handleSave}
            >
              <Text style={[styles.modalSaveText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                Done
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Notifications modal ──────────────────────────────────────────────────────

function NotificationsModal({
  visible,
  callTime,
  onClose,
}: {
  visible: boolean;
  callTime: string;
  onClose: () => void;
}) {
  const colors = useColors();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIF_PREFS);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      AsyncStorage.getItem(NOTIF_PREFS_KEY)
        .then((raw) => {
          if (raw) {
            try { setPrefs({ ...DEFAULT_NOTIF_PREFS, ...JSON.parse(raw) }); } catch {}
          }
        })
        .catch(() => {});
    }
  }, [visible]);

  async function toggle(key: keyof NotificationPrefs) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try {
      await AsyncStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(next));
      setSavedKey(key);
      setTimeout(() => setSavedKey((cur) => (cur === key ? null : cur)), 1800);
    } catch {}
  }

  const TOGGLES: { key: keyof NotificationPrefs; label: string }[] = [
    { key: "dailyReminder", label: "Daily check-in reminder" },
    { key: "goalDeadlines", label: "Goal deadline reminders" },
    { key: "habitReminders", label: "Habit reminders" },
    { key: "weeklyInsights", label: "Weekly insights summary" },
    { key: "morningBriefing", label: "Morning briefing" },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.modalBox, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={styles.notifHeader}>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              Notifications
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <View style={[styles.notifCard, { borderColor: colors.border }]}>
            {TOGGLES.map((t, idx) => (
              <View key={t.key}>
                <View
                  style={[
                    styles.notifRow,
                    idx < TOGGLES.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.notifRowLeft}>
                    <Text style={[styles.notifLabel, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                      {t.label}
                    </Text>
                    {savedKey === t.key && (
                      <Text style={[styles.savedBadge, { color: colors.primary, fontFamily: "Inter_400Regular" }]}>
                        Saved
                      </Text>
                    )}
                  </View>
                  <Switch
                    value={prefs[t.key]}
                    onValueChange={() => { void toggle(t.key); }}
                    trackColor={{ false: colors.muted, true: colors.primary }}
                    thumbColor={colors.primaryForeground}
                  />
                </View>
              </View>
            ))}
          </View>

          <View style={[styles.notifNote, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Feather name="clock" size={13} color={colors.mutedForeground} />
            <Text style={[styles.notifNoteText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {"Your daily check-in reminder will be sent at "}
              <Text style={{ fontFamily: "Inter_500Medium", color: colors.foreground }}>
                {formatTime(callTime)}
              </Text>
              {"."}
            </Text>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { name, email, signOut, updateName, getToken, userId } = useValoAuth();

  const { data: goals } = useListGoals();
  const { data: habits } = useListHabits();
  const { isPermissionsGranted: isHealthConnected, syncNow: healthSyncNow, isSyncing: healthSyncing } = useHealthKitSync();

  const handleHealthKitConnect = React.useCallback(async () => {
    console.log('[Profile] handleHealthKitConnect called');
    const granted = await requestHealthKitPermissions();
    console.log('[Profile] permissions result:', granted);
    if (granted) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await healthSyncNow();
    }
  }, [healthSyncNow]);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const tabBarH = Platform.OS === "web" ? 84 : 83;

  // ── State ─────────────────────────────────────────────────────────────────
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(name ?? "");
  const [callTime, setCallTime] = useState("20:30");
  const [userIdentity, setUserIdentity] = useState("");
  const [userMotivation, setUserMotivation] = useState("");
  const [lifePriorities, setLifePriorities] = useState("");
  const [coreValues, setCoreValues] = useState<string[]>([]);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [savedField, setSavedField] = useState<string | null>(null);

  // ── Load on mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    void loadProfile();
  }, []);

  async function loadProfile() {
    const token = await getToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const base = getApiBase();

    const [settingsRes, contextRes] = await Promise.all([
      fetch(`${base}/api/settings`, { headers }),
      userId
        ? fetch(`${base}/api/vapi/first-call-context/${userId}`, { headers })
        : Promise.resolve(null),
    ]);

    if (settingsRes.ok) {
      const s = await settingsRes.json();
      if (s.preferredCallTime) setCallTime(s.preferredCallTime);
      if (s.lifePriorities) setLifePriorities(s.lifePriorities);
    }

    if (contextRes?.ok) {
      const c = await contextRes.json();
      if (c.user_identity) setUserIdentity(c.user_identity);
      if (c.user_motivation) setUserMotivation(c.user_motivation);
    }
  }

  // ── Saved indicator ───────────────────────────────────────────────────────
  function showSaved(field: string) {
    setSavedField(field);
    setTimeout(() => setSavedField((cur) => (cur === field ? null : cur)), 2000);
  }

  // ── PATCH helpers ─────────────────────────────────────────────────────────
  async function patchSettings(body: Record<string, unknown>, field: string) {
    const token = await getToken();
    try {
      const res = await fetch(`${getApiBase()}/api/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (res.ok) showSaved(field);
    } catch {}
  }

  async function patchOnboarding(body: Record<string, unknown>, field: string) {
    const token = await getToken();
    try {
      const res = await fetch(`${getApiBase()}/api/onboarding/save`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (res.ok) showSaved(field);
    } catch {}
  }

  // ── Name save ─────────────────────────────────────────────────────────────
  async function handleNameSave() {
    const trimmed = nameInput.trim();
    setEditingName(false);
    if (!trimmed) { setNameInput(name ?? ""); return; }
    updateName(trimmed);
    await patchSettings({ name: trimmed }, "name");
  }

  // ── Sign out / delete ─────────────────────────────────────────────────────
  async function handleResetData() {
    const token = await getToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const base = getApiBase();

    const [goalsRes, habitsRes, calRes] = await Promise.all([
      fetch(`${base}/api/goals`, { headers }).catch(() => null),
      fetch(`${base}/api/habits`, { headers }).catch(() => null),
      fetch(`${base}/api/calendar-events`, { headers }).catch(() => null),
    ]);

    const goals: { id: number }[] = goalsRes?.ok ? await goalsRes.json().catch(() => []) : [];
    const habits: { id: number }[] = habitsRes?.ok ? await habitsRes.json().catch(() => []) : [];
    const calEvents: { id: number }[] = calRes?.ok ? await calRes.json().catch(() => []) : [];

    await Promise.allSettled([
      ...goals.map((g) => fetch(`${base}/api/goals/${g.id}`, { method: "DELETE", headers })),
      ...habits.map((h) => fetch(`${base}/api/habits/${h.id}`, { method: "DELETE", headers })),
      ...calEvents.map((e) => fetch(`${base}/api/calendar-events/${e.id}`, { method: "DELETE", headers })),
    ]);

    if (userId) {
      await AsyncStorage.multiRemove([
        `@valo/routines-${userId}`,
        "@valo/tomorrow-intention",
      ]).catch(() => {});
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Data reset. Fresh start!", undefined, [
      { text: "OK", onPress: () => router.replace("/(tabs)/today" as any) },
    ]);
  }

  function promptResetData() {
    Alert.alert(
      "Reset your data?",
      "This will clear all your check-ins, goals, habits, calendar events, moods, and logs. Your account and onboarding info will be kept.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", style: "destructive", onPress: () => { void handleResetData(); } },
      ],
    );
  }

  function handleDeleteAccount() {
    Alert.alert(
      "Delete account",
      "This will permanently remove your account and all your data. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => { void signOut(); } },
      ]
    );
  }

  const displayName = name ?? "";
  const avatarLetters = getInitials(displayName || null, email);
  const goalCount = goals?.length ?? 0;
  const habitCount = habits?.length ?? 0;

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{
          paddingTop: topPad + 12,
          paddingBottom: bottomPad + tabBarH + 32,
          paddingHorizontal: 20,
        }}
      >
        {/* ══════════════════════════════════════════════════════════════════
            SECTION 1 — Your Valo
        ══════════════════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <SectionLabel label="YOUR VALO" />
          <View style={[styles.avatarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={[styles.avatarText, { color: colors.primaryForeground, fontFamily: "Inter_700Bold" }]}>
                {avatarLetters}
              </Text>
            </View>

            {editingName ? (
              <TextInput
                value={nameInput}
                onChangeText={setNameInput}
                onBlur={handleNameSave}
                onSubmitEditing={handleNameSave}
                autoFocus
                returnKeyType="done"
                style={[
                  styles.nameInput,
                  { color: colors.foreground, borderBottomColor: colors.primary, fontFamily: "Inter_700Bold" },
                ]}
              />
            ) : (
              <TouchableOpacity onPress={() => { setNameInput(displayName); setEditingName(true); }} activeOpacity={0.75}>
                <Text style={[styles.displayName, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                  {displayName || "Add your name"}
                </Text>
              </TouchableOpacity>
            )}

            {savedField === "name" && (
              <Text style={[styles.savedBadge, { color: colors.primary, fontFamily: "Inter_400Regular" }]}>
                Saved
              </Text>
            )}

            {email ? (
              <Text style={[styles.emailText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {email}
              </Text>
            ) : null}

            <View style={styles.statsRow}>
              <View style={[styles.statChip, { backgroundColor: colors.muted }]}>
                <Feather name="zap" size={11} color={colors.primary} />
                <Text style={[styles.statChipText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                  0 day streak
                </Text>
              </View>
              {goalCount > 0 && (
                <View style={[styles.statChip, { backgroundColor: colors.muted }]}>
                  <Text style={[styles.statChipText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                    {goalCount} {goalCount === 1 ? "goal" : "goals"}
                  </Text>
                </View>
              )}
              {habitCount > 0 && (
                <View style={[styles.statChip, { backgroundColor: colors.muted }]}>
                  <Text style={[styles.statChipText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                    {habitCount} {habitCount === 1 ? "habit" : "habits"}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 2 — Life Trends
        ══════════════════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <SectionLabel label="LIFE TRENDS" />
          <View style={styles.trendsGrid}>
            {TREND_DOMAINS.map((d) => (
              <TrendCard key={d.key} label={d.label} icon={d.icon} />
            ))}
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 3 — Identity
        ══════════════════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <SectionLabel label="IDENTITY" />
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>

            <View style={styles.identityField}>
              <View style={styles.fieldHeaderRow}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                  Who I am becoming
                </Text>
                <SavedBadge visible={savedField === "identity"} />
              </View>
              <TextInput
                value={userIdentity}
                onChangeText={setUserIdentity}
                onBlur={() => { void patchOnboarding({ userIdentity }, "identity"); }}
                placeholder="I am becoming..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                style={[styles.textarea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, fontFamily: "Inter_400Regular" }]}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.identityField}>
              <View style={styles.fieldHeaderRow}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                  My biggest motivator
                </Text>
                <SavedBadge visible={savedField === "motivation"} />
              </View>
              <TextInput
                value={userMotivation}
                onChangeText={setUserMotivation}
                onBlur={() => { void patchOnboarding({ userMotivation }, "motivation"); }}
                placeholder="What drives you?"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.singleInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, fontFamily: "Inter_400Regular" }]}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.identityField}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                My core values
              </Text>
              <View style={styles.chipsWrap}>
                {CORE_VALUES.map((val) => {
                  const sel = coreValues.includes(val);
                  return (
                    <TouchableOpacity
                      key={val}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setCoreValues((prev) =>
                          prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val]
                        );
                      }}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: sel ? colors.primary : colors.muted,
                          borderColor: sel ? colors.primary : colors.border,
                        },
                      ]}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          {
                            color: sel ? colors.primaryForeground : colors.mutedForeground,
                            fontFamily: sel ? "Inter_500Medium" : "Inter_400Regular",
                          },
                        ]}
                      >
                        {val}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.identityField}>
              <View style={styles.fieldHeaderRow}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                  My intentions
                </Text>
                <SavedBadge visible={savedField === "intentions"} />
              </View>
              <TextInput
                value={lifePriorities}
                onChangeText={setLifePriorities}
                onBlur={() => { void patchSettings({ lifePriorities }, "intentions"); }}
                placeholder="What you want to focus on..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                style={[styles.textarea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, fontFamily: "Inter_400Regular" }]}
              />
            </View>
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 4 — Account
        ══════════════════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <SectionLabel label="ACCOUNT" />
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, overflow: "hidden" }]}>
            <ChevronRow icon="mail" label="Email" value={email ?? undefined} onPress={() => {}} />
            <ChevronRow icon="lock" label="Change password" onPress={() => Alert.alert("Coming soon")} />
            <ChevronRow
              icon="phone"
              label="Check-in time"
              value={formatTime(callTime)}
              onPress={() => setShowTimePicker(true)}
            />
            <ChevronRow
              icon="bell"
              label="Notifications"
              onPress={() => setShowNotifications(true)}
              last
            />
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 5 — Connected Data
        ══════════════════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <SectionLabel label="CONNECTED DATA" />
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, overflow: "hidden" }]}>
            {INTEGRATIONS.map((integration, idx) => {
              const isAppleHealth = integration.key === "apple-health";
              const connected = isAppleHealth && isHealthConnected;
              const syncing = isAppleHealth && healthSyncing;
              return (
                <View
                  key={integration.key}
                  style={[
                    styles.integrationRow,
                    idx < INTEGRATIONS.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.chevronLeft}>
                    <Feather
                      name={integration.icon as any}
                      size={17}
                      color={connected ? "#059669" : colors.mutedForeground}
                    />
                    <Text style={[styles.chevronLabel, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                      {integration.label}
                    </Text>
                  </View>
                  {isAppleHealth ? (
                    connected ? (
                      <View style={[styles.statusBadge, { backgroundColor: "#DCFCE7" }]}>
                        <Feather name="check" size={12} color="#059669" />
                        <Text style={[styles.statusText, { color: "#059669", fontFamily: "Inter_500Medium" }]}>
                          Connected
                        </Text>
                      </View>
                    ) : syncing ? (
                      <View style={[styles.statusBadge, { backgroundColor: colors.muted }]}>
                        <Text style={[styles.statusText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                          Syncing…
                        </Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.connectActionBtn, { backgroundColor: colors.primary }]}
                        onPress={handleHealthKitConnect}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.connectActionText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                          Connect
                        </Text>
                      </TouchableOpacity>
                    )
                  ) : (
                    <TouchableOpacity
                      onPress={() => Alert.alert("Coming soon")}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.statusBadge, { backgroundColor: colors.muted }]}>
                        <Text style={[styles.statusText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                          Not connected
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 6 — Membership
        ══════════════════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <SectionLabel label="MEMBERSHIP" />
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.membershipRow}>
              <Text style={[styles.membershipLabel, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                Current plan
              </Text>
              <View style={[styles.planBadge, { backgroundColor: colors.muted }]}>
                <Text style={[styles.planText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                  Free
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.upgradeBtn, { backgroundColor: colors.primary }]}
              onPress={() => Alert.alert("Coming soon")}
              activeOpacity={0.85}
            >
              <Text style={[styles.upgradeText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                Upgrade to Valo Pro
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 7 — Admin
        ══════════════════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <SectionLabel label="ADMIN" />
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, overflow: "hidden" }]}>
            <ChevronRow icon="download" label="Export my data" onPress={() => Alert.alert("Coming soon")} />
            <ChevronRow icon="refresh-cw" label="Reset my data" onPress={promptResetData} accentColor="#C17B3F" />
            <ChevronRow icon="shield" label="Privacy settings" onPress={() => Alert.alert("Coming soon")} />
            <ChevronRow icon="eye" label="What Valo knows about me" onPress={() => Alert.alert("Coming soon")} />
            <ChevronRow icon="log-out" label="Log out" onPress={() => { void signOut(); }} />
            <ChevronRow icon="trash-2" label="Delete account" onPress={handleDeleteAccount} destructive last />
          </View>
        </View>
      </ScrollView>

      <TimePickerModal
        visible={showTimePicker}
        value={callTime}
        onClose={() => setShowTimePicker(false)}
        onSave={async (hhmm) => {
          setCallTime(hhmm);
          setShowTimePicker(false);
          await patchSettings({ preferredCallTime: hhmm }, "callTime");
        }}
      />

      <NotificationsModal
        visible={showNotifications}
        callTime={callTime}
        onClose={() => setShowNotifications(false)}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  section: {
    marginBottom: 28,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  // Avatar card
  avatarCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 22,
    alignItems: "center",
    gap: 8,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  avatarText: { fontSize: 28 },
  displayName: { fontSize: 22, lineHeight: 28 },
  nameInput: {
    fontSize: 22,
    lineHeight: 28,
    borderBottomWidth: 1.5,
    paddingBottom: 2,
    minWidth: 180,
    textAlign: "center",
  },
  emailText: { fontSize: 14, lineHeight: 20 },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginTop: 6,
  },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 100,
  },
  statChipText: { fontSize: 12 },
  savedBadge: { fontSize: 12 },
  // Trends
  trendsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  trendCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    minWidth: "30%",
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  trendTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  trendLabel: { fontSize: 11 },
  trendArrow: { fontSize: 20, lineHeight: 26 },
  trendStatus: { fontSize: 10 },
  // Identity
  identityField: {
    gap: 10,
    paddingVertical: 14,
  },
  fieldHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fieldLabel: { fontSize: 12, letterSpacing: 0.3 },
  textarea: {
    minHeight: 70,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: "top",
  },
  singleInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  divider: { height: StyleSheet.hairlineWidth },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 100,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, lineHeight: 16 },
  // Rows
  chevronRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  chevronLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  chevronLabel: { fontSize: 15 },
  chevronRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chevronValue: { fontSize: 13 },
  integrationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  statusText: { fontSize: 11 },
  connectActionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  connectActionText: { fontSize: 13 },
  // Membership
  membershipRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  membershipLabel: { fontSize: 15 },
  planBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 100,
  },
  planText: { fontSize: 12 },
  upgradeBtn: {
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  upgradeText: { fontSize: 15 },
  // Modals (shared)
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 28,
  },
  modalBox: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    gap: 20,
  },
  modalTitle: { fontSize: 17 },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  modalCancelText: { fontSize: 15 },
  modalSaveBtn: {
    flex: 2,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  modalSaveText: { fontSize: 15 },
  // Scroll picker
  pickerWrapper: {
    flexDirection: "row",
    position: "relative",
  },
  pickerIndicator: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    pointerEvents: "none",
  },
  // Notifications modal
  notifHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  notifCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  notifRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  notifRowLeft: {
    flex: 1,
    gap: 2,
  },
  notifLabel: { fontSize: 15 },
  notifNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  notifNoteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
});
