import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Linking,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";

interface Props {
  onGranted: (micPermission: boolean) => void;
}

type PermissionState = "idle" | "requesting" | "granted" | "denied";

async function requestMic(): Promise<"granted" | "denied"> {
  if (Platform.OS === "web") return "granted";
  try {
    const { Audio } = await import("expo-av");
    const { status } = await Audio.requestPermissionsAsync();
    return status === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

export default function StepMicPermission({ onGranted }: Props) {
  const colors = useColors();
  const [permState, setPermState] = useState<PermissionState>("idle");

  async function handleAllow() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPermState("requesting");
    const result = await requestMic();
    setPermState(result);
    if (result === "granted") {
      setTimeout(() => onGranted(true), 600);
    }
  }

  function handleSkip() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onGranted(false);
  }

  if (permState === "granted") {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <View style={[styles.successIcon, { backgroundColor: "#22C55E" }]}>
          <Feather name="check" size={32} color="#fff" />
        </View>
        <Text style={[styles.successText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Microphone ready
        </Text>
      </View>
    );
  }

  if (permState === "denied") {
    return (
      <View style={styles.container}>
        <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
          VALO
        </Text>

        <View style={[styles.iconCircle, { backgroundColor: colors.muted }]}>
          <Feather name="mic-off" size={28} color={colors.mutedForeground} />
        </View>

        <View style={styles.headingBlock}>
          <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
            Microphone access denied
          </Text>
          <Text style={[styles.subheading, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            To use voice check-ins, enable microphone access in your device settings.
          </Text>
          <Text style={[styles.subheading, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Settings {">"} Privacy {">"} Microphone {">"} Valo
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={() => { Linking.openSettings(); }}
          activeOpacity={0.85}
        >
          <Text style={[styles.primaryBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
            Open Settings
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSkip} style={styles.skipBtn} activeOpacity={0.7}>
          <Text style={[styles.skipText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Continue without microphone
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
        VALO
      </Text>

      <View style={[styles.iconCircle, { backgroundColor: colors.muted }]}>
        <Feather name="mic" size={28} color={colors.primary} />
      </View>

      <View style={styles.headingBlock}>
        <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          Valo needs your microphone
        </Text>
        <Text style={[styles.subheading, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          To conduct voice check-ins, Valo needs access to your microphone. This is only used when you choose to speak with Valo.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: permState === "requesting" ? 0.75 : 1 }]}
        onPress={handleAllow}
        disabled={permState === "requesting"}
        activeOpacity={0.85}
      >
        {permState === "requesting" ? (
          <ActivityIndicator color={colors.primaryForeground} size="small" />
        ) : (
          <Text style={[styles.primaryBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
            Allow microphone access
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={handleSkip} style={styles.skipBtn} activeOpacity={0.7}>
        <Text style={[styles.skipText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Skip for now
        </Text>
      </TouchableOpacity>

      <Text style={[styles.note, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        You can enable this later in Settings. Text-based check-ins are still available.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 24 },
  valoLabel: { fontSize: 11, letterSpacing: 1.5 },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  successText: { fontSize: 20, marginTop: 12 },
  headingBlock: { gap: 10 },
  heading: { fontSize: 22, lineHeight: 30 },
  subheading: { fontSize: 15, lineHeight: 23 },
  primaryBtn: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  primaryBtnText: { fontSize: 16 },
  skipBtn: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 24 },
  skipText: { fontSize: 14, textDecorationLine: "underline" },
  note: { fontSize: 12, lineHeight: 18, textAlign: "center", paddingHorizontal: 8 },
});
