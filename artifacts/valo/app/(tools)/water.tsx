import React, { useState } from "react";
import {
  KeyboardAvoidingView,
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

const BG = "#F7F5F2";
const CARD = "#FFFFFF";
const BORDER = "#E8E4DE";
const SLATE = "#1A1814";
const MUTED = "#8B8780";
const TERRA = "#C17B3F";
const WATER = "#5B9FB8";

type LogEntry = { id: string; time: string; label: string; cups: number };

const SEED_LOG: LogEntry[] = [
  { id: "1", time: "7:15am", label: "1 cup", cups: 1 },
  { id: "2", time: "8:30am", label: "1 cup", cups: 1 },
  { id: "3", time: "10:00am", label: "16 oz", cups: 2 },
  { id: "4", time: "12:30pm", label: "1 cup", cups: 1 },
];

const QUICK_ADDS = [
  { label: "+1 cup", cups: 1 },
  { label: "+8 oz", cups: 1 },
  { label: "+16 oz", cups: 2 },
];

export default function WaterScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [goal, setGoal] = useState(8);
  const [entries, setEntries] = useState<LogEntry[]>(SEED_LOG);
  const [customCups, setCustomCups] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const totalCups = entries.reduce((sum, e) => sum + e.cups, 0);
  const fillPct = Math.min(1, totalCups / goal);

  function addWater(cups: number, label: string) {
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    setEntries([...entries, { id: String(Date.now()), time, label, cups }]);
  }

  function undo() {
    if (entries.length === 0) return;
    setEntries(entries.slice(0, -1));
  }

  function addCustom() {
    const cups = parseFloat(customCups);
    if (!cups || cups <= 0) return;
    addWater(cups, `${cups} cup${cups !== 1 ? "s" : ""} (custom)`);
    setCustomCups("");
    setShowCustom(false);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: (Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top) + 12, borderBottomColor: BORDER }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={TERRA} />
        </TouchableOpacity>
        <Text style={[styles.title, { fontFamily: "Inter_600SemiBold" }]}>Water Tracker</Text>
        <TouchableOpacity onPress={undo} activeOpacity={0.7} style={styles.iconBtn}>
          <Feather name="rotate-ccw" size={20} color={entries.length > 0 ? WATER : BORDER} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, alignItems: "center" }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.glassWrap}>
          <View style={[styles.glass, { borderColor: WATER }]}>
            <View style={styles.glassInner}>
              <View style={{ flex: 1 - fillPct }} />
              <View style={[styles.glassFill, { flex: fillPct, backgroundColor: WATER }]} />
            </View>
            <View style={styles.glassMarks}>
              {Array.from({ length: goal - 1 }).map((_, i) => (
                <View key={i} style={[styles.mark, { borderBottomColor: `${WATER}40` }]} />
              ))}
            </View>
          </View>
          <Text style={[styles.glassCount, { fontFamily: "Inter_700Bold", color: WATER }]}>
            {totalCups.toFixed(totalCups % 1 === 0 ? 0 : 1)} / {goal}
          </Text>
          <Text style={[styles.glassLabel, { fontFamily: "Inter_400Regular" }]}>cups today</Text>
        </View>

        <View style={styles.goalRow}>
          <Text style={[styles.goalLabel, { fontFamily: "Inter_500Medium" }]}>Daily goal</Text>
          <View style={styles.stepper}>
            <TouchableOpacity onPress={() => setGoal((g) => Math.max(1, g - 1))} style={styles.stepBtn}>
              <Feather name="minus" size={16} color={WATER} />
            </TouchableOpacity>
            <Text style={[styles.goalVal, { fontFamily: "Inter_600SemiBold" }]}>{goal} cups</Text>
            <TouchableOpacity onPress={() => setGoal((g) => g + 1)} style={styles.stepBtn}>
              <Feather name="plus" size={16} color={WATER} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.quickRow}>
          {QUICK_ADDS.map((qa) => (
            <TouchableOpacity
              key={qa.label}
              onPress={() => addWater(qa.cups, qa.label.replace("+", ""))}
              activeOpacity={0.8}
              style={[styles.quickBtn, { backgroundColor: WATER }]}
            >
              <Text style={[styles.quickBtnText, { fontFamily: "Inter_600SemiBold" }]}>{qa.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() => setShowCustom((v) => !v)}
            activeOpacity={0.8}
            style={[styles.quickBtn, { backgroundColor: `${WATER}30`, borderWidth: 1, borderColor: WATER }]}
          >
            <Text style={[styles.quickBtnText, { color: WATER, fontFamily: "Inter_600SemiBold" }]}>Custom</Text>
          </TouchableOpacity>
        </View>

        {showCustom && (
          <View style={[styles.fullWidth, { marginBottom: 16 }]}>
            <View style={styles.customRow}>
              <TextInput
                placeholder="Cups (e.g. 1.5)"
                placeholderTextColor={MUTED}
                value={customCups}
                onChangeText={setCustomCups}
                keyboardType="decimal-pad"
                style={[styles.customInput, { fontFamily: "Inter_400Regular", borderColor: BORDER }]}
              />
              <TouchableOpacity onPress={addCustom} activeOpacity={0.8} style={[styles.customAddBtn, { backgroundColor: WATER }]}>
                <Text style={[styles.customAddText, { fontFamily: "Inter_600SemiBold" }]}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {entries.length > 0 && (
          <View style={[styles.fullWidth]}>
            <Text style={[styles.logHeader, { fontFamily: "Inter_600SemiBold" }]}>Today's Log</Text>
            <View style={[styles.card]}>
              {[...entries].reverse().map((entry, i) => (
                <View key={entry.id} style={[styles.logRow, { borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: BORDER }]}>
                  <Text style={[styles.logTime, { fontFamily: "Inter_400Regular" }]}>{entry.time}</Text>
                  <Feather name="droplet" size={14} color={WATER} />
                  <Text style={[styles.logLabel, { fontFamily: "Inter_400Regular" }]}>{entry.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: BG,
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, color: SLATE },
  glassWrap: { alignItems: "center", marginTop: 16, marginBottom: 24 },
  glass: {
    width: 100,
    height: 180,
    borderWidth: 3,
    borderTopWidth: 0,
    borderRadius: 4,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  glassInner: { flex: 1, flexDirection: "column" },
  glassFill: { borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
  glassMarks: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "space-between", paddingVertical: 4 },
  mark: { width: "40%", alignSelf: "flex-end", borderBottomWidth: 1 },
  glassCount: { fontSize: 32, marginTop: 12 },
  glassLabel: { fontSize: 13, color: MUTED, marginTop: 2 },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  goalLabel: { fontSize: 14, color: SLATE },
  stepper: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: `${WATER}18`, alignItems: "center", justifyContent: "center" },
  goalVal: { fontSize: 15, color: SLATE },
  quickRow: { flexDirection: "row", gap: 8, width: "100%", marginBottom: 12, flexWrap: "wrap" },
  quickBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  quickBtnText: { color: "#FFFFFF", fontSize: 13 },
  fullWidth: { width: "100%" },
  customRow: { flexDirection: "row", gap: 10 },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: SLATE,
  },
  customAddBtn: { paddingHorizontal: 20, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  customAddText: { color: "#FFFFFF", fontSize: 14 },
  logHeader: { fontSize: 13, color: SLATE, marginBottom: 10 },
  card: {
    backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  logRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  logTime: { fontSize: 12, color: MUTED, width: 60 },
  logLabel: { fontSize: 13, color: SLATE },
});
