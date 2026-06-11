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
const BLUE = "#5B7FA6";

type Block = { id: string; label: string; start: string; end: string };

const SEED_BLOCKS: Block[] = [
  { id: "1", label: "Deep Work", start: "9:00am", end: "11:00am" },
  { id: "2", label: "Lunch", start: "12:00pm", end: "1:00pm" },
  { id: "3", label: "Email & Admin", start: "4:00pm", end: "5:00pm" },
];

const SUGGESTIONS = [
  { id: "1", text: "You have a 2-hour gap at 2pm — block it for the project?" },
  { id: "2", text: "No wind-down block scheduled — protect 9pm for rest?" },
  { id: "3", text: "Morning slot open 7–9am — ideal for deep focus." },
];

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7);

function hourLabel(h: number) {
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

export default function TimeManagementScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [blocks, setBlocks] = useState<Block[]>(SEED_BLOCKS);
  const [suggestions, setSuggestions] = useState(SUGGESTIONS);
  const [label, setLabel] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [showForm, setShowForm] = useState(false);

  function addBlock() {
    if (!label.trim() || !start.trim() || !end.trim()) return;
    setBlocks([...blocks, { id: String(Date.now()), label: label.trim(), start: start.trim(), end: end.trim() }]);
    setLabel(""); setStart(""); setEnd("");
    setShowForm(false);
  }

  function addSuggestion(id: string) {
    const s = suggestions.find((x) => x.id === id);
    if (!s) return;
    setBlocks([...blocks, { id: String(Date.now()), label: s.text.split(" — ")[0]?.split("for ")[1]?.replace("?", "") ?? "New Block", start: "2:00pm", end: "4:00pm" }]);
    setSuggestions(suggestions.filter((x) => x.id !== id));
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: BORDER }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={TERRA} />
        </TouchableOpacity>
        <Text style={[styles.title, { fontFamily: "Inter_600SemiBold" }]}>Time Management</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.sectionLabel, { fontFamily: "Inter_600SemiBold" }]}>Today's Blocks</Text>

        <View style={[styles.timeline, { borderColor: BORDER }]}>
          {HOURS.map((h) => {
            const block = blocks.find((b) => b.start.startsWith(`${h === 12 ? 12 : h > 12 ? h - 12 : h}:`));
            return (
              <View key={h} style={styles.hourRow}>
                <Text style={[styles.hourLabel, { fontFamily: "Inter_400Regular" }]}>{hourLabel(h)}</Text>
                {block ? (
                  <View style={[styles.blockBar, { backgroundColor: `${BLUE}22`, borderLeftColor: BLUE }]}>
                    <Text style={[styles.blockText, { fontFamily: "Inter_600SemiBold" }]}>
                      {block.label}
                    </Text>
                    <Text style={[styles.blockMeta, { fontFamily: "Inter_400Regular" }]}>
                      {block.start} – {block.end}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.emptySlot} />
                )}
              </View>
            );
          })}
        </View>

        <TouchableOpacity
          onPress={() => setShowForm((v) => !v)}
          activeOpacity={0.8}
          style={[styles.addBtn, { borderColor: BLUE }]}
        >
          <Feather name="plus" size={16} color={BLUE} />
          <Text style={[styles.addBtnText, { color: BLUE, fontFamily: "Inter_600SemiBold" }]}>
            Add Block
          </Text>
        </TouchableOpacity>

        {showForm && (
          <View style={[styles.card, { padding: 14, marginBottom: 16 }]}>
            <TextInput
              placeholder="Label (e.g. Deep Work)"
              placeholderTextColor={MUTED}
              value={label}
              onChangeText={setLabel}
              style={[styles.input, { fontFamily: "Inter_400Regular" }]}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                placeholder="Start (e.g. 9:00am)"
                placeholderTextColor={MUTED}
                value={start}
                onChangeText={setStart}
                style={[styles.input, { flex: 1, fontFamily: "Inter_400Regular" }]}
              />
              <TextInput
                placeholder="End"
                placeholderTextColor={MUTED}
                value={end}
                onChangeText={setEnd}
                style={[styles.input, { flex: 1, fontFamily: "Inter_400Regular" }]}
              />
            </View>
            <TouchableOpacity onPress={addBlock} activeOpacity={0.8} style={styles.saveBtn}>
              <Text style={[styles.saveBtnText, { fontFamily: "Inter_600SemiBold" }]}>Save Block</Text>
            </TouchableOpacity>
          </View>
        )}

        {suggestions.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { fontFamily: "Inter_600SemiBold", marginTop: 8 }]}>
              Valo Suggests
            </Text>
            <View style={[styles.card, { padding: 0, overflow: "hidden" }]}>
              {suggestions.map((s, i) => (
                <View
                  key={s.id}
                  style={[
                    styles.suggestionRow,
                    { borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: BORDER },
                  ]}
                >
                  <Text style={[styles.suggestionText, { fontFamily: "Inter_400Regular" }]}>{s.text}</Text>
                  <TouchableOpacity
                    onPress={() => addSuggestion(s.id)}
                    activeOpacity={0.7}
                    style={[styles.suggAddBtn, { backgroundColor: `${BLUE}18` }]}
                  >
                    <Text style={[styles.suggAddText, { color: BLUE, fontFamily: "Inter_600SemiBold" }]}>Add</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
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
  sectionLabel: { fontSize: 13, color: SLATE, marginBottom: 12 },
  timeline: {
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  hourRow: { flexDirection: "row", alignItems: "center", minHeight: 36, gap: 10 },
  hourLabel: { fontSize: 11, color: MUTED, width: 40 },
  blockBar: { flex: 1, borderLeftWidth: 3, borderLeftColor: BLUE, paddingLeft: 8, paddingVertical: 4, borderRadius: 4 },
  blockText: { fontSize: 13, color: SLATE },
  blockMeta: { fontSize: 11, color: MUTED },
  emptySlot: { flex: 1, height: 1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 16,
  },
  addBtnText: { fontSize: 14 },
  card: {
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: SLATE,
    marginBottom: 8,
  },
  saveBtn: { backgroundColor: TERRA, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  saveBtnText: { color: "#FFFFFF", fontSize: 14 },
  suggestionRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  suggestionText: { flex: 1, fontSize: 13, color: SLATE, lineHeight: 18 },
  suggAddBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  suggAddText: { fontSize: 13 },
});
