import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";

interface Props {
  name?: string;
  onBegin: () => void;
}

export default function StepValoIntro({ name, onBegin }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  const btnFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
      Animated.timing(btnFade, { toValue: 1, duration: 400, useNativeDriver: true, delay: 200 }),
    ]).start();
  }, []);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = insets.bottom;

  const greeting = name?.trim()
    ? `Hi ${name.trim().split(" ")[0]}, I'm Valo.`
    : "Hi, I'm Valo.";

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: topPad + 60, paddingBottom: bottomPad + 32 },
      ]}
    >
      <Animated.View
        style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
      >
        <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
          VALO
        </Text>

        <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          {greeting}
        </Text>

        <View style={styles.subtextBlock}>
          <Text style={[styles.subtext, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            I'm here to help you see your life clearly.
          </Text>
          <Text style={[styles.subtext, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            No judgment, no generic advice — just honest reflection on what matters to you.
          </Text>
        </View>
      </Animated.View>

      <Animated.View style={{ opacity: btnFade, paddingHorizontal: 24 }}>
        <TouchableOpacity
          style={[styles.beginBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onBegin();
          }}
          activeOpacity={0.85}
        >
          <Text style={[styles.beginText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
            Let's begin
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "space-between" },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: "center",
    gap: 24,
  },
  valoLabel: { fontSize: 11, letterSpacing: 1.5 },
  heading: { fontSize: 32, lineHeight: 40 },
  subtextBlock: { gap: 14 },
  subtext: { fontSize: 17, lineHeight: 27 },
  beginBtn: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  beginText: { fontSize: 16 },
});
