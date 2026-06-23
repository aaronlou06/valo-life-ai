import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useValoAuth } from "@/contexts/AuthContext";
import HelcimPayWebView from "@/components/HelcimPayWebView";

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

const FEATURES = [
  "Daily AI-powered check-ins via voice",
  "Goal tracking with smart progress insights",
  "Habit building with streak analytics",
  "Workout co-pilot and health tracking",
  "Weekly performance recaps",
  "Accountability buddy system",
];

export default function PaywallScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { status, hadTrial, refresh } = useSubscription();
  const { getToken } = useValoAuth();

  const [helcimVisible, setHelcimVisible] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [successBanner, setSuccessBanner] = useState(false);

  const isWinback = hadTrial && (status === "expired" || status === "canceled");

  async function handlePaymentSuccess(helcimTransactionId: string, amountCents: number) {
    setHelcimVisible(false);
    setConfirming(true);
    try {
      const token = await getToken();
      const res = await fetch(`${getApiBase()}/api/payment/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ helcimTransactionId, amountCents }),
      });
      if (res.ok) {
        refresh();
        setSuccessBanner(true);
        setTimeout(() => {
          router.replace("/(tabs)");
        }, 1500);
      }
    } catch {
      // Payment confirmed server-side via webhook as backstop
      refresh();
      router.replace("/(tabs)");
    } finally {
      setConfirming(false);
    }
  }

  if (successBanner) {
    return (
      <View style={[styles.successContainer, { backgroundColor: colors.background, paddingTop: insets.top + 40 }]}>
        <Feather name="check-circle" size={56} color={colors.primary} />
        <Text style={[styles.successTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Welcome to Valo
        </Text>
        <Text style={[styles.successSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Your subscription is active.
        </Text>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.lockup}>
          <Text style={[styles.brand, { color: colors.primary, fontFamily: "Inter_700Bold" }]}>Valo</Text>
          {!isWinback && (
            <View style={[styles.trialBadge, { backgroundColor: "#FBF0E6" }]}>
              <Text style={[styles.trialBadgeText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                7-day free trial included
              </Text>
            </View>
          )}
          <Text style={[styles.headline, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Your personal AI life companion
          </Text>
          <Text style={[styles.subhead, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {isWinback
              ? "Reactivate your account to continue tracking your goals and growth."
              : "Start free, no card required. Cancel anytime."}
          </Text>
        </View>

        <View style={[styles.pricingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>$20</Text>
            <Text style={[styles.pricePer, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              / month
            </Text>
          </View>
          <Text style={[styles.priceNote, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Billed monthly. Cancel anytime.
          </Text>
        </View>

        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f} style={styles.featureRow}>
              <Feather name="check" size={16} color={colors.primary} />
              <Text style={[styles.featureText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                {f}
              </Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
          onPress={() => setHelcimVisible(true)}
          disabled={confirming}
        >
          {confirming ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={[styles.ctaBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
              Start subscription — $20/mo
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryLink}
          activeOpacity={0.7}
          onPress={() => router.push("/referral-offer")}
        >
          <Text style={[styles.secondaryLinkText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            I'd rather not pay right now
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <HelcimPayWebView
        visible={helcimVisible}
        onClose={() => setHelcimVisible(false)}
        onSuccess={handlePaymentSuccess}
        getToken={getToken}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24 },
  lockup: { alignItems: "center", marginBottom: 32 },
  brand: { fontSize: 32, marginBottom: 12 },
  trialBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  trialBadgeText: { fontSize: 13 },
  headline: { fontSize: 26, textAlign: "center", lineHeight: 34, marginBottom: 10 },
  subhead: { fontSize: 15, textAlign: "center", lineHeight: 22 },
  pricingCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: "center",
    marginBottom: 28,
  },
  priceRow: { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  price: { fontSize: 40, lineHeight: 44 },
  pricePer: { fontSize: 17, paddingBottom: 6 },
  priceNote: { fontSize: 13, marginTop: 6 },
  features: { gap: 14, marginBottom: 32 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  featureText: { fontSize: 15, flex: 1 },
  ctaBtn: {
    height: 58,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  ctaBtnText: { fontSize: 17 },
  secondaryLink: { alignItems: "center", paddingVertical: 8 },
  secondaryLinkText: { fontSize: 14 },
  successContainer: { flex: 1, alignItems: "center", paddingHorizontal: 32 },
  successTitle: { fontSize: 26, marginTop: 20, marginBottom: 8 },
  successSub: { fontSize: 16, textAlign: "center" },
});
