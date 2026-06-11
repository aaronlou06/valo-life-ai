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
const AMBER = "#D4A847";

type MacroEntry = { id: string; name: string; protein: number; carbs: number; fat: number; kcal: number; slot: string };

const SEED_LOG: MacroEntry[] = [
  { id: "1", name: "Greek Yogurt & Berries", protein: 18, carbs: 32, fat: 5, kcal: 245, slot: "Breakfast" },
  { id: "2", name: "Grilled Chicken Salad", protein: 38, carbs: 18, fat: 14, kcal: 346, slot: "Lunch" },
  { id: "3", name: "Almonds", protein: 6, carbs: 6, fat: 14, kcal: 170, slot: "Snacks" },
];

const SLOTS = ["Breakfast", "Lunch", "Dinner", "Snacks"];

const GOALS = { protein: 140, carbs: 200, fat: 60, kcal: 2000 };

export default function FoodLogScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [log, setLog] = useState<MacroEntry[]>(SEED_LOG);
  const [showManual, setShowManual] = useState(false);
  const [photoState, setPhotoState] = useState<"idle" | "loading" | "result">("idle");
  const [name, setName] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [slot, setSlot] = useState("Breakfast");

  const totals = log.reduce(
    (acc, e) => ({ protein: acc.protein + e.protein, carbs: acc.carbs + e.carbs, fat: acc.fat + e.fat, kcal: acc.kcal + e.kcal }),
    { protein: 0, carbs: 0, fat: 0, kcal: 0 }
  );

  function addManual() {
    if (!name.trim()) return;
    setLog([...log, {
      id: String(Date.now()),
      name: name.trim(),
      protein: parseInt(protein) || 0,
      carbs: parseInt(carbs) || 0,
      fat: parseInt(fat) || 0,
      kcal: parseInt(protein || "0") * 4 + parseInt(carbs || "0") * 4 + parseInt(fat || "0") * 9,
      slot,
    }]);
    setName(""); setProtein(""); setCarbs(""); setFat("");
    setShowManual(false);
  }

  async function snapPhoto() {
    // TODO: wire expo-image-picker + Claude vision macros
    try {
      const ImagePicker = await import("expo-image-picker");
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (!result.canceled) {
        setPhotoState("loading");
        setTimeout(() => setPhotoState("result"), 1500);
      }
    } catch {
      setPhotoState("loading");
      setTimeout(() => setPhotoState("result"), 1500);
    }
  }

  function addPhotoResult() {
    setLog([...log, { id: String(Date.now()), name: "Photo estimate", protein: 30, carbs: 45, fat: 12, kcal: 420, slot: "Lunch" }]);
    setPhotoState("idle");
  }

  const macroRows: Array<{ label: string; key: keyof typeof totals; color: string }> = [
    { label: "Protein", key: "protein", color: "#5B7FA6" },
    { label: "Carbs", key: "carbs", color: AMBER },
    { label: "Fat", key: "fat", color: TERRA },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: BORDER }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={TERRA} />
        </TouchableOpacity>
        <Text style={[styles.title, { fontFamily: "Inter_600SemiBold" }]}>Food Logging</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.card, { padding: 16, marginBottom: 20 }]}>
          <View style={styles.kcalRow}>
            <Text style={[styles.kcalVal, { fontFamily: "Inter_700Bold", color: AMBER }]}>{totals.kcal}</Text>
            <Text style={[styles.kcalLabel, { fontFamily: "Inter_400Regular" }]}>/ {GOALS.kcal} kcal</Text>
          </View>
          {macroRows.map((m) => (
            <View key={m.label} style={{ marginBottom: 10 }}>
              <View style={styles.macroRow}>
                <Text style={[styles.macroLabel, { fontFamily: "Inter_500Medium" }]}>{m.label}</Text>
                <Text style={[styles.macroVal, { fontFamily: "Inter_400Regular" }]}>
                  {totals[m.key]}g / {GOALS[m.key]}g
                </Text>
              </View>
              <View style={[styles.barBg, { backgroundColor: `${m.color}22` }]}>
                <View
                  style={[
                    styles.barFill,
                    { backgroundColor: m.color, width: `${Math.min(100, (totals[m.key] / GOALS[m.key]) * 100)}%` },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>

        {SLOTS.map((slotName) => {
          const slotEntries = log.filter((e) => e.slot === slotName);
          return (
            <View key={slotName} style={{ marginBottom: 16 }}>
              <Text style={[styles.slotHeader, { fontFamily: "Inter_600SemiBold" }]}>{slotName}</Text>
              {slotEntries.length === 0 ? (
                <Text style={[styles.emptySlot, { fontFamily: "Inter_400Regular" }]}>Nothing logged yet</Text>
              ) : (
                <View style={[styles.card]}>
                  {slotEntries.map((entry, i) => (
                    <View key={entry.id} style={[styles.entryRow, { borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: BORDER }]}>
                      <Text style={[styles.entryName, { fontFamily: "Inter_600SemiBold" }]}>{entry.name}</Text>
                      <Text style={[styles.entryMacros, { fontFamily: "Inter_400Regular" }]}>
                        P {entry.protein} · C {entry.carbs} · F {entry.fat} · {entry.kcal} kcal
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {photoState === "loading" && (
          <View style={[styles.card, styles.shimmer]}>
            <Text style={[styles.shimmerText, { fontFamily: "Inter_400Regular" }]}>Analyzing photo...</Text>
          </View>
        )}

        {photoState === "result" && (
          <View style={[styles.card, { padding: 16, marginBottom: 12 }]}>
            <Text style={[styles.estimatedLabel, { fontFamily: "Inter_600SemiBold" }]}>Estimated macros</Text>
            <Text style={[styles.estimatedMacros, { fontFamily: "Inter_400Regular" }]}>P 30 · C 45 · F 12 · 420 kcal</Text>
            <Text style={[styles.estimatedNote, { fontFamily: "Inter_400Regular" }]}>Photo estimate — tap to add</Text>
            <TouchableOpacity onPress={addPhotoResult} activeOpacity={0.8} style={styles.addEstBtn}>
              <Text style={[styles.addEstText, { fontFamily: "Inter_600SemiBold" }]}>Add to log</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.addRow}>
          <TouchableOpacity onPress={() => setShowManual((v) => !v)} activeOpacity={0.8} style={[styles.addBtn, { backgroundColor: TERRA }]}>
            <Feather name="edit-3" size={16} color="#FFFFFF" />
            <Text style={[styles.addBtnText, { fontFamily: "Inter_600SemiBold" }]}>Log manually</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={snapPhoto} activeOpacity={0.8} style={[styles.addBtn, { backgroundColor: `${AMBER}CC` }]}>
            <Feather name="camera" size={16} color="#FFFFFF" />
            <Text style={[styles.addBtnText, { fontFamily: "Inter_600SemiBold" }]}>Snap photo</Text>
          </TouchableOpacity>
        </View>

        {showManual && (
          <View style={[styles.card, { padding: 14 }]}>
            <TextInput placeholder="Food name" placeholderTextColor={MUTED} value={name} onChangeText={setName} style={[styles.input, { fontFamily: "Inter_400Regular" }]} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput placeholder="Protein (g)" placeholderTextColor={MUTED} value={protein} onChangeText={setProtein} keyboardType="number-pad" style={[styles.input, { flex: 1, fontFamily: "Inter_400Regular" }]} />
              <TextInput placeholder="Carbs (g)" placeholderTextColor={MUTED} value={carbs} onChangeText={setCarbs} keyboardType="number-pad" style={[styles.input, { flex: 1, fontFamily: "Inter_400Regular" }]} />
              <TextInput placeholder="Fat (g)" placeholderTextColor={MUTED} value={fat} onChangeText={setFat} keyboardType="number-pad" style={[styles.input, { flex: 1, fontFamily: "Inter_400Regular" }]} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 12 }}>
              {SLOTS.map((s) => (
                <TouchableOpacity key={s} onPress={() => setSlot(s)} activeOpacity={0.7}
                  style={[styles.slotChip, { backgroundColor: slot === s ? AMBER : "#F7F5F2", borderColor: slot === s ? AMBER : BORDER }]}>
                  <Text style={[styles.slotChipText, { color: slot === s ? "#FFFFFF" : MUTED, fontFamily: "Inter_500Medium" }]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={addManual} activeOpacity={0.8} style={[styles.saveBtn, { backgroundColor: TERRA }]}>
              <Text style={[styles.saveBtnText, { fontFamily: "Inter_600SemiBold" }]}>Add entry</Text>
            </TouchableOpacity>
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
  card: {
    backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
    marginBottom: 12,
  },
  kcalRow: { flexDirection: "row", alignItems: "baseline", gap: 4, marginBottom: 16 },
  kcalVal: { fontSize: 36 },
  kcalLabel: { fontSize: 14, color: MUTED },
  macroRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  macroLabel: { fontSize: 13, color: SLATE },
  macroVal: { fontSize: 12, color: MUTED },
  barBg: { height: 6, borderRadius: 3, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3 },
  slotHeader: { fontSize: 13, color: SLATE, marginBottom: 8 },
  emptySlot: { fontSize: 13, color: MUTED, fontStyle: "italic", marginBottom: 4 },
  entryRow: { padding: 14 },
  entryName: { fontSize: 14, color: SLATE, marginBottom: 4 },
  entryMacros: { fontSize: 12, color: MUTED },
  shimmer: { padding: 20, alignItems: "center", marginBottom: 12 },
  shimmerText: { fontSize: 13, color: MUTED },
  estimatedLabel: { fontSize: 14, color: SLATE, marginBottom: 4 },
  estimatedMacros: { fontSize: 15, color: SLATE, marginBottom: 4 },
  estimatedNote: { fontSize: 12, color: MUTED, marginBottom: 12 },
  addEstBtn: { backgroundColor: AMBER, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  addEstText: { color: "#FFFFFF", fontSize: 14 },
  addRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  addBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 12 },
  addBtnText: { color: "#FFFFFF", fontSize: 13 },
  input: { borderWidth: 1, borderColor: BORDER, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: SLATE, marginBottom: 8 },
  slotChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, marginRight: 8 },
  slotChipText: { fontSize: 12 },
  saveBtn: { borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  saveBtnText: { color: "#FFFFFF", fontSize: 14 },
});
