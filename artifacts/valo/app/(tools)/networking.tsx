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
const ROSE = "#C8857A";

type RelTag = "Family" | "Friend" | "Work" | "Mentor";

type Person = {
  id: string;
  name: string;
  tag: RelTag;
  cadence: string;
  lastContacted: string;
  weeksAgo?: number;
};

const REL_TAGS: RelTag[] = ["Family", "Friend", "Work", "Mentor"];

const SEED_PEOPLE: Person[] = [
  { id: "1", name: "Sarah Chen", tag: "Friend", cadence: "every 2 weeks", lastContacted: "3 weeks ago", weeksAgo: 3 },
  { id: "2", name: "David Park", tag: "Mentor", cadence: "monthly", lastContacted: "5 weeks ago", weeksAgo: 5 },
  { id: "3", name: "Mom", tag: "Family", cadence: "weekly", lastContacted: "2 weeks ago", weeksAgo: 2 },
  { id: "4", name: "Jake Torres", tag: "Work", cadence: "monthly", lastContacted: "1 week ago", weeksAgo: 1 },
  { id: "5", name: "Priya Nair", tag: "Friend", cadence: "every 3 weeks", lastContacted: "4 weeks ago", weeksAgo: 4 },
];

const TAG_COLOR: Record<RelTag, string> = {
  Family: "#9B7BB8",
  Friend: ROSE,
  Work: "#5B7FA6",
  Mentor: "#6B9E78",
};

const CADENCES = ["weekly", "every 2 weeks", "every 3 weeks", "monthly"];

