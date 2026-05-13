import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  Modal,
  FlatList,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useValoAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Madrid",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Colombo",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Perth",
  "Pacific/Auckland",
];

function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/New_York";
  }
}

function TimePicker({
  value,
  onChange,
  colors,
}: {
  value: string;
  onChange: (v: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const parts = value.split(":");
  const hh = parseInt(parts[0] ?? "20", 10);
  const mm = parseInt(parts[1] ?? "0", 10);

  const setHH = (h: number) => {
    const clamped = ((h % 24) + 24) % 24;
    onChange(`${String(clamped).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  };
  const setMM = (m: number) => {
    const clamped = ((m % 60) + 60) % 60;
    onChange(`${String(hh).padStart(2, "0")}:${String(clamped).padStart(2, "0")}`);
  };

  return (
    <View style={styles.timePicker}>
      <View style={styles.timeColumn}>
        <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setHH(hh + 1); }} style={[styles.timeArrow, { borderColor: colors.border }]}>
          <Feather name="chevron-up" size={18} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.timeDigit, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>{String(hh).padStart(2, "0")}</Text>
        <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setHH(hh - 1); }} style={[styles.timeArrow, { borderColor: colors.border }]}>
          <Feather name="chevron-down" size={18} color={colors.foreground} />
        </TouchableOpacity>
      </View>
      <Text style={[styles.timeColon, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>:</Text>
      <View style={styles.timeColumn}>
        <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMM(mm + 5); }} style={[styles.timeArrow, { borderColor: colors.border }]}>
          <Feather name="chevron-up" size={18} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.timeDigit, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>{String(mm).padStart(2, "0")}</Text>
        <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMM(mm - 5); }} style={[styles.timeArrow, { borderColor: colors.border }]}>
          <Feather name="chevron-down" size={18} color={colors.foreground} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useValoAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [preferredCallTime, setPreferredCallTime] = useState("20:00");
  const [callTimezone, setCallTimezone] = useState(getDeviceTimezone());
  const [callsEnabled, setCallsEnabled] = useState(false);
  const [tzModalVisible, setTzModalVisible] = useState(false);
  const [tzSearch, setTzSearch] = useState("");

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const apiBase = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${apiBase}/api/settings`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json() as {
          phoneNumber: string | null;
          preferredCallTime: string | null;
          callTimezone: string | null;
          callsEnabled: boolean;
        };
        if (data.phoneNumber) setPhoneNumber(data.phoneNumber);
        if (data.preferredCallTime) setPreferredCallTime(data.preferredCallTime);
        if (data.callTimezone) setCallTimezone(data.callTimezone);
        setCallsEnabled(data.callsEnabled ?? false);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [getToken, apiBase]);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${apiBase}/api/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          phoneNumber: phoneNumber.trim() || null,
          preferredCallTime,
          callTimezone,
          callsEnabled,
        }),
      });
      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Saved", "Your call settings have been saved.", [{ text: "OK", onPress: () => router.back() }]);
      } else {
        Alert.alert("Error", "Failed to save settings. Please try again.");
      }
    } catch {
      Alert.alert("Error", "Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [getToken, apiBase, phoneNumber, preferredCallTime, callTimezone, callsEnabled, router]);

  const filteredTz = COMMON_TIMEZONES.filter((tz) =>
    tz.toLowerCase().includes(tzSearch.toLowerCase())
  );

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{
          paddingTop: topPad + 16,
          paddingBottom: bottomPad + 40,
          paddingHorizontal: 20,
        }}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.header, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Settings
          </Text>
          <View style={{ width: 32 }} />
        </View>

        {/* Daily Call section */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          DAILY CALL
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>

          {/* Enable toggle */}
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                Enable daily debrief call
              </Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Valo will call you each day at your chosen time
              </Text>
            </View>
            <Switch
              value={callsEnabled}
              onValueChange={(v) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setCallsEnabled(v);
              }}
              trackColor={{ false: colors.muted, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Phone number */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              Phone number
            </Text>
            <TextInput
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="+1 555 000 0000"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="phone-pad"
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, fontFamily: "Inter_400Regular" }]}
            />
            <Text style={[styles.fieldHint, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Include country code (e.g. +1 for US)
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Call time */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              Call time (24-hour)
            </Text>
            <TimePicker value={preferredCallTime} onChange={setPreferredCallTime} colors={colors} />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Timezone */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
              Timezone
            </Text>
            <TouchableOpacity
              style={[styles.tzSelector, { borderColor: colors.border, backgroundColor: colors.background }]}
              onPress={() => { setTzSearch(""); setTzModalVisible(true); }}
            >
              <Text style={[styles.tzText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]} numberOfLines={1}>
                {callTimezone}
              </Text>
              <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Save button */}
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
          onPress={save}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <Text style={[styles.saveBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
              Save settings
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Timezone picker modal */}
      <Modal
        visible={tzModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setTzModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              Select timezone
            </Text>
            <TouchableOpacity onPress={() => setTzModalVisible(false)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <View style={[styles.tzSearchRow, { borderColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
            <TextInput
              value={tzSearch}
              onChangeText={setTzSearch}
              placeholder="Search timezones..."
              placeholderTextColor={colors.mutedForeground}
              style={[styles.tzSearchInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
              autoFocus
            />
          </View>
          <FlatList
            data={filteredTz}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.tzItem,
                  {
                    borderColor: colors.border,
                    backgroundColor: item === callTimezone ? colors.secondary : "transparent",
                  },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setCallTimezone(item);
                  setTzModalVisible(false);
                }}
              >
                <Text style={[styles.tzItemText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                  {item}
                </Text>
                {item === callTimezone && (
                  <Feather name="check" size={16} color={colors.primary} />
                )}
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  backBtn: { padding: 4 },
  header: { fontSize: 22 },

  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.9,
    marginBottom: 10,
  },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 24,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  rowLabel: { fontSize: 15, marginBottom: 2 },
  rowSub: { fontSize: 13, lineHeight: 18 },

  fieldGroup: { paddingHorizontal: 16, paddingVertical: 16 },
  fieldLabel: { fontSize: 12, letterSpacing: 0.6, marginBottom: 10 },
  fieldHint: { fontSize: 12, marginTop: 6 },

  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
  },

  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },

  timePicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timeColumn: { alignItems: "center", gap: 4 },
  timeArrow: {
    width: 44,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  timeDigit: { fontSize: 32, lineHeight: 40 },
  timeColon: { fontSize: 32, marginBottom: 4 },

  tzSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  tzText: { flex: 1, fontSize: 15, marginRight: 8 },

  saveBtn: {
    height: 54,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  saveBtnText: { fontSize: 16 },

  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 18 },

  tzSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tzSearchInput: { flex: 1, fontSize: 15, height: 36 },

  tzItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tzItemText: { fontSize: 15 },
});
