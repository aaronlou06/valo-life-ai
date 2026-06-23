import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useSubscription } from "@/contexts/SubscriptionContext";

function formatTimeRemaining(isoDate: string | null): string {
  if (!isoDate) return "";
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return "Access expired";
  const hours = Math.ceil(diff / (1000 * 60 * 60));
  if (hours <= 24) return `${hours} hour${hours !== 1 ? "s" : ""} remaining`;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return `${days} day${days !== 1 ? "s" : ""} remaining`;
}

let shownThisSession = false;

export default function GracePeriodPrompt() {
  const colors = useColors();
  const router = useRouter();
  const { status, graceEndsAt } = useSubscription();
  const [visible, setVisible] = useState(false);
  const slideAnim = new Animated.Value(100);

  useEffect(() => {
    if (status === "grace" && !shownThisSession) {
      shownThisSession = true;
      setVisible(true);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 15,
        stiffness: 120,
      }).start();
    }
  }, [status]);

  function dismiss() {
    Animated.timing(slideAnim, {
      toValue: 120,
      duration: 220,
      useNativeDriver: true,
    }).start(() => setVisible(false));
  }

  if (!visible || status !== "grace") return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: colors.card, borderColor: colors.border },
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.inner}>
        <View style={styles.textBlock}>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Trial ended
          </Text>
          <Text style={[styles.sub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {formatTimeRemaining(graceEndsAt)} — subscribe to keep access.
          </Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
            onPress={() => { dismiss(); router.push("/paywall"); }}
            activeOpacity={0.85}
          >
            <Text style={[styles.ctaText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
              Choose a plan
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 90,
    left: 16,
    right: 16,
    borderWidth: 1,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 6,
    zIndex: 999,
  },
  inner: {
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  textBlock: { flex: 1, gap: 2 },
  title: { fontSize: 15 },
  sub: { fontSize: 13 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  ctaBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  ctaText: { fontSize: 13 },
});
