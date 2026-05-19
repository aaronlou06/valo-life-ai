import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useVapiOnboarding } from "@/hooks/useVapiOnboarding";
import { useValoAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

const VALO_BLUE = "#3B82F6";
const USER_GREEN = "#22C55E";

interface Props {
  initialValue: Record<string, any>;
  onChange: (data: Record<string, any>, valid: boolean) => void;
  onAdvance: () => void;
}

export default function StepVoiceCall({ onAdvance }: Props) {
  const colors = useColors();
  const { userId, getToken } = useValoAuth();

  const {
    callState,
    transcript,
    startCall,
    endCall,
    isMuted,
    toggleMute,
    isValoSpeaking,
  } = useVapiOnboarding(
    userId ?? "",
    getToken as () => Promise<string | null>,
    false
  );

  const isActive = callState === "active";
  const isLoading = callState === "loading";
  const isEnding = callState === "ending";

  const [currentSpeaker, setCurrentSpeaker] = useState<"assistant" | "user" | null>(null);
  const [currentText, setCurrentText] = useState("");
  const liveCardOpacity = useRef(new Animated.Value(1)).current;
  const [callSuccess, setCallSuccess] = useState(false);
  const callEndedRef = useRef(false);

  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.5)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isActive || isLoading) {
      const loop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseScale, { toValue: 1.25, duration: 900, useNativeDriver: true }),
            Animated.timing(pulseScale, { toValue: 1, duration: 900, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(pulseOpacity, { toValue: 0.9, duration: 900, useNativeDriver: true }),
            Animated.timing(pulseOpacity, { toValue: 0.2, duration: 900, useNativeDriver: true }),
          ]),
        ])
      );
      loop.start();
      return () => {
        loop.stop();
        pulseScale.setValue(1);
        pulseOpacity.setValue(0.5);
      };
    }
  }, [isActive, isLoading]);

  useEffect(() => {
    if (!isActive) {
      setCurrentSpeaker(null);
      setCurrentText("");
      liveCardOpacity.setValue(1);
      return;
    }
    if (transcript.length === 0) return;
    const last = transcript[transcript.length - 1];
    if (!last) return;
    const role = last.role as "assistant" | "user";
    if (currentSpeaker === null) {
      setCurrentSpeaker(role);
      setCurrentText(last.text);
    } else if (role === currentSpeaker) {
      setCurrentText(last.text);
    } else {
      Animated.timing(liveCardOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        setCurrentSpeaker(role);
        setCurrentText(last.text);
        Animated.timing(liveCardOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      });
    }
  }, [isActive, transcript.length, transcript[transcript.length - 1]?.text]);

  useEffect(() => {
    if (callState === "idle" && transcript.length > 0 && !callEndedRef.current) {
      callEndedRef.current = true;
      setCallSuccess(true);
      Animated.timing(successOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      setTimeout(() => {
        onAdvance();
      }, 2000);
    }
  }, [callState, transcript.length]);

  const handleMicPress = useCallback(() => {
    if (isLoading || isEnding) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (isActive) {
      endCall();
    } else {
      startCall();
    }
  }, [isActive, isLoading, isEnding, startCall, endCall]);

  const ringColor = isActive
    ? isValoSpeaking ? VALO_BLUE : USER_GREEN
    : colors.primary;

  if (callSuccess) {
    return (
      <Animated.View style={[styles.successContainer, { opacity: successOpacity }]}>
        <View style={[styles.successIcon, { backgroundColor: USER_GREEN }]}>
          <Feather name="check" size={36} color="#fff" />
        </View>
        <Text style={[styles.successTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Great to meet you!
        </Text>
        <Text style={[styles.successSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Valo is ready to get started.
        </Text>
      </Animated.View>
    );
  }

  return (
    <View style={styles.container}>
      {!isActive && !isLoading && !isEnding && (
        <View style={styles.header}>
          <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
            VALO
          </Text>
          <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
            Meet Valo
          </Text>
          <Text style={[styles.subtext, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Valo wants to get to know you. This call takes about 5-10 minutes and replaces all the forms.
          </Text>
        </View>
      )}

      {isActive && (
        <View style={styles.speakerStatus}>
          <View style={[styles.speakerDot, { backgroundColor: isValoSpeaking ? VALO_BLUE : USER_GREEN }]} />
          <Text style={[styles.speakerLabel, { color: isValoSpeaking ? VALO_BLUE : USER_GREEN, fontFamily: "Inter_600SemiBold" }]}>
            {isValoSpeaking ? "Valo is speaking" : "Listening to you"}
          </Text>
        </View>
      )}

      {isEnding && (
        <View style={styles.processingContainer}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.processingText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Wrapping up…
          </Text>
        </View>
      )}

      {!isEnding && (
        <View style={styles.micSection}>
          <View style={styles.micWrapper}>
            {(isActive || isLoading) && (
              <Animated.View
                style={[
                  styles.pulseRing,
                  { borderColor: ringColor, transform: [{ scale: pulseScale }], opacity: pulseOpacity },
                ]}
              />
            )}
            <TouchableOpacity
              onPress={handleMicPress}
              disabled={isLoading || isEnding}
              activeOpacity={0.8}
              style={[
                styles.micButton,
                {
                  backgroundColor: isActive ? colors.primary : colors.card,
                  borderColor: isActive ? colors.primary : colors.border,
                },
              ]}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.primary} size="large" />
              ) : (
                <Feather
                  name={isActive ? "square" : "mic"}
                  size={34}
                  color={isActive ? colors.primaryForeground : colors.foreground}
                />
              )}
            </TouchableOpacity>
          </View>
          {!isActive && !isLoading && (
            <Text style={[styles.micHint, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
              Start my intro call
            </Text>
          )}
        </View>
      )}

      {isActive && currentSpeaker !== null && currentText.length > 0 && (
        <Animated.View
          style={[
            styles.liveCard,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: liveCardOpacity },
          ]}
        >
          <Text
            style={[
              styles.liveCardLabel,
              { color: currentSpeaker === "assistant" ? VALO_BLUE : USER_GREEN, fontFamily: "Inter_600SemiBold" },
            ]}
          >
            {currentSpeaker === "assistant" ? "Valo" : "You"}
          </Text>
          <Text
            style={[styles.liveCardText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
            numberOfLines={5}
            ellipsizeMode="tail"
          >
            {currentText}
          </Text>
        </Animated.View>
      )}

      {isActive && (
        <View style={styles.callControls}>
          <TouchableOpacity
            style={[
              styles.controlBtn,
              { backgroundColor: isMuted ? colors.muted : colors.card, borderColor: colors.border },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              toggleMute();
            }}
          >
            <Feather
              name={isMuted ? "mic-off" : "mic"}
              size={18}
              color={isMuted ? colors.mutedForeground : colors.foreground}
            />
            <Text style={[styles.controlBtnText, { color: isMuted ? colors.mutedForeground : colors.foreground, fontFamily: "Inter_500Medium" }]}>
              {isMuted ? "Unmute" : "Mute"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.controlBtn, styles.endBtn]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              endCall();
            }}
          >
            <Feather name="phone-off" size={18} color="#fff" />
            <Text style={[styles.controlBtnText, { color: "#fff", fontFamily: "Inter_500Medium" }]}>
              End call
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {!isActive && !isLoading && !isEnding && (
        <View style={styles.skipSection}>
          <Text style={[styles.skipContext, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Prefer to set up later? No problem.
          </Text>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onAdvance();
            }}
            style={styles.skipBtn}
            activeOpacity={0.7}
          >
            <Text style={[styles.skipText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
              Skip voice call
            </Text>
          </TouchableOpacity>
          <Text style={[styles.skipNote, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Valo will learn about you through daily check-ins instead.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 24, alignItems: "center", paddingTop: 8 },

  successContainer: { alignItems: "center", paddingTop: 48, gap: 20 },
  successIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 22 },
  successSub: { fontSize: 15, textAlign: "center" },

  header: { alignSelf: "stretch", gap: 12 },
  valoLabel: { fontSize: 11, letterSpacing: 1.5 },
  heading: { fontSize: 26, lineHeight: 34 },
  subtext: { fontSize: 15, lineHeight: 23 },

  speakerStatus: { flexDirection: "row", alignItems: "center", gap: 8 },
  speakerDot: { width: 8, height: 8, borderRadius: 4 },
  speakerLabel: { fontSize: 13 },

  processingContainer: { paddingVertical: 48, alignItems: "center", gap: 14 },
  processingText: { fontSize: 17 },

  micSection: { alignItems: "center", gap: 16, marginVertical: 8 },
  micWrapper: { width: 140, height: 140, justifyContent: "center", alignItems: "center" },
  pulseRing: { position: "absolute", width: 140, height: 140, borderRadius: 70, borderWidth: 3 },
  micButton: { width: 100, height: 100, borderRadius: 50, borderWidth: 2, justifyContent: "center", alignItems: "center" },
  micHint: { fontSize: 16, textAlign: "center" },

  liveCard: {
    alignSelf: "stretch",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 6,
  },
  liveCardLabel: { fontSize: 11, letterSpacing: 0.8, textAlign: "center" },
  liveCardText: { fontSize: 17, lineHeight: 26, textAlign: "center" },

  callControls: { flexDirection: "row", gap: 12 },
  controlBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24, borderWidth: 1 },
  endBtn: { backgroundColor: "#EF4444", borderColor: "#EF4444" },
  controlBtnText: { fontSize: 14 },

  skipSection: { alignItems: "center", gap: 10, marginTop: 12 },
  skipContext: { fontSize: 14, textAlign: "center" },
  skipBtn: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 12 },
  skipText: { fontSize: 16, textDecorationLine: "underline" },
  skipNote: { fontSize: 12, textAlign: "center", lineHeight: 18, paddingHorizontal: 16 },
});
