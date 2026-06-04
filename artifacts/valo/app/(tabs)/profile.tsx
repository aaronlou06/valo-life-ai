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
  Linking,
  Modal,
  Platform,
  Switch,
  Image,
  AppState,
  type AppStateStatus,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as MailComposer from "expo-mail-composer";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/useColors";
import { useValoAuth } from "@/contexts/AuthContext";
import { useHealthKitSync } from "@/hooks/useHealthKitSync";
import {
  buildGoogleOAuthUrl,
  exchangeGoogleAuthCode,
  syncGoogleCalendarEvents,
  isGoogleCalendarConnected,
  disconnectGoogleCalendar,
  fetchGoogleCalendars,
  saveGoogleCalendarSelections,
  savePkceVerifier,
  consumePkceVerifier,
  GOOGLE_OAUTH_PREFIX,
  type GoogleCalendarInfo,
} from "@/lib/googleCalendar";
import { requestHealthKitPermissions } from "@/lib/healthKit";
import {
  requestNotificationPermissions,
  scheduleMorningBriefing,
  scheduleCheckinReminder,
  cancelAllNotifications,
} from "@/lib/notifications";
import {
  useListGoals,
  useListHabits,
  useGetDashboard,
  useGetStreakData,
} from "@workspace/api-client-react";

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

const PICKER_ITEM_H = 44;
const PICKER_VISIBLE = 5;
const PICKER_HOURS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const PICKER_MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
const PICKER_AMPM = ["AM", "PM"];

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
        <Feather name={icon as any} size={17} color={rowColor ?? colors.mutedForeground} />
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

// ─── Time picker modal ────────────────────────────────────────────────────────

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
          <View style={styles.pickerWrapper}>
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
            <PickerColumn items={PICKER_HOURS} selectedIndex={hourIdx} onSelect={setHourIdx} colors={colors} />
            <PickerColumn items={PICKER_MINUTES} selectedIndex={minIdx} onSelect={setMinIdx} colors={colors} />
            <PickerColumn items={PICKER_AMPM} selectedIndex={ampmIdx} onSelect={setAmpmIdx} colors={colors} />
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
  getToken,
  onClose,
}: {
  visible: boolean;
  callTime: string;
  getToken: () => Promise<string | null>;
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

      // Request permissions on first enable
      const anyEnabled = Object.values(next).some(Boolean);
      if (anyEnabled) {
        await requestNotificationPermissions();
      }

      // Schedule or cancel based on the new prefs
      if (next.morningBriefing) {
        await scheduleMorningBriefing("07:00");
      } else if (key === "morningBriefing") {
        const { cancelScheduledNotificationAsync } = (await import("expo-notifications")) as typeof import("expo-notifications");
        await cancelScheduledNotificationAsync("valo.morning-briefing").catch(() => {});
      }

      if (next.dailyReminder) {
        await scheduleCheckinReminder(callTime);
      } else if (key === "dailyReminder") {
        const { cancelScheduledNotificationAsync } = (await import("expo-notifications")) as typeof import("expo-notifications");
        await cancelScheduledNotificationAsync("valo.checkin-reminder").catch(() => {});
      }

      if (!anyEnabled) {
        await cancelAllNotifications();
      }

      // Persist to server
      const token = await getToken();
      if (token) {
        await fetch(`${getApiBase()}/api/settings`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            notificationsEnabled: anyEnabled,
            morningBriefingEnabled: next.morningBriefing,
            checkinReminderEnabled: next.dailyReminder,
            habitRemindersEnabled: next.habitReminders,
          }),
        }).catch(() => {});
      }
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

// ─── Change password modal ────────────────────────────────────────────────────

