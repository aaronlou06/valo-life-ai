import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import {
  useGetTodayLog,
  useUpsertDailyLog,
  useListLogEntries,
  useCreateLogEntry,
  getGetTodayLogQueryKey,
  getListLogEntriesQueryKey,
  getGetDashboardQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const WORKOUT_TYPES = ["Running", "Walking", "Lifting", "Yoga", "Cycling", "Swimming", "Other"];

const QUICK_LOGS = [
  { id: "workout", label: "Workout", icon: "zap", color: "#C17B3F" },
  { id: "meal", label: "Meal photo", icon: "camera", color: "#7DCB8F" },
  { id: "focus", label: "Focus session", icon: "target", color: "#5B8CDE" },
  { id: "mood", label: "Mood check", icon: "smile", color: "#DDB278" },
  { id: "water", label: "Water", icon: "droplet", color: "#5BC4DE" },
  { id: "relationship", label: "Relationship", icon: "users", color: "#E07878" },
];

const LOG_ICONS: Record<string, string> = {
  workout: "zap",
  meal: "camera",
  focus: "target",
  mood: "smile",
  water: "droplet",
  relationship: "users",
  note: "edit-3",
  "wind-down": "moon",
};

const LOG_COLORS: Record<string, string> = {
  workout: "#C17B3F",
  meal: "#7DCB8F",
  focus: "#5B8CDE",
  mood: "#DDB278",
  water: "#5BC4DE",
  relationship: "#E07878",
  note: "#7DCB8F",
  "wind-down": "#8B7EC8",
};

function SleepStepper({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const colors = useColors();
  const numVal = parseFloat(value) || 0;
  const inc = () => { const v = Math.min(14, numVal + 0.5); onChange(String(v)); };
  const dec = () => { const v = Math.max(0, numVal - 0.5); onChange(v === 0 ? "" : String(v)); };
  return (
    <View style={styles.stepper}>
      <TouchableOpacity style={[styles.stepBtn, { borderColor: colors.border }]} onPress={dec}>
        <Feather name="minus" size={16} color={colors.foreground} />
      </TouchableOpacity>
      <Text style={[styles.stepValue, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{value || "0"} hrs</Text>
      <TouchableOpacity style={[styles.stepBtn, { borderColor: colors.border }]} onPress={inc}>
        <Feather name="plus" size={16} color={colors.foreground} />
      </TouchableOpacity>
    </View>
  );
}

function EffortPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const colors = useColors();
  return (
    <View style={styles.effortRow}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <TouchableOpacity
          key={n}
          style={[styles.effortDot, { backgroundColor: value === String(n) ? colors.primary : colors.muted, borderColor: value === String(n) ? colors.primary : colors.border }]}
          onPress={() => onChange(String(n))}
        >
          <Text style={[styles.effortNum, { color: value === String(n) ? colors.primaryForeground : colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>{n}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function LogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: todayLog, isLoading: logLoading } = useGetTodayLog();
  const { data: logEntries, isLoading: entriesLoading } = useListLogEntries();
  const upsertLog = useUpsertDailyLog();
  const createEntry = useCreateLogEntry();

  const [metricsOpen, setMetricsOpen] = useState(false);
  const [sleep, setSleep] = useState("");
  const [hrv, setHrv] = useState("");
  const [rhr, setRhr] = useState("");
  const [steps, setSteps] = useState("");
  const [workoutType, setWorkoutType] = useState("");
  const [workoutDuration, setWorkoutDuration] = useState("");
  const [workoutEffort, setWorkoutEffort] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  React.useEffect(() => {
    if (todayLog && !metricsOpen) {
      if (todayLog.sleepHours != null) setSleep(String(todayLog.sleepHours));
      if (todayLog.hrv != null) setHrv(String(todayLog.hrv));
      if (todayLog.restingHeartRate != null) setRhr(String(todayLog.restingHeartRate));
      if (todayLog.steps != null) setSteps(String(todayLog.steps));
      if (todayLog.workoutType) setWorkoutType(todayLog.workoutType);
      if (todayLog.workoutDuration != null) setWorkoutDuration(String(todayLog.workoutDuration));
      if (todayLog.workoutEffort != null) setWorkoutEffort(String(todayLog.workoutEffort));
    }
  }, [todayLog]);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const tabBarH = Platform.OS === "web" ? 84 : 83;

  const handleSaveMetrics = async () => {
    setSaving(true);
    await upsertLog.mutateAsync({
      data: {
        sleepHours: sleep ? parseFloat(sleep) : null,
        hrv: hrv ? parseInt(hrv, 10) : null,
        restingHeartRate: rhr ? parseInt(rhr, 10) : null,
        steps: steps ? parseInt(steps, 10) : null,
        workoutType: workoutType || null,
        workoutDuration: workoutDuration ? parseInt(workoutDuration, 10) : null,
        workoutEffort: workoutEffort ? parseInt(workoutEffort, 10) : null,
      },
    });
    queryClient.invalidateQueries({ queryKey: getGetTodayLogQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    setSaving(false);
    setSaved(true);
    setMetricsOpen(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleQuickLog = async (id: string, label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await createEntry.mutateAsync({ data: { type: id, title: label } });
    queryClient.invalidateQueries({ queryKey: getListLogEntriesQueryKey() });
    setToast(`${label} logged`);
    setTimeout(() => setToast(null), 2000);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: bottomPad + tabBarH + 16, paddingHorizontal: 20 }}
    >
      <Text style={[styles.header, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Log</Text>

      {/* Wearable sync section */}
      <View style={[styles.wearableCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.wearableLeft}>
          <View style={[styles.wearableIcon, { backgroundColor: colors.primary + "1A" }]}>
            <Feather name="watch" size={20} color={colors.primary} />
          </View>
          <View>
            <Text style={[styles.wearableTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Sync wearable</Text>
            <Text style={[styles.wearableNote, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Wearable sync coming soon — log manually for now.</Text>
          </View>
        </View>
        <View style={[styles.comingSoonBadge, { backgroundColor: colors.muted }]}>
          <Text style={[styles.comingSoonText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Soon</Text>
        </View>
      </View>

      {/* Health metrics section */}
      <TouchableOpacity
        style={[styles.metricsHeader, { backgroundColor: colors.card, borderColor: colors.border, borderBottomLeftRadius: metricsOpen ? 0 : 14, borderBottomRightRadius: metricsOpen ? 0 : 14 }]}
        onPress={() => { setMetricsOpen((v) => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      >
        <View style={styles.metricsHeaderLeft}>
          <Feather name="activity" size={18} color={colors.primary} />
          <Text style={[styles.metricsTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Health metrics</Text>
          {saved && <View style={[styles.savedDot, { backgroundColor: "#7DCB8F" }]} />}
        </View>
        <Feather name={metricsOpen ? "chevron-up" : "chevron-down"} size={20} color={colors.mutedForeground} />
      </TouchableOpacity>

      {metricsOpen && (
        <View style={[styles.metricsForm, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Sleep hours</Text>
          <SleepStepper value={sleep} onChange={setSleep} />

          <View style={styles.rowFields}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>HRV (ms)</Text>
              <TextInput
                style={[styles.numInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                value={hrv}
                onChangeText={setHrv}
                placeholder="—"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Resting HR (bpm)</Text>
              <TextInput
                style={[styles.numInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                value={rhr}
                onChangeText={setRhr}
                placeholder="—"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
              />
            </View>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Steps</Text>
          <TextInput
            style={[styles.numInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]}
            value={steps}
            onChangeText={setSteps}
            placeholder="How many steps today?"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="numeric"
          />

          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Workout type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={styles.workoutPills}>
              {WORKOUT_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.pill, { borderColor: workoutType === type ? colors.primary : colors.border, backgroundColor: workoutType === type ? colors.primary : colors.input }]}
                  onPress={() => setWorkoutType(workoutType === type ? "" : type)}
                >
                  <Text style={[styles.pillText, { color: workoutType === type ? colors.primaryForeground : colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>{type}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {!!workoutType && (
            <>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Duration (min)</Text>
              <TextInput
                style={[styles.numInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular", marginBottom: 16 }]}
                value={workoutDuration}
                onChangeText={setWorkoutDuration}
                placeholder="How long?"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
              />

              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Perceived effort (1–10)</Text>
              <EffortPicker value={workoutEffort} onChange={setWorkoutEffort} />
            </>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
            onPress={handleSaveMetrics}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.saveBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>Save metrics</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Quick log grid */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 24 }]}>QUICK LOG</Text>
      <View style={styles.quickGrid}>
        {QUICK_LOGS.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.quickBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => handleQuickLog(item.id, item.label)}
          >
            <View style={[styles.quickIcon, { backgroundColor: item.color + "22" }]}>
              <Feather name={item.icon as any} size={20} color={item.color} />
            </View>
            <Text style={[styles.quickLabel, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Today's entries */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 24 }]}>TODAY'S LOG</Text>

      {entriesLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
      ) : !logEntries || logEntries.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="inbox" size={24} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Nothing logged yet today.</Text>
        </View>
      ) : (
        logEntries.map((entry) => (
          <View key={entry.id} style={[styles.entryRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.entryIcon, { backgroundColor: (LOG_COLORS[entry.type] ?? colors.primary) + "22" }]}>
              <Feather name={(LOG_ICONS[entry.type] ?? "circle") as any} size={18} color={LOG_COLORS[entry.type] ?? colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.entryTitle, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>{entry.title}</Text>
              {entry.subtitle && <Text style={[styles.entrySub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{entry.subtitle}</Text>}
            </View>
            {entry.value && <Text style={[styles.entryValue, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>{entry.value}</Text>}
          </View>
        ))
      )}

      {!!toast && (
        <View style={[styles.toast, { backgroundColor: colors.primary }]}>
          <Feather name="check" size={14} color={colors.primaryForeground} />
          <Text style={[styles.toastText, { color: colors.primaryForeground, fontFamily: "Inter_500Medium" }]}>{toast}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 28, marginBottom: 16 },
  wearableCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 14 },
  wearableLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  wearableIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  wearableTitle: { fontSize: 14, marginBottom: 2 },
  wearableNote: { fontSize: 12, lineHeight: 17 },
  comingSoonBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  comingSoonText: { fontSize: 11 },
  metricsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: 14, marginBottom: 0 },
  metricsHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  metricsTitle: { fontSize: 15 },
  savedDot: { width: 8, height: 8, borderRadius: 4 },
  metricsForm: { borderWidth: 1, borderTopWidth: 0, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, padding: 16, marginBottom: 2 },
  fieldLabel: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  numInput: { height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15, marginBottom: 12 },
  rowFields: { flexDirection: "row", gap: 10 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 12 },
  stepBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  stepValue: { fontSize: 17, minWidth: 80, textAlign: "center" },
  workoutPills: { flexDirection: "row", gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  pillText: { fontSize: 13 },
  effortRow: { flexDirection: "row", gap: 6, marginBottom: 16, flexWrap: "wrap" },
  effortDot: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  effortNum: { fontSize: 13 },
  saveBtn: { height: 46, borderRadius: 12, justifyContent: "center", alignItems: "center", marginTop: 4 },
  saveBtnText: { fontSize: 15 },
  sectionLabel: { fontSize: 12, letterSpacing: 0.8, marginBottom: 12 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quickBtn: { width: "30%", flexGrow: 1, padding: 14, borderRadius: 14, borderWidth: 1, alignItems: "center", gap: 8 },
  quickIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  quickLabel: { fontSize: 12, textAlign: "center" },
  emptyCard: { borderRadius: 14, borderWidth: 1, padding: 24, alignItems: "center", gap: 10 },
  emptyText: { fontSize: 14, textAlign: "center" },
  entryRow: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 8, gap: 12 },
  entryIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  entryTitle: { fontSize: 14, marginBottom: 2 },
  entrySub: { fontSize: 12 },
  entryValue: { fontSize: 14 },
  toast: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, alignSelf: "center", marginTop: 16 },
  toastText: { fontSize: 14 },
});
