import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useVapiDebrief } from "@/hooks/useVapiDebrief";
import { useAuth } from "@clerk/expo";
import { useListGoals } from "@workspace/api-client-react";

const MOOD_PROMPTS = [
  "How did your energy hold up today?",
  "What's been weighing on your mind?",
  "Did you make progress on what matters most?",
  "Who did you connect with today?",
  "What would have made today better?",
];

function CallStateLabel({ state, isMuted }: { state: string; isMuted: boolean }) {
  const colors = useColors();
  if (state === "idle") return (
    <Text style={[styles.micLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
      Tap to start your evening debrief
    </Text>
  );
  if (state === "loading") return (
    <Text style={[styles.micLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
      Connecting…
    </Text>
  );
  if (state === "ending") return (
    <Text style={[styles.micLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
      Wrapping up…
    </Text>
  );
  return (
    <Text style={[styles.micLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
      {isMuted ? "Muted — tap mic to unmute" : "Listening… tap to end"}
    </Text>
  );
}

export default function VoiceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const { data: goals } = useListGoals();

  const { callState, transcript, startCall, endCall, isMuted, toggleMute } =
    useVapiDebrief(userId ?? "");

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const tabBarH = Platform.OS === "web" ? 84 : 83;

  const isActive = callState === "active";
  const isLoading = callState === "loading";
  const isEnding = callState === "ending";
  const isBusy = isLoading || isEnding;

  const handleMicPress = () => {
    if (isBusy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (isActive) {
      endCall();
    } else {
      startCall();
    }
  };

  const topGoal = goals?.[0];
  const prompt = MOOD_PROMPTS[new Date().getDay() % MOOD_PROMPTS.length];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: topPad + 16,
        paddingBottom: bottomPad + tabBarH + 16,
        paddingHorizontal: 20,
      }}
    >
      <Text style={[styles.header, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
        Voice debrief
      </Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        Valo will listen and reflect with you
      </Text>

      {/* Mic button */}
      <View style={styles.micContainer}>
        <TouchableOpacity
          style={[
            styles.micOuter,
            {
              borderColor: isActive ? colors.primary : colors.border,
              backgroundColor: colors.card,
            },
          ]}
          onPress={handleMicPress}
          disabled={isBusy}
          activeOpacity={0.8}
        >
          <View
            style={[
              styles.micInner,
              {
                backgroundColor: isActive
                  ? colors.primary
                  : isBusy
                  ? colors.muted
                  : colors.secondary,
              },
            ]}
          >
            {isBusy ? (
              <ActivityIndicator color={isLoading ? colors.primary : colors.mutedForeground} size="large" />
            ) : (
              <Feather
                name={isActive ? "square" : "mic"}
                size={32}
                color={isActive ? colors.primaryForeground : colors.foreground}
              />
            )}
          </View>
        </TouchableOpacity>

        <CallStateLabel state={callState} isMuted={isMuted} />

        {isActive && (
          <TouchableOpacity
            style={[
              styles.muteBtn,
              { borderColor: colors.border, backgroundColor: isMuted ? colors.muted : colors.card },
            ]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleMute(); }}
          >
            <Feather
              name={isMuted ? "mic-off" : "mic"}
              size={16}
              color={isMuted ? colors.mutedForeground : colors.foreground}
            />
            <Text style={[styles.muteBtnText, { color: isMuted ? colors.mutedForeground : colors.foreground, fontFamily: "Inter_500Medium" }]}>
              {isMuted ? "Unmute" : "Mute"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Context card — show when idle/loading */}
      {(callState === "idle" || callState === "loading") && (
        <View style={[styles.contextCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.contextTitle, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            TONIGHT VALO WILL ASK ABOUT
          </Text>
          <Text style={[styles.contextText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
            {prompt}
          </Text>
          {topGoal && (
            <Text style={[styles.contextGoal, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
              Goal: {topGoal.title}
            </Text>
          )}
        </View>
      )}

      {/* Live transcript */}
      {transcript.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text style={[styles.transcriptHeader, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            TRANSCRIPT
          </Text>
          {transcript.map((entry, i) => (
            <View
              key={i}
              style={[
                styles.transcriptBubble,
                entry.role === "user"
                  ? { alignSelf: "flex-end", backgroundColor: colors.primary }
                  : { alignSelf: "flex-start", backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
              ]}
            >
              <Text
                style={[
                  styles.transcriptText,
                  {
                    color: entry.role === "user" ? colors.primaryForeground : colors.foreground,
                    fontFamily: "Inter_400Regular",
                  },
                ]}
              >
                {entry.text}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Post-call summary note */}
      {callState === "ending" && (
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={[styles.summaryText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Saving your debrief and generating insights…
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 28, marginBottom: 4 },
  subtitle: { fontSize: 15, marginBottom: 32 },
  micContainer: { alignItems: "center", marginBottom: 28, gap: 16 },
  micOuter: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  micInner: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
  },
  micLabel: { fontSize: 14, textAlign: "center", maxWidth: 240 },
  muteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  muteBtnText: { fontSize: 13 },
  contextCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 24 },
  contextTitle: { fontSize: 11, letterSpacing: 0.8, marginBottom: 10 },
  contextText: { fontSize: 15, lineHeight: 22, marginBottom: 10 },
  contextGoal: { fontSize: 13 },
  transcriptHeader: { fontSize: 11, letterSpacing: 0.8 },
  transcriptBubble: {
    maxWidth: "80%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  transcriptText: { fontSize: 14, lineHeight: 20 },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginTop: 8,
  },
  summaryText: { fontSize: 14, flex: 1 },
});
