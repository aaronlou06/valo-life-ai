import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

export default function ReferralOfferScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <TouchableOpacity
        onPress={() => router.back()}
        style={[styles.backBtn, { top: insets.top + 12 }]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Feather name="x" size={22} color={colors.mutedForeground} />
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={[styles.emoji, { color: colors.foreground }]}>Earn free months</Text>
        <Text style={[styles.headline, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Know someone who'd love Valo?
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Once your account is active, you can share a personal referral link. Each friend who pays earns you a free month.
        </Text>

        <View style={[styles.tierCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.tierTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Referral tiers
          </Text>
          <View style={styles.tierRow}>
            <Text style={[styles.tierLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Months 1–3 earned
            </Text>
            <Text style={[styles.tierValue, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
              1 friend = 1 free month
            </Text>
          </View>
          <View style={styles.tierRow}>
            <Text style={[styles.tierLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Months 4–6 earned
            </Text>
            <Text style={[styles.tierValue, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
              2 friends = 1 free month
            </Text>
          </View>
          <View style={styles.tierRow}>
            <Text style={[styles.tierLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              7+ months earned
            </Text>
            <Text style={[styles.tierValue, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
              3 friends = 1 free month
            </Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
        activeOpacity={0.85}
        onPress={() => router.back()}
      >
        <Text style={[styles.ctaBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
          Start subscription
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  backBtn: { position: "absolute", right: 20 },
  content: { flex: 1, justifyContent: "center", gap: 16 },
  emoji: { fontSize: 28, textAlign: "center", marginBottom: 4 },
  headline: { fontSize: 24, textAlign: "center", lineHeight: 32 },
  body: { fontSize: 15, textAlign: "center", lineHeight: 22 },
  tierCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
    gap: 12,
    marginTop: 8,
  },
  tierTitle: { fontSize: 15, marginBottom: 4 },
  tierRow: { gap: 2 },
  tierLabel: { fontSize: 13 },
  tierValue: { fontSize: 14 },
  ctaBtn: {
    height: 58,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaBtnText: { fontSize: 17 },
});
