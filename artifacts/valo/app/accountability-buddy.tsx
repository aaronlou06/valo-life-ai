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

const TERRACOTTA = "#C17B3F";
const SAGE = "#6B9E78";
const AMBER = "#D4A847";

type Status = "in-progress" | "done" | "overdue";

interface Commitment {
  id: string;
  text: string;
  due: string;
  status: Status;
}

const SEED: Commitment[] = [
  { id: "c1", text: "Work out 4x this week", due: "Sun", status: "in-progress" },
  { id: "c2", text: "Read 20 pages a day", due: "Fri", status: "in-progress" },
  { id: "c3", text: "Call Mom", due: "Mon", status: "overdue" },
  { id: "c4", text: "Finish quarterly review", due: "Wed", status: "done" },
];

const STATUS_META: Record<Status, { label: string; color: string }> = {
  "in-progress": { label: "In Progress", color: AMBER },
  done: { label: "Done", color: SAGE },
  overdue: { label: "Overdue", color: TERRACOTTA },
};

export default function AccountabilityBuddyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [commitments, setCommitments] = useState<Commitment[]>(SEED);
  const [adding, setAdding] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [draftDue, setDraftDue] = useState("");

  const doneCount = commitments.filter((c) => c.status === "done").length;

  const cycleStatus = (id: string) => {
    Haptics.selectionAsync();
    const order: Status[] = ["in-progress", "done", "overdue"];
    setCommitments((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, status: order[(order.indexOf(c.status) + 1) % order.length]! }
          : c,
      ),
    );
  };

  const saveCommitment = () => {
    if (!draftText.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCommitments((prev) => [
      ...prev,
      {
        id: `c${Date.now()}`,
        text: draftText.trim(),
        due: draftDue.trim() || "—",
        status: "in-progress",
      },
    ]);
    setDraftText("");
    setDraftDue("");
    setAdding(false);
  };

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Accountability Buddy
        </Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        >
          {/* Valo nudge */}
          <View style={[styles.nudge, { backgroundColor: `${TERRACOTTA}1A`, borderColor: `${TERRACOTTA}33` }]}>
            <Feather name="zap" size={18} color={TERRACOTTA} style={{ marginTop: 1 }} />
            <Text style={[styles.nudgeText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
              You've completed {doneCount} of {commitments.length} commitments this week. Keep going.
            </Text>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            ACTIVE COMMITMENTS
          </Text>

          {commitments.map((c) => {
            const meta = STATUS_META[c.status];
            return (
              <View
                key={c.id}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                    {c.text}
                  </Text>
                  <View style={[styles.dueBadge, { backgroundColor: colors.muted }]}>
                    <Feather name="calendar" size={11} color={colors.mutedForeground} />
                    <Text style={[styles.dueText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                      Due {c.due}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => cycleStatus(c.id)}
                  activeOpacity={0.7}
                  style={[styles.pill, { backgroundColor: `${meta.color}1F` }]}
                >
                  <Text style={[styles.pillText, { color: meta.color, fontFamily: "Inter_600SemiBold" }]}>
                    {meta.label}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {adding ? (
            <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TextInput
                value={draftText}
                onChangeText={setDraftText}
                placeholder="What will you commit to?"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.input, fontFamily: "Inter_400Regular" }]}
                autoFocus
              />
              <TextInput
                value={draftDue}
                onChangeText={setDraftDue}
                placeholder="Due (e.g. Fri)"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.input, fontFamily: "Inter_400Regular" }]}
              />
              <View style={styles.formActions}>
                <TouchableOpacity onPress={() => { setAdding(false); setDraftText(""); setDraftDue(""); }} style={styles.cancelBtn}>
                  <Text style={[styles.cancelText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveCommitment} style={[styles.saveBtn, { backgroundColor: TERRACOTTA }]}>
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
              <Feather name="plus" size={18} color={TERRACOTTA} />
              <Text style={[styles.addText, { color: TERRACOTTA, fontFamily: "Inter_500Medium" }]}>
                Add a commitment
              </Text>
            </TouchableOpacity>
          )}
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
  nudge: {
    flexDirection: "row",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20,
  },
  nudgeText: { flex: 1, fontSize: 13, lineHeight: 19 },
  sectionLabel: { fontSize: 11, letterSpacing: 0.6, marginBottom: 10 },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  cardText: { fontSize: 14, marginBottom: 8 },
  dueBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dueText: { fontSize: 11 },
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  pillText: { fontSize: 11 },
  formCard: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 10, marginTop: 2 },
  input: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  formActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 2 },
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
    marginTop: 2,
  },
  addText: { fontSize: 14 },
});
