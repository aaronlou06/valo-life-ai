import React, { useRef, useEffect } from "react";
import { View, Text, TouchableOpacity, Animated, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";

interface Props {
  allData: Record<string, any>;
  onBegin: () => void;
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = (h ?? 0) >= 12 ? "PM" : "AM";
  const hour = (h ?? 0) % 12 || 12;
  return `${hour}:${String(m ?? 0).padStart(2, "0")} ${period}`;
}

export default function WelcomeScreen({ allData, onBegin }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const firstName = ((allData.name ?? "") as string).split(" ")[0] || "there";
  const callTime = allData.preferredCallTime ? formatTime(allData.preferredCallTime as string) : "this evening";

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top + 60, paddingBottom: insets.bottom + 32 },
      ]}
    >
      <Animated.View
        style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
      >
        <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          You're all set, {firstName}.
        </Text>

        <View style={styles.subtextBlock}>
          <Text style={[styles.subtext, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Valo will call you tonight at {callTime}. Until then, your Today screen is already personalized.
          </Text>
          <Text style={[styles.subtext, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            The more you talk to Valo, the better it knows you.
          </Text>
        </View>
      </Animated.View>

      <TouchableOpacity
        style={[styles.beginBtn, { backgroundColor: colors.primary, marginHorizontal: 24 }]}
        onPress={() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onBegin();
        }}
        activeOpacity={0.85}
      >
        <Text style={[styles.beginText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
          Go to Today
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "space-between" },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: "center",
    gap: 28,
  },
  heading: { fontSize: 28, lineHeight: 36 },
  subtextBlock: { gap: 16 },
  subtext: { fontSize: 16, lineHeight: 26 },
  beginBtn: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  beginText: { fontSize: 16 },
});
