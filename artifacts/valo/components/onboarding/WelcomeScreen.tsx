import React, { useRef, useEffect } from "react";
import { View, Text, TouchableOpacity, Animated, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";

interface Props {
  allData: Record<string, any>;
  onBegin: () => void;
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

  const firstName = (allData.name ?? "").split(" ")[0] || "you";
  const hasCall = !!(allData.phoneNumber ?? "").trim();

  const bullets = [
    { icon: "sun" as const, text: "Each evening, Valo will check in on your day" },
    { icon: "trending-up" as const, text: "Your goals, habits, and mood tracked in one place" },
    {
      icon: "phone" as const,
      text: hasCall
        ? `Daily call set for ${allData.preferredCallTime ?? "20:00"}`
        : "Set up your daily call anytime in Settings",
    },
  ];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <Animated.View
        style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
      >
        <View style={[styles.orb, { backgroundColor: colors.primary + "1A" }]}>
          <View style={[styles.orbInner, { backgroundColor: colors.primary + "33" }]}>
            <Feather name="sun" size={28} color={colors.primary} />
          </View>
        </View>

        <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Valo is ready.
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Good to meet you, {firstName}. Here's what comes next.
        </Text>

        <View style={styles.bullets}>
          {bullets.map((item, i) => (
            <View key={i} style={[styles.bullet, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name={item.icon} size={16} color={colors.primary} />
              <Text style={[styles.bulletText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                {item.text}
              </Text>
            </View>
          ))}
        </View>
      </Animated.View>

      <TouchableOpacity
        style={[styles.beginBtn, { backgroundColor: colors.primary, marginHorizontal: 20 }]}
        onPress={() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onBegin();
        }}
        activeOpacity={0.85}
      >
        <Text style={[styles.beginText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
          Begin
        </Text>
        <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 16,
  },
  orb: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  orbInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: "center",
    alignItems: "center",
  },
  title: { fontSize: 32, textAlign: "center" },
  subtitle: { fontSize: 16, textAlign: "center", lineHeight: 24, marginBottom: 8 },
  bullets: { width: "100%", gap: 10 },
  bullet: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  bulletText: { flex: 1, fontSize: 14, lineHeight: 20 },
  beginBtn: {
    height: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  beginText: { fontSize: 16 },
});