export default function NetworkingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [people, setPeople] = useState<Person[]>(SEED_PEOPLE);
  const [newName, setNewName] = useState("");
  const [newTag, setNewTag] = useState<RelTag>("Friend");
  const [newCadence, setNewCadence] = useState("every 2 weeks");
  const [showForm, setShowForm] = useState(false);

  const reachOutPrompts = people
    .filter((p) => (p.weeksAgo ?? 0) >= 2)
    .sort((a, b) => (b.weeksAgo ?? 0) - (a.weeksAgo ?? 0))
    .slice(0, 3);

  function reachOut(id: string) {
    setPeople(
      people.map((p) =>
        p.id === id ? { ...p, lastContacted: "Just now", weeksAgo: 0 } : p
      )
    );
  }

  function addPerson() {
    if (!newName.trim()) return;
    setPeople([
      ...people,
      { id: String(Date.now()), name: newName.trim(), tag: newTag, cadence: newCadence, lastContacted: "Never", weeksAgo: 999 },
    ]);
    setNewName(""); setNewTag("Friend"); setNewCadence("every 2 weeks");
    setShowForm(false);
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
        <Text style={[styles.title, { fontFamily: "Inter_600SemiBold" }]}>Networking</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {reachOutPrompts.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { fontFamily: "Inter_600SemiBold" }]}>Reach Out</Text>
            <View style={[styles.card, { padding: 0, overflow: "hidden", marginBottom: 24 }]}>
              {reachOutPrompts.map((p, i) => (
                <View
                  key={p.id}
                  style={[
                    styles.promptRow,
                    { borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: BORDER },
                  ]}
                >
                  <View style={[styles.avatarCircle, { backgroundColor: `${TAG_COLOR[p.tag]}22` }]}>
                    <Text style={[styles.avatarInitial, { color: TAG_COLOR[p.tag], fontFamily: "Inter_700Bold" }]}>
                      {p.name[0]}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.promptName, { fontFamily: "Inter_600SemiBold" }]}>{p.name}</Text>
                    <Text style={[styles.promptTime, { fontFamily: "Inter_400Regular" }]}>{p.lastContacted}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => reachOut(p.id)}
                    activeOpacity={0.8}
                    style={[styles.reachBtn, { backgroundColor: `${ROSE}18`, borderColor: `${ROSE}40` }]}
                  >
                    <Text style={[styles.reachBtnText, { color: ROSE, fontFamily: "Inter_600SemiBold" }]}>
                      Reach out
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={[styles.sectionLabel, { fontFamily: "Inter_600SemiBold" }]}>People</Text>

        {people.map((p) => (
          <View key={p.id} style={[styles.card, styles.personCard]}>
            <View style={[styles.avatarCircle, { backgroundColor: `${TAG_COLOR[p.tag]}22` }]}>
              <Text style={[styles.avatarInitial, { color: TAG_COLOR[p.tag], fontFamily: "Inter_700Bold" }]}>
                {p.name[0]}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.personTop}>
                <Text style={[styles.personName, { fontFamily: "Inter_600SemiBold" }]}>{p.name}</Text>
                <View style={[styles.tagChip, { backgroundColor: `${TAG_COLOR[p.tag]}18` }]}>
                  <Text style={[styles.tagText, { color: TAG_COLOR[p.tag], fontFamily: "Inter_500Medium" }]}>
                    {p.tag}
                  </Text>
                </View>
              </View>
              <Text style={[styles.cadenceText, { fontFamily: "Inter_400Regular" }]}>
                Check in {p.cadence} · Last: {p.lastContacted}
              </Text>
            </View>
          </View>
        ))}

        <TouchableOpacity
          onPress={() => setShowForm((v) => !v)}
          activeOpacity={0.8}
          style={[styles.addBtn, { borderColor: ROSE }]}
        >
          <Feather name="user-plus" size={16} color={ROSE} />
          <Text style={[styles.addBtnText, { color: ROSE, fontFamily: "Inter_600SemiBold" }]}>
            Add person
          </Text>
        </TouchableOpacity>

        {showForm && (
          <View style={[styles.card, { padding: 14 }]}>
            <TextInput
              placeholder="Name"
              placeholderTextColor={MUTED}
              value={newName}
              onChangeText={setNewName}
              style={[styles.input, { fontFamily: "Inter_400Regular" }]}
            />
            <Text style={[styles.formLabel, { fontFamily: "Inter_600SemiBold" }]}>Relationship</Text>
            <View style={styles.tagRow}>
              {REL_TAGS.map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setNewTag(t)}
                  activeOpacity={0.7}
                  style={[
                    styles.tagOption,
                    { backgroundColor: newTag === t ? TAG_COLOR[t] : `${TAG_COLOR[t]}18`, borderColor: TAG_COLOR[t] },
                  ]}
                >
                  <Text style={[styles.tagOptionText, { color: newTag === t ? "#FFFFFF" : TAG_COLOR[t], fontFamily: "Inter_500Medium" }]}>
                    {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.formLabel, { fontFamily: "Inter_600SemiBold" }]}>Cadence</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 12 }}>
              {CADENCES.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setNewCadence(c)}
                  activeOpacity={0.7}
                  style={[styles.cadenceChip, { backgroundColor: newCadence === c ? ROSE : "#F7F5F2", borderColor: newCadence === c ? ROSE : BORDER }]}
                >
                  <Text style={[styles.cadenceChipText, { color: newCadence === c ? "#FFFFFF" : MUTED, fontFamily: "Inter_500Medium" }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={addPerson} activeOpacity={0.8} style={[styles.saveBtn, { backgroundColor: ROSE }]}>
              <Text style={[styles.saveBtnText, { fontFamily: "Inter_600SemiBold" }]}>Add person</Text>
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
  sectionLabel: { fontSize: 13, color: SLATE, marginBottom: 12 },
  card: {
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  promptRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  avatarCircle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 16 },
  promptName: { fontSize: 14, color: SLATE },
  promptTime: { fontSize: 12, color: MUTED, marginTop: 2 },
  reachBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  reachBtnText: { fontSize: 12 },
  personCard: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  personTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  personName: { fontSize: 14, color: SLATE },
  tagChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 11 },
  cadenceText: { fontSize: 12, color: MUTED },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 4,
    marginBottom: 12,
  },
  addBtnText: { fontSize: 14 },
  input: { borderWidth: 1, borderColor: BORDER, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: SLATE, marginBottom: 8 },
  formLabel: { fontSize: 12, color: MUTED, marginBottom: 8 },
  tagRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 12 },
  tagOption: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  tagOptionText: { fontSize: 12 },
  cadenceChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, marginRight: 8 },
  cadenceChipText: { fontSize: 12 },
  saveBtn: { borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  saveBtnText: { color: "#FFFFFF", fontSize: 14 },
});
