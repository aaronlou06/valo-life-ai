import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useValoAuth } from "@/contexts/AuthContext";

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

export default function ReferralOfferScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useValoAuth();

  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchCode = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const token = await getToken();
      const res = await fetch(`${getApiBase()}/api/referrals/generate-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { link: string };
      setLink(data.link);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchCode();
  }, [fetchCode]);

  const handleShare = async () => {
    if (!link) return;
    await Share.share({ message: `Join me on Valo — your AI life companion: ${link}` });
  };

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
          Share your personal link. Each friend who pays earns you a free month — no subscription required to refer.
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

        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />
        ) : error ? (
          <TouchableOpacity onPress={fetchCode} style={{ marginTop: 8, alignItems: "center" }}>
            <Text style={[{ color: colors.primary, fontSize: 14, fontFamily: "Inter_400Regular" }]}>
              Could not load your link — tap to retry
            </Text>
          </TouchableOpacity>
        ) : link ? (
          <View style={[styles.linkBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text
              numberOfLines={1}
              style={[styles.linkText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
            >
              {link}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        {!loading && !error && link ? (
          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
            onPress={handleShare}
          >
            <Feather name="share-2" size={18} color={colors.primaryForeground} style={{ marginRight: 8 }} />
            <Text style={[styles.shareBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
              Share referral link
            </Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[styles.ctaBtn, { borderColor: colors.border }]}
          activeOpacity={0.85}
          onPress={() => router.back()}
        >
          <Text style={[styles.ctaBtnText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Start subscription
          </Text>
        </TouchableOpacity>
      </View>
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
  linkBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
  },
  linkText: { fontSize: 13 },
  actions: { gap: 12 },
  shareBtn: {
    height: 58,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  shareBtnText: { fontSize: 17 },
  ctaBtn: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaBtnText: { fontSize: 16 },
});
