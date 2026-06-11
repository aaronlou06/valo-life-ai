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
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";

const SLATE = "#5B7FA6";
const TERRACOTTA = "#C17B3F";

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 7am – 10pm

function fmtHour(h: number): string {
  const period = h >= 12 ? "pm" : "am";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${period}`;
}

interface Block {
  id: string;
  label: string;
  start: number;
  end: number;
}

const SEED: Block[] = [
  { id: "b1", label: "Deep Work", start: 9, end: 11 },
  { id: "b2", label: "Lunch", start: 12, end: 13 },
  { id: "b3", label: "Strategy sync", start: 15, end: 16 },
];

export default function TimeManagementScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [blocks, setBlocks] = useState<Block[]>(SEED);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const blockAt = (hour: number) =>
    blocks.find((b) => hour >= b.start && hour < b.end);

  const saveBlock = () => {
    const s = parseInt(start, 10);
    const e = parseInt(end, 10);
    if (!label.trim() || isNaN(s) || isNaN(e) || e <= s) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBlocks((prev) => [...prev, { id: `b${Date.now()}`, label: label.trim(), start: s, end: e }]);
    setLabel("");
    setStart("");
    setEnd("");
    setAdding(false);
  };

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Time Management
        </Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        >
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            TODAY'S BLOCKS
          </Text>

          <View style={[styles.timeline, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {HOURS.map((h) => {
              const block = blockAt(h);
              const isStart = block && block.start === h;
              return (
                <View key={h} style={[styles.row, { borderTopColor: colors.border }]}>
                  <Text style={[styles.hourLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    {fmtHour(h)}
                  </Text>
                  <View style={styles.slot}>
                    {block && (
                      <View style={[styles.blockFill, { backgroundColor: `${SLATE}33`, borderLeftColor: SLATE }]}>
                        {isStart && (
                          <Text style={[styles.blockText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                            {block.label}  ·  {fmtHour(block.start)}–{fmtHour(block.end)}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          {adding ? (
            <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TextInput
                value={label}
                onChangeText={setLabel}
                placeholder="Block label"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.input, fontFamily: "Inter_400Regular" }]}
                autoFocus
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TextInput
                  value={start}
                  onChangeText={setStart}
                  placeholder="Start (e.g. 14)"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  style={[styles.input, { flex: 1, color: colors.foreground, backgroundColor: colors.input, fontFamily: "Inter_400Regular" }]}
                />
                <TextInput
                  value={end}
                  onChangeText={setEnd}
                  placeholder="End (e.g. 16)"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  style={[styles.input, { flex: 1, color: colors.foreground, backgroundColor: colors.input, fontFamily: "Inter_400Regular" }]}
                />
              </View>
              <View style={styles.formActions}>
                <TouchableOpacity onPress={() => { setAdding(false); setLabel(""); setStart(""); setEnd(""); }} style={styles.cancelBtn}>
                  <Text style={[styles.cancelText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveBlock} style={[styles.saveBtn, { backgroundColor: TERRACOTTA }]}>
                  <Text style={[styles.saveText, { fontFamily: "Inter_600SemiBold" }]}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setAdding(true)}
              activeOpacity={0.7}
              style={[styles.addRow, { borderColor: colors.border }]}
            >
              <Feather name="plus" size={18} color={SLATE} />
              <Text style={[styles.addText, { color: SLATE, fontFamily: "Inter_500Medium" }]}>Add a block</Text>
            </TouchableOpacity>
          )}

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 24 }]}>
            FOCUS SESSION
          </Text>
          <View style={[styles.focusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.timer, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>25:00</Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
              style={[styles.focusBtn, { backgroundColor: TERRACOTTA }]}
            >
              <Feather name="play" size={16} color="#FFFFFF" />
              <Text style={[styles.focusBtnText, { fontFamily: "Inter_600SemiBold" }]}>Start Focus</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7}>
              <Text style={[styles.customizeLink, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                Customize
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18 },
  sectionLabel: { fontSize: 11, letterSpacing: 0.6, marginBottom: 10 },
  timeline: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "stretch", minHeight: 34, borderTopWidth: StyleSheet.hairlineWidth },
  hourLabel: { width: 52, fontSize: 11, paddingLeft: 12, paddingTop: 9 },
  slot: { flex: 1, paddingVertical: 3, paddingRight: 10, justifyContent: "center" },
  blockFill: {
    flex: 1,
    minHeight: 28,
    borderLeftWidth: 3,
    borderRadius: 6,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  blockText: { fontSize: 12 },
  formCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 10, marginTop: 12 },
  input: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  formActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 9 },
  cancelText: { fontSize: 13 },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 8 },
  saveText: { fontSize: 13, color: "#FFFFFF" },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    paddingVertical: 14,
    marginTop: 12,
  },
  addText: { fontSize: 14 },
  focusCard: { borderRadius: 12, borderWidth: 1, padding: 22, alignItems: "center", gap: 16 },
  timer: { fontSize: 48, letterSpacing: 1 },
  focusBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  focusBtnText: { fontSize: 15, color: "#FFFFFF" },
  customizeLink: { fontSize: 13 },
});
