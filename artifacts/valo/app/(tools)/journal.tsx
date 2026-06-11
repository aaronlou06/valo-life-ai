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
const LAVENDER = "#9B7BB8";

type Entry = {
  id: string;
  text: string;
  date: string;
  mood?: string;
};

const SEED_ENTRIES: Entry[] = [
  {
    id: "1",
    text: "Had a really productive morning. Finished the report ahead of schedule and took a walk around the block. Feeling grounded.",
    date: "Jun 10, 2026 · 9:14am",
    mood: "Calm",
  },
  {
    id: "2",
    text: "Struggled with focus today. Too many tabs open, too many thoughts. Need to be more intentional about deep work blocks.",
    date: "Jun 8, 2026 · 7:52pm",
    mood: "Restless",
  },
  {
    id: "3",
    text: "Called mom after a long time. Felt a wave of gratitude. Small things really do matter the most.",
    date: "Jun 5, 2026 · 8:30pm",
  },
];

const FILTERS = ["All", "This Week", "This Month"];

export default function JournalScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>(SEED_ENTRIES);
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("All");

  function saveEntry() {
    if (!draft.trim()) return;
    const now = new Date();
    const label = now.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    setEntries([{ id: String(Date.now()), text: draft.trim(), date: label }, ...entries]);
    setDraft("");
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: BG }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: BORDER }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={TERRA} />
        </TouchableOpacity>
        <Text style={[styles.title, { fontFamily: "Inter_600SemiBold" }]}>Living Journal</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.tagline, { fontFamily: "Inter_400Regular" }]}>
          Nothing you tell me disappears. It all compounds.
        </Text>

        <View style={[styles.card, styles.entryBox]}>
          <TextInput
            multiline
            placeholder="What's on your mind?"
            placeholderTextColor={MUTED}
            value={draft}
            onChangeText={setDraft}
            style={[styles.input, { fontFamily: "Inter_400Regular" }]}
          />
          <TouchableOpacity
            onPress={saveEntry}
            activeOpacity={0.8}
            style={[styles.saveBtn, { opacity: draft.trim() ? 1 : 0.4 }]}
          >
            <Text style={[styles.saveBtnText, { fontFamily: "Inter_600SemiBold" }]}>
              Save entry
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              activeOpacity={0.7}
              style={[
                styles.pill,
                { backgroundColor: filter === f ? LAVENDER : CARD, borderColor: BORDER },
              ]}
            >
              <Text
                style={[
                  styles.pillText,
                  { color: filter === f ? "#FFFFFF" : MUTED, fontFamily: "Inter_500Medium" },
                ]}
              >
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {entries.map((entry) => (
          <View key={entry.id} style={[styles.card, styles.entryCard]}>
            <View style={styles.entryTop}>
              <Text style={[styles.entryDate, { fontFamily: "Inter_400Regular" }]}>
                {entry.date}
              </Text>
              {entry.mood && (
                <View style={[styles.moodChip, { backgroundColor: `${LAVENDER}22` }]}>
                  <Text style={[styles.moodText, { fontFamily: "Inter_500Medium", color: LAVENDER }]}>
                    {entry.mood}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.entryBody, { fontFamily: "Inter_400Regular" }]}>
              {entry.text}
            </Text>
          </View>
        ))}
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
  tagline: { fontSize: 12, color: MUTED, fontStyle: "italic", marginBottom: 16 },
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
  },
  entryBox: { padding: 14, marginBottom: 16 },
  input: { fontSize: 14, color: SLATE, minHeight: 80, textAlignVertical: "top", marginBottom: 12 },
  saveBtn: {
    backgroundColor: TERRA,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  saveBtnText: { color: "#FFFFFF", fontSize: 14 },
  filterRow: { marginBottom: 16, flexGrow: 0 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  pillText: { fontSize: 13 },
  entryCard: { padding: 14, marginBottom: 12 },
  entryTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  entryDate: { fontSize: 12, color: MUTED },
  moodChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  moodText: { fontSize: 11 },
  entryBody: { fontSize: 14, color: SLATE, lineHeight: 20 },
});
