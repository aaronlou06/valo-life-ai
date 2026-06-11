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
const SAGE = "#6B9E78";
const AMBER = "#D4A847";

type Status = "In Progress" | "Done" | "Overdue";

type Commitment = {
  id: string;
  text: string;
  dueDate: string;
  status: Status;
};

const SEED: Commitment[] = [
  { id: "1", text: "Finish the Q2 strategy document", dueDate: "Jun 12", status: "In Progress" },
  { id: "2", text: "Call a friend I've been meaning to reconnect with", dueDate: "Jun 10", status: "Overdue" },
  { id: "3", text: "Run 3 times this week", dueDate: "Jun 14", status: "In Progress" },
];

const STATUS_COLOR: Record<Status, string> = {
  "In Progress": AMBER,
  Done: SAGE,
  Overdue: TERRA,
};

export default function AccountabilityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [commitments, setCommitments] = useState<Commitment[]>(SEED);
  const [newText, setNewText] = useState("");
  const [newDate, setNewDate] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const active = commitments.filter((c) => c.status !== "Done");
  const completed = commitments.filter((c) => c.status === "Done");

  function toggleDone(id: string) {
    setCommitments(
      commitments.map((c) =>
        c.id === id ? { ...c, status: c.status === "Done" ? "In Progress" : "Done" } : c
      )
    );
  }

  function addCommitment() {
    if (!newText.trim()) return;
    setCommitments([
      ...commitments,
      { id: String(Date.now()), text: newText.trim(), dueDate: newDate.trim() || "No date", status: "In Progress" },
    ]);
    setNewText(""); setNewDate("");
    setShowForm(false);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: BG }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: (Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top) + 12, borderBottomColor: BORDER }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={TERRA} />
        </TouchableOpacity>
        <Text style={[styles.title, { fontFamily: "Inter_600SemiBold" }]}>Accountability</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.nudgeBanner]}>
          <Feather name="zap" size={18} color={TERRA} />
          <Text style={[styles.nudgeText, { fontFamily: "Inter_500Medium" }]}>
            You've completed {completed.length} of {commitments.length} commitments this week. Keep going.
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { fontFamily: "Inter_600SemiBold" }]}>Active Commitments</Text>

        {active.map((c) => (
          <TouchableOpacity
            key={c.id}
            onPress={() => toggleDone(c.id)}
            activeOpacity={0.8}
            style={[styles.card]}
          >
            <View style={styles.cardTop}>
              <Text style={[styles.commitText, { fontFamily: "Inter_500Medium" }]}>{c.text}</Text>
              <View style={[styles.statusPill, { backgroundColor: `${STATUS_COLOR[c.status]}22` }]}>
                <Text style={[styles.statusText, { color: STATUS_COLOR[c.status], fontFamily: "Inter_600SemiBold" }]}>
                  {c.status}
                </Text>
              </View>
            </View>
            <View style={styles.cardBottom}>
              <Feather name="calendar" size={12} color={MUTED} />
              <Text style={[styles.dueDateText, { fontFamily: "Inter_400Regular" }]}>Due {c.dueDate}</Text>
              <Text style={[styles.tapHint, { fontFamily: "Inter_400Regular" }]}>Tap to mark done</Text>
            </View>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          onPress={() => setShowForm((v) => !v)}
          activeOpacity={0.8}
          style={[styles.addBtn, { borderColor: TERRA }]}
        >
          <Feather name="plus" size={16} color={TERRA} />
          <Text style={[styles.addBtnText, { color: TERRA, fontFamily: "Inter_600SemiBold" }]}>
            Add commitment
          </Text>
        </TouchableOpacity>

        {showForm && (
          <View style={[styles.card, { padding: 14 }]}>
            <TextInput
              placeholder="What do you commit to?"
              placeholderTextColor={MUTED}
              value={newText}
              onChangeText={setNewText}
              multiline
              style={[styles.input, { fontFamily: "Inter_400Regular" }]}
            />
            <TextInput
              placeholder="Due date (e.g. Jun 20)"
              placeholderTextColor={MUTED}
              value={newDate}
              onChangeText={setNewDate}
              style={[styles.input, { fontFamily: "Inter_400Regular" }]}
            />
            <TouchableOpacity onPress={addCommitment} activeOpacity={0.8} style={styles.saveBtn}>
              <Text style={[styles.saveBtnText, { fontFamily: "Inter_600SemiBold" }]}>Save</Text>
            </TouchableOpacity>
          </View>
        )}

        {completed.length > 0 && (
          <>
            <TouchableOpacity
              onPress={() => setShowCompleted((v) => !v)}
              activeOpacity={0.7}
              style={styles.completedToggle}
            >
              <Text style={[styles.sectionLabel, { fontFamily: "Inter_600SemiBold" }]}>
                Completed ({completed.length})
              </Text>
              <Feather name={showCompleted ? "chevron-up" : "chevron-down"} size={16} color={MUTED} />
            </TouchableOpacity>

            {showCompleted && completed.map((c) => (
              <TouchableOpacity
                key={c.id}
                onPress={() => toggleDone(c.id)}
                activeOpacity={0.7}
                style={[styles.card, styles.doneCard]}
              >
                <Feather name="check-circle" size={16} color={SAGE} />
                <Text style={[styles.doneText, { fontFamily: "Inter_400Regular" }]}>{c.text}</Text>
              </TouchableOpacity>
            ))}
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
  nudgeBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${TERRA}14`,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: `${TERRA}30`,
  },
  nudgeText: { flex: 1, fontSize: 14, color: SLATE, lineHeight: 20 },
  sectionLabel: { fontSize: 13, color: SLATE, marginBottom: 12 },
  card: {
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 },
  commitText: { flex: 1, fontSize: 14, color: SLATE, lineHeight: 20 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, flexShrink: 0 },
  statusText: { fontSize: 11 },
  cardBottom: { flexDirection: "row", alignItems: "center", gap: 6 },
  dueDateText: { fontSize: 12, color: MUTED, flex: 1 },
  tapHint: { fontSize: 11, color: MUTED, fontStyle: "italic" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 12,
    marginTop: 4,
  },
  addBtnText: { fontSize: 14 },
  input: { borderWidth: 1, borderColor: BORDER, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: SLATE, marginBottom: 8 },
  saveBtn: { backgroundColor: TERRA, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  saveBtnText: { color: "#FFFFFF", fontSize: 14 },
  completedToggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, marginTop: 8 },
  doneCard: { flexDirection: "row", alignItems: "center", gap: 10 },
  doneText: { fontSize: 14, color: MUTED, textDecorationLine: "line-through", flex: 1 },
});