function ChangePasswordModal({
  visible,
  getToken,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const colors = useColors();
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      setError(null);
      setLoading(false);
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
    }
  }, [visible]);

  async function handleSave() {
    setError(null);
    if (!currentPwd) { setError("Enter your current password."); return; }
    if (newPwd.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (newPwd !== confirmPwd) { setError("New passwords do not match."); return; }

    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${getApiBase()}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
      } else {
        onSuccess();
      }
    } catch {
      setError("Could not connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.modalBox, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={styles.notifHeader}>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              Change password
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <View style={{ gap: 12 }}>
            {/* Current password */}
            <View style={[styles.pwdFieldWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <TextInput
                value={currentPwd}
                onChangeText={setCurrentPwd}
                placeholder="Current password"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!showCurrent}
                style={[styles.pwdInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowCurrent((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name={showCurrent ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* New password */}
            <View style={[styles.pwdFieldWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <TextInput
                value={newPwd}
                onChangeText={setNewPwd}
                placeholder="New password"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!showNew}
                style={[styles.pwdInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowNew((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name={showNew ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Confirm new password */}
            <View style={[styles.pwdFieldWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <TextInput
                value={confirmPwd}
                onChangeText={setConfirmPwd}
                placeholder="Confirm new password"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!showConfirm}
                style={[styles.pwdInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                autoCapitalize="none"
                onSubmitEditing={() => { void handleSave(); }}
                returnKeyType="done"
              />
              <TouchableOpacity onPress={() => setShowConfirm((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name={showConfirm ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {error ? (
              <Text style={[styles.pwdError, { color: colors.destructive, fontFamily: "Inter_400Regular" }]}>
                {error}
              </Text>
            ) : null}
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}>
              <Text style={[styles.modalCancelText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSaveBtn, { backgroundColor: loading ? colors.muted : colors.primary }]}
              onPress={() => { void handleSave(); }}
              disabled={loading}
            >
              <Text style={[styles.modalSaveText, { color: loading ? colors.mutedForeground : colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                {loading ? "Saving…" : "Update"}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Grocery retailer constants
// ─────────────────────────────────────────────────────────────────────────────

const RETAILER_STORAGE_KEY = "valo:retailer_connections";

const GROCERY_RETAILERS = [
  { id: "instacart", name: "Instacart", color: "#43B02A", abbr: "IC", icon: "shopping-cart" as const },
  { id: "walmart",   name: "Walmart",   color: "#0071CE", abbr: "W",  icon: "shopping-bag"  as const },
  { id: "kroger",    name: "Kroger",    color: "#003DA5", abbr: "K",  icon: "tag"            as const },
] as const;

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
  const { data: dashboard } = useGetDashboard();
  const { data: streakData } = useGetStreakData();

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const tabBarH = Platform.OS === "web" ? 84 : 83;

  // ── Google Calendar state ──────────────────────────────────────────────────
  const [isGCalConnected, setIsGCalConnected] = useState(false);
  const [connectingGCal, setConnectingGCal] = useState(false);
  const [gCalSyncing, setGCalSyncing] = useState(false);
  const [gCalCount, setGCalCount] = useState<number | null>(null);
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendarInfo[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const {
    isPermissionsGranted: isHealthKitConnected,
    isSyncing: isHealthKitSyncing,
    lastSynced: healthKitLastSynced,
    syncNow: syncHealthKitNow,
  } = useHealthKitSync();

  // ── UI state ───────────────────────────────────────────────────────────────
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(name ?? "");
  const [callTime, setCallTime] = useState("20:30");
  const [userIdentity, setUserIdentity] = useState("");
  const [userMotivation, setUserMotivation] = useState("");
  const [lifePriorities, setLifePriorities] = useState("");
  const [coreValues, setCoreValues] = useState<string[]>([]);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [savedField, setSavedField] = useState<string | null>(null);

  // ── Retailer connections ──────────────────────────────────────────────────
  const [retailerConnected, setRetailerConnected] = useState<Record<string, boolean>>({
    instacart: false, walmart: false, kroger: false,
  });

  // ── Load on mount ──────────────────────────────────────────────────────────
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

    const connected = await isGoogleCalendarConnected(getToken);
    setIsGCalConnected(connected);
    if (connected) void loadGoogleCalendars();

    const raw = await AsyncStorage.getItem(RETAILER_STORAGE_KEY);
    if (raw) setRetailerConnected(JSON.parse(raw) as Record<string, boolean>);
  }

  async function loadGoogleCalendars() {
    const token = await getToken();
    if (!token) return;
    setLoadingCalendars(true);
    const cals = await fetchGoogleCalendars(token);
    if (cals) setGoogleCalendars(cals);
    setLoadingCalendars(false);
  }

  async function toggleGoogleCalendar(calendarId: string, newValue: boolean) {
    const updated = googleCalendars.map((c) =>
      c.calendarId === calendarId ? { ...c, isSelected: newValue } : c,
    );
    setGoogleCalendars(updated);
    const token = await getToken();
    if (token) await saveGoogleCalendarSelections(token, updated);
  }

  // ── AppState — re-check GCal on foreground (user returns from browser) ─────
  const isGCalConnectedRef = useRef(isGCalConnected);
  useEffect(() => { isGCalConnectedRef.current = isGCalConnected; }, [isGCalConnected]);

  // Persists the PKCE verifier across renders — survives foreground backgrounding
  const codeVerifierRef = useRef<string | null>(null);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        void (async () => {
          const connected = await isGoogleCalendarConnected(getToken);
          const wasConnected = isGCalConnectedRef.current;
          setIsGCalConnected(connected);
          if (connected && !wasConnected) {
            setGCalSyncing(true);
            const token = await getToken();
            if (token) {
              const count = await syncGoogleCalendarEvents(token);
              setGCalCount(count);
            }
            setGCalSyncing(false);
            void loadGoogleCalendars();
          }
        })();
      }
    };
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, []);

  // ── Cold-start OAuth: app was killed then reopened from the deep link ───────
  // Linking.addEventListener does NOT fire in this case; only getInitialURL does.
  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      if (!url?.startsWith(GOOGLE_OAUTH_PREFIX)) return;
      console.log("[GCal] Cold-start OAuth URL detected:", url);
      setConnectingGCal(true);
      void handleOAuthUrl(url);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRetailerConnect(id: string, name: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      `Connect ${name}`,
      `Allow Valo to add your grocery lists directly to your ${name} cart.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Connect",
          onPress: async () => {
            const updated = { ...retailerConnected, [id]: true };
            setRetailerConnected(updated);
            await AsyncStorage.setItem(RETAILER_STORAGE_KEY, JSON.stringify(updated));
          },
        },
      ],
    );
  }

  async function handleRetailerDisconnect(id: string, name: string) {
    Alert.alert(
      `Disconnect ${name}?`,
      `This will remove Valo's access to your ${name} cart.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            const updated = { ...retailerConnected, [id]: false };
            setRetailerConnected(updated);
            await AsyncStorage.setItem(RETAILER_STORAGE_KEY, JSON.stringify(updated));
          },
        },
      ],
    );
  }

  // ── Saved indicator ────────────────────────────────────────────────────────
  function showSaved(field: string) {
    setSavedField(field);
    setTimeout(() => setSavedField((cur) => (cur === field ? null : cur)), 2000);
  }

  // ── Report a bug ───────────────────────────────────────────────────────────
  const BUG_EMAIL = "support@govalo.app";
  const BUG_SUBJECT = "Bug report";

  function buildBugBody(): string {
    const appVersion = Constants.expoConfig?.version ?? "unknown";
    const osVersion = Platform.Version;
    const lines = [
      "Please describe the bug you encountered:",
      "",
      "",
      "",
      "---",
      `App version: ${appVersion}`,
      `Platform: ${Platform.OS} ${osVersion}`,
      `User ID: ${userId ?? "not signed in"}`,
    ];
    return lines.join("\n");
  }

  async function openPlainMailto() {
    const mailto = `mailto:${BUG_EMAIL}?subject=${encodeURIComponent(BUG_SUBJECT)}&body=${encodeURIComponent(buildBugBody())}`;
    try {
      await Linking.openURL(mailto);
    } catch {
      Alert.alert("Cannot open mail app", `Please email us directly at ${BUG_EMAIL}`);
    }
  }

  async function handleReportBug() {
    Alert.alert(
      "Report a bug",
      "Would you like to attach a screenshot from your photo library?",
      [
        {
          text: "Skip",
          onPress: () => { void openPlainMailto(); },
        },
        {
          text: "Add screenshot",
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: "images",
              quality: 0.8,
              allowsEditing: false,
            });

            if (result.canceled || result.assets.length === 0) {
              // User dismissed the picker — fall back to plain email
              void openPlainMailto();
              return;
            }

            const imageUri = result.assets[0]!.uri;

            const available = await MailComposer.isAvailableAsync();
            if (available) {
              await MailComposer.composeAsync({
                recipients: [BUG_EMAIL],
                subject: BUG_SUBJECT,
                body: buildBugBody(),
                attachments: [imageUri],
              });
            } else {
              // Device has no configured mail account — inform the user
              Alert.alert(
                "Mail not configured",
                `No mail account is set up on this device. Please email ${BUG_EMAIL} and attach your screenshot manually.`,
              );
            }
          },
        },
      ],
    );
  }

  // ── Apple Health ───────────────────────────────────────────────────────────
  async function handleHealthKitConnect() {
    if (Platform.OS !== "ios") return;
    const granted = await requestHealthKitPermissions();
    if (granted) {
      await AsyncStorage.setItem("@valo/healthkit-permissions-requested", "true");
      void syncHealthKitNow();
    } else {
      Alert.alert(
        "Health Access Required",
        "Please enable Apple Health access for Valo in Settings > Privacy & Security > Health.",
        [{ text: "OK" }],
      );
    }
  }

  function formatLastSynced(date: Date | null): string {
    if (!date) return "Never synced";
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
    const diffDays = Math.floor(diffHours / 24);
    return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
  }

  // ── Google Calendar ────────────────────────────────────────────────────────

  /**
   * Shared handler for both foreground redirects (Linking.addEventListener)
   * and cold-start redirects (Linking.getInitialURL).
   */
  async function handleOAuthUrl(redirectUrl: string) {
    console.log("[GCal] handleOAuthUrl called with:", redirectUrl);

    const match = redirectUrl.match(/[?&]code=([^&]+)/);
    if (!match) {
      console.log("[GCal] No auth code found in redirect URL");
      setConnectingGCal(false);
      return;
    }

    const code = decodeURIComponent(match[1]!);
    console.log("[GCal] Auth code extracted, beginning token exchange");

    // Use the in-memory ref first (foreground case), fall back to AsyncStorage
    // for cold-start where the closure is gone and the ref is fresh/null.
    let verifier = codeVerifierRef.current;
    if (!verifier) {
      verifier = await consumePkceVerifier();
      console.log("[GCal] Verifier recovered from AsyncStorage:", verifier != null);
    } else {
      // Clear the AsyncStorage copy since we have it in the ref
      void consumePkceVerifier();
      console.log("[GCal] Verifier found in ref (foreground path)");
    }

    if (!verifier) {
      console.log("[GCal] No PKCE verifier available — cannot complete OAuth");
      setConnectingGCal(false);
      Alert.alert("Error", "Session expired. Please try connecting again.");
      return;
    }

    const ok = await exchangeGoogleAuthCode(code, verifier, getToken);
    codeVerifierRef.current = null;
    setConnectingGCal(false);
    console.log("[GCal] Token exchange:", ok ? "success" : "failed");

    if (ok) {
      void handleGCalOAuthSuccess();
    } else {
      Alert.alert("Error", "Could not complete authorization. Please try again.");
    }
  }

  async function handleGCalConnect() {
    setConnectingGCal(true);
    console.log("[GCal] Starting OAuth flow");

    try {
      const { url, codeVerifier } = await buildGoogleOAuthUrl();

      // Persist verifier before opening Safari so cold-start recovery works
      codeVerifierRef.current = codeVerifier;
      await savePkceVerifier(codeVerifier);
      console.log("[GCal] PKCE verifier saved, registering Linking listener");

      // Register listener BEFORE openURL so no redirect can slip through
      const subscription = Linking.addEventListener("url", async ({ url: redirectUrl }) => {
        console.log("[GCal] Linking event fired:", redirectUrl);
        if (!redirectUrl.startsWith(GOOGLE_OAUTH_PREFIX)) return;
        subscription.remove();
        await handleOAuthUrl(redirectUrl);
      });

      console.log("[GCal] Opening Safari for OAuth:", url);
      await Linking.openURL(url);
    } catch (err) {
      console.log("[GCal] Failed to launch OAuth:", err);
      setConnectingGCal(false);
      Alert.alert("Error", "Could not open authorization page. Please try again.");
    }
  }

  async function handleGCalOAuthSuccess() {
    const connected = await isGoogleCalendarConnected(getToken);
    setIsGCalConnected(connected);
    if (connected) {
      setGCalSyncing(true);
      const token = await getToken();
      if (token) {
        const count = await syncGoogleCalendarEvents(token);
        setGCalCount(count);
      }
      setGCalSyncing(false);
      void loadGoogleCalendars();
    }
  }

  async function handleGCalDisconnect() {
    Alert.alert(
      "Disconnect Google Calendar",
      "This will remove your Google Calendar connection and delete all synced events from Valo.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            const ok = await disconnectGoogleCalendar(getToken);
            if (ok) {
              setIsGCalConnected(false);
              setGCalCount(null);
              setGoogleCalendars([]);
            }
          },
        },
      ],
    );
  }

  // ── PATCH helpers ──────────────────────────────────────────────────────────
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

  // ── Name save ──────────────────────────────────────────────────────────────
  async function handleNameSave() {
    const trimmed = nameInput.trim();
    setEditingName(false);
    if (!trimmed) { setNameInput(name ?? ""); return; }
    updateName(trimmed);
    await patchSettings({ name: trimmed }, "name");
  }

  // ── Sign out ───────────────────────────────────────────────────────────────
  async function handleLogOut() {
    try {
      await signOut();
      router.replace("/(auth)/sign-in");
    } catch {
      router.replace("/(auth)/sign-in");
    }
  }

  // ── Data reset ─────────────────────────────────────────────────────────────
  async function handleResetData() {
    const token = await getToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const base = getApiBase();

    const [goalsRes, habitsRes, calRes] = await Promise.all([
      fetch(`${base}/api/goals`, { headers }).catch(() => null),
      fetch(`${base}/api/habits`, { headers }).catch(() => null),
      fetch(`${base}/api/calendar-events`, { headers }).catch(() => null),
    ]);

    const goalsList: { id: number }[] = goalsRes?.ok ? await goalsRes.json().catch(() => []) : [];
    const habitsList: { id: number }[] = habitsRes?.ok ? await habitsRes.json().catch(() => []) : [];
    const calEvents: { id: number }[] = calRes?.ok ? await calRes.json().catch(() => []) : [];

    await Promise.allSettled([
      ...goalsList.map((g) => fetch(`${base}/api/goals/${g.id}`, { method: "DELETE", headers })),
      ...habitsList.map((h) => fetch(`${base}/api/habits/${h.id}`, { method: "DELETE", headers })),
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
      { text: "OK", onPress: () => router.replace("/(tabs)/checkin" as any) },
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

  // ── Delete account ─────────────────────────────────────────────────────────
  function handleDeleteAccount() {
    Alert.alert(
      "Delete account?",
      "This permanently removes your account and all your data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Are you sure?",
              "Tap Confirm to permanently delete your Valo account.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Confirm delete",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      const token = await getToken();
                      await fetch(`${getApiBase()}/api/auth/account`, {
                        method: "DELETE",
                        headers: token ? { Authorization: `Bearer ${token}` } : {},
                      });
                    } catch {}
                    await signOut();
                    router.replace("/(auth)/sign-in");
                  },
                },
              ],
            );
          },
        },
      ],
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
        {/* ── Wordmark ──────────────────────────────────────────────────────── */}
        <Image
          source={require("@/assets/images/logo-wordmark.png")}
          style={{ height: 36, width: 237, marginBottom: 16 }}
          resizeMode="contain"
          tintColor={colors.foreground}
        />

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 1 — Header
        ══════════════════════════════════════════════════════════════════ */}
        <View style={styles.section}>
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
                  {(streakData?.currentStreak ?? dashboard?.streak ?? 0) === 0
                    ? "Start your first day"
                    : `${streakData?.currentStreak ?? dashboard?.streak ?? 0} day streak`}
                </Text>
              </View>
              {(streakData?.longestStreak ?? 0) > 0 && (
                <View style={[styles.statChip, { backgroundColor: colors.muted }]}>
                  <Feather name="award" size={11} color={colors.mutedForeground} />
                  <Text style={[styles.statChipText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                    {`Best: ${streakData!.longestStreak}d`}
                  </Text>
                </View>
              )}
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
            SECTION 2 — Connections
        ══════════════════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <SectionLabel label="CONNECTIONS" />

          {/* Google Calendar */}
          <View style={[styles.connectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.connectionCardTop}>
              <View style={styles.connectionLeft}>
                <View style={[styles.connectionIconWrap, { backgroundColor: colors.muted }]}>
                  <Feather name="grid" size={16} color={isGCalConnected ? "#059669" : colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.connectionName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                    Google Calendar
                  </Text>
                  {isGCalConnected && gCalCount !== null && (
                    <Text style={[styles.connectionSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      {gCalCount} {gCalCount === 1 ? "event" : "events"} synced
                    </Text>
                  )}
                </View>
              </View>

              {isGCalConnected ? (
                <View style={[styles.connectedBadge, { backgroundColor: "#DCFCE7" }]}>
                  <Feather name="check" size={12} color="#059669" />
                  <Text style={[styles.badgeText, { color: "#059669", fontFamily: "Inter_500Medium" }]}>
                    Connected
                  </Text>
                </View>
              ) : connectingGCal || gCalSyncing ? (
                <View style={[styles.connectedBadge, { backgroundColor: colors.muted }]}>
                  <Text style={[styles.badgeText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                    {gCalSyncing ? "Syncing…" : "Connecting…"}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.connectBtn, { backgroundColor: colors.primary }]}
                  onPress={() => { void handleGCalConnect(); }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.connectBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                    Connect
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Disconnect link */}
            {isGCalConnected && (
              <TouchableOpacity
                onPress={() => { void handleGCalDisconnect(); }}
                style={styles.disconnectLink}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.6}
              >
                <Text style={[styles.disconnectText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  Disconnect
                </Text>
              </TouchableOpacity>
            )}

            {/* Calendar selection */}
            {isGCalConnected && googleCalendars.length > 0 && (
              <View style={[styles.calendarList, { borderTopColor: colors.border }]}>
                <View style={styles.calendarListHeader}>
                  <Text style={[styles.calendarListTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                    Synced calendars
                  </Text>
                  {loadingCalendars && (
                    <Text style={[styles.calendarListLoading, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      Loading…
                    </Text>
                  )}
                </View>
                {googleCalendars.map((cal, idx) => (
                  <View
                    key={cal.calendarId}
                    style={[
                      styles.calendarRow,
                      idx < googleCalendars.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    <View style={[styles.calDot, { backgroundColor: cal.calendarColor ?? "#888888" }]} />
                    <Text style={[styles.calName, { color: colors.foreground, fontFamily: "Inter_400Regular" }]} numberOfLines={1}>
                      {cal.calendarName}
                    </Text>
                    <Switch
                      value={cal.isSelected}
                      onValueChange={(v) => { void toggleGoogleCalendar(cal.calendarId, v); }}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Apple Health */}
          {Platform.OS === "ios" && (
            <View style={[styles.connectionCard, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
              <View style={styles.connectionCardTop}>
                <View style={styles.connectionLeft}>
                  <View style={[styles.connectionIconWrap, { backgroundColor: colors.muted }]}>
                    <Feather
                      name="heart"
                      size={16}
                      color={isHealthKitConnected ? "#059669" : colors.mutedForeground}
                    />
                  </View>
                  <Text style={[styles.connectionName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                    Apple Health
                  </Text>
                </View>
                {isHealthKitConnected ? (
                  <View style={[styles.connectedBadge, { backgroundColor: "#DCFCE7" }]}>
                    <Feather name="check" size={12} color="#059669" />
                    <Text style={[styles.badgeText, { color: "#059669", fontFamily: "Inter_500Medium" }]}>
                      Connected
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.connectBtn, { backgroundColor: colors.primary }]}
                    onPress={() => { void handleHealthKitConnect(); }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.connectBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                      Connect
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              {isHealthKitConnected && (
                <View style={styles.hkSyncRow}>
                  <Text style={[styles.hkSyncText, { color: colors.mutedForeground }]}>
                    {isHealthKitSyncing ? "Syncing..." : `Last synced: ${formatLastSynced(healthKitLastSynced)}`}
                  </Text>
                  <TouchableOpacity
                    onPress={() => { void syncHealthKitNow(); }}
                    disabled={isHealthKitSyncing}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[
                      styles.hkSyncBtn,
                      { color: isHealthKitSyncing ? colors.mutedForeground : colors.primary },
                    ]}>
                      Sync now
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Grocery retailer connections */}
          <View style={{ marginTop: 16 }}>
            <SectionLabel label="GROCERY ORDERING" />
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, overflow: "hidden" }]}>
              {GROCERY_RETAILERS.map((retailer, idx) => {
                const isConnected = !!retailerConnected[retailer.id];
                return (
                  <View
                    key={retailer.id}
                    style={[
                      styles.connectionCardTop,
                      idx < GROCERY_RETAILERS.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.connectionLeft}>
                      <View style={[styles.connectionIconWrap, { backgroundColor: retailer.color }]}>
                        <Text style={{ fontSize: 11, color: "#fff", fontFamily: "Inter_700Bold" }}>
                          {retailer.abbr}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.connectionName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                          {retailer.name}
                        </Text>
                        {isConnected && (
                          <TouchableOpacity
                            onPress={() => void handleRetailerDisconnect(retailer.id, retailer.name)}
                            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                          >
                            <Text style={[styles.disconnectText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                              Disconnect
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    {isConnected ? (
                      <View style={[styles.connectedBadge, { backgroundColor: "#DCFCE7" }]}>
                        <Feather name="check" size={12} color="#059669" />
                        <Text style={[styles.badgeText, { color: "#059669", fontFamily: "Inter_500Medium" }]}>
                          Connected
                        </Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.connectBtn, { backgroundColor: colors.primary }]}
                        onPress={() => void handleRetailerConnect(retailer.id, retailer.name)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.connectBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                          Connect
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          </View>

          {/* Coming-soon connections */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, overflow: "hidden", marginTop: 16 }]}>
            {[
              { key: "google-fit", icon: "activity", label: "Google Fit" },
              { key: "garmin", icon: "watch", label: "Garmin Connect" },
              { key: "whoop", icon: "zap", label: "Whoop" },
            ].map((item, idx, arr) => (
              <View
                key={item.key}
                style={[
                  styles.comingSoonRow,
                  idx < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                ]}
              >
                <View style={styles.connectionLeft}>
                  <View style={[styles.connectionIconWrap, { backgroundColor: colors.muted }]}>
                    <Feather name={item.icon as any} size={16} color={colors.mutedForeground} />
                  </View>
                  <Text style={[styles.connectionName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                    {item.label}
                  </Text>
                </View>
                <View style={[styles.comingSoonBadge, { backgroundColor: colors.muted }]}>
                  <Text style={[styles.badgeText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                    Coming soon
                  </Text>
                </View>
              </View>
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
            SECTION 4 — Account Settings
        ══════════════════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <SectionLabel label="ACCOUNT" />
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, overflow: "hidden" }]}>
            <ChevronRow icon="mail" label="Email" value={email ?? undefined} onPress={() => {}} />
            <ChevronRow
              icon="lock"
              label="Change password"
              onPress={() => setShowChangePassword(true)}
            />
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
            SECTION 5 — Membership
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
            SECTION 6 — More
        ══════════════════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <SectionLabel label="MORE" />
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, overflow: "hidden" }]}>
            <ChevronRow icon="download" label="Export my data" onPress={() => Alert.alert("Coming soon")} />
            <ChevronRow icon="refresh-cw" label="Reset my data" onPress={promptResetData} accentColor="#C17B3F" />
            <ChevronRow icon="shield" label="Privacy settings" onPress={() => Alert.alert("Coming soon")} />
            <ChevronRow icon="eye" label="What Valo knows about me" onPress={() => Alert.alert("Coming soon")} />
            <ChevronRow
              icon="alert-circle"
              label="Report a bug"
              onPress={() => { void handleReportBug(); }}
              last
            />
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 7 — Sign out + danger
        ══════════════════════════════════════════════════════════════════ */}
        <View style={[styles.section, { marginBottom: 8 }]}>
          <TouchableOpacity
            style={[styles.signOutBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              Alert.alert("Sign out", "Are you sure you want to sign out?", [
                { text: "Cancel", style: "cancel" },
                { text: "Sign out", onPress: () => { void handleLogOut(); } },
              ]);
            }}
            activeOpacity={0.8}
          >
            <Feather name="log-out" size={16} color={colors.foreground} />
            <Text style={[styles.signOutText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
              Sign out
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.section, { marginBottom: 0 }]}>
          <TouchableOpacity
            style={styles.deleteAccountBtn}
            onPress={handleDeleteAccount}
            activeOpacity={0.7}
          >
            <Text style={[styles.deleteAccountText, { color: colors.destructive, fontFamily: "Inter_400Regular" }]}>
              Delete account
            </Text>
          </TouchableOpacity>
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
        getToken={getToken}
        onClose={() => setShowNotifications(false)}
      />

      <ChangePasswordModal
        visible={showChangePassword}
        getToken={getToken}
        onClose={() => setShowChangePassword(false)}
        onSuccess={() => {
          setShowChangePassword(false);
          Alert.alert("Password updated", "Your password has been changed successfully.");
        }}
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
  // Connections
  connectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  connectionCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    paddingHorizontal: 16,
  },
  connectionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  connectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  connectionName: { fontSize: 15 },
  connectionSub: { fontSize: 12, marginTop: 1 },
  connectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
  },
  badgeText: { fontSize: 11 },
  connectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  connectBtnText: { fontSize: 13 },
  hkSyncRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingHorizontal: 2,
  },
  hkSyncText: { fontSize: 12 },
  hkSyncBtn: { fontSize: 12, fontFamily: "Inter_500Medium" },
  disconnectLink: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    alignSelf: "flex-start",
  },
  disconnectText: { fontSize: 12 },
  calendarList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  calendarListHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  calendarListTitle: { fontSize: 13 },
  calendarListLoading: { fontSize: 11 },
  calendarRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    gap: 10,
  },
  calDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  calName: {
    flex: 1,
    fontSize: 14,
  },
  comingSoonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  comingSoonBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
  },
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
  // Chevron rows
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
  // Sign out / delete
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
  },
  signOutText: { fontSize: 15 },
  deleteAccountBtn: {
    alignItems: "center",
    paddingVertical: 12,
  },
  deleteAccountText: { fontSize: 14 },
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
  // Password modal
  pwdFieldWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
  },
  pwdInput: {
    flex: 1,
    fontSize: 15,
    height: 48,
  },
  pwdError: {
    fontSize: 13,
    lineHeight: 18,
  },
});
