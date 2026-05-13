import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useCreateMood, useCreateLogEntry, getListLogEntriesQueryKey, getListMoodsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useListGoals } from "@workspace/api-client-react";

const QUICK_LOGS = [
  { id: "mood", label: "Mood check", icon: "smile", color: "#DDB278" },
  { id: "water", label: "Water", icon: "droplet", color: "#5B8CDE" },
  { id: "wind-down", label: "Wind down", icon: "moon", color: "#8B7EC8" },
  { id: "note", label: "Quick note", icon: "edit-3", color: "#7DCB8F" },
];

const MOOD_PROMPTS = [
  "How did your energy hold up today?",
  "What's been weighing on your mind?",
  "Did you make progress on what matters most?",
  "Who did you connect with today?",
  "What would have made today better?",
];

export default function VoiceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [recording, setRecording] = useState(false);
  const [lastLogged, setLastLogged] = useState<string | null>(null);

  const createMood = useCreateMood();
  const createLogEntry = useCreateLogEntry();
  const { data: goals } = useListGoals();

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const tabBarH = Platform.OS === "web" ? 84 : 83;

  const handleMic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setRecording((v) => !v);
    if (recording) setRecording(false);
  };

  const handleQuickLog = async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (id === "mood") {
      await createMood.mutateAsync({ data: { score: 7, note: "Quick mood log" } });
      queryClient.invalidateQueries({ queryKey: getListMoodsQueryKey() });
      setLastLogged("Mood logged");
    } else {
      const labels: Record<string, string> = { water: "Water", "wind-down": "Wind down", note: "Quick note" };
      await createLogEntry.mutateAsync({ data: { type: id, title: labels[id] ?? id } });
      queryClient.invalidateQueries({ queryKey: getListLogEntriesQueryKey() });
      setLastLogged(`${labels[id] ?? id} logged`);
    }
    setTimeout(() => setLastLogged(null), 2000);
  };

  const topGoal = goals?.[0];
  const prompt = MOOD_PROMPTS[new Date().getDay() % MOOD_PROMPTS.length];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: bottomPad + tabBarH + 16, paddingHorizontal: 20 }}
    >
      <Text style={[styles.header, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Voice</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Let Valo listen to your day</Text>

      <View style={styles.micContainer}>
        <TouchableOpacity
          style={[styles.micOuter, { borderColor: recording ? colors.primary : colors.border, backgroundColor: colors.card }]}
          onPress={handleMic}
          activeOpacity={0.8}
        >
          <View style={[styles.micInner, { backgroundColor: recording ? colors.primary : colors.secondary }]}>
            <Feather name={recording ? "square" : "mic"} size={32} color={recording ? colors.primaryForeground : colors.foreground} />
          </View>
        </TouchableOpacity>
        <Text style={[styles.micLabel, { color: recording ? colors.primary : colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
          {recording ? "Listening... tap to stop" : "Tap to start"}
        </Text>
      </View>

      {topGoal && (
        <View style={[styles.contextCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.contextTitle, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Tonight Valo will ask about</Text>
          <Text style={[styles.contextText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>{prompt}</Text>
          <Text style={[styles.contextGoal, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
            Goal: {topGoal.title}
          </Text>
        </View>
      )}

      {!topGoal && (
        <View style={[styles.contextCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.contextTitle, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Tonight Valo will ask about</Text>
          <Text style={[styles.contextText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>{prompt}</Text>
        </View>
      )}

      <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>QUICK LOG</Text>

      <View style={styles.quickGrid}>
        {QUICK_LOGS.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.quickBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => handleQuickLog(item.id)}
          >
            <View style={[styles.quickIcon, { backgroundColor: item.color + "22" }]}>
              <Feather name={item.icon as any} size={20} color={item.color} />
            </View>
            <Text style={[styles.quickLabel, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!!lastLogged && (
        <View style={[styles.toast, { backgroundColor: colors.primary }]}>
          <Feather name="check" size={14} color={colors.primaryForeground} />
          <Text style={[styles.toastText, { color: colors.primaryForeground, fontFamily: "Inter_500Medium" }]}>{lastLogged}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 28, marginBottom: 4 },
  subtitle: { fontSize: 15, marginBottom: 32 },
  micContainer: { alignItems: "center", marginBottom: 32 },
  micOuter: { width: 160, height: 160, borderRadius: 80, borderWidth: 2, justifyContent: "center", alignItems: "center", marginBottom: 16 },
  micInner: { width: 120, height: 120, borderRadius: 60, justifyContent: "center", alignItems: "center" },
  micLabel: { fontSize: 14 },
  contextCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 28 },
  contextTitle: { fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 },
  contextText: { fontSize: 15, lineHeight: 22, marginBottom: 10 },
  contextGoal: { fontSize: 13 },
  sectionLabel: { fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 12 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quickBtn: { width: "47%", padding: 16, borderRadius: 14, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  quickIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  quickLabel: { fontSize: 14, flex: 1 },
  toast: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, alignSelf: "center", marginTop: 16 },
  toastText: { fontSize: 14 },
});
