import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Clipboard,
  ActivityIndicator,
  Alert,
  Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useValoAuth } from "@/contexts/AuthContext";

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

interface DashboardData {
  hasAccess: boolean;
  code: string | null;
  link: string | null;
  expiresAt: string | null;
  totalSent: number;
  totalConverted: number;
  lifetimeEarned: number;
  balanceAvailable: number;
  currentTier: 1 | 2 | 3;
  conversionsToNextTier: number | null;
}

const TIER_LABELS: Record<number, string> = {
  1: "Advocate",
  2: "Champion",
  3: "Legend",
};

export default function ReferralsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useValoAuth();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${getApiBase()}/api/referrals/dashboard`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const d = (await res.json()) as DashboardData;
        setData(d);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  async function handleCopy() {
    if (!data?.link) return;
    Clipboard.setString(data.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    if (!data?.link) return;
    try {
      await Share.share({ message: `Join me on Valo — your personal AI life companion: ${data.link}` });
    } catch {
      // ignore
    }
  }

  async function handleGenerateCode() {
    setGenerating(true);
    try {
      const token = await getToken();
      const res = await fetch(`${getApiBase()}/api/referrals/generate-code`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        void load();
      }
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  }

  async function handleRegenerate() {
    Alert.alert(
      "Regenerate link?",
      "Your current link will expire and a new 30-day link will be created.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Regenerate",
          style: "destructive",
          onPress: async () => {
            setRegenerating(true);
            try {
              const token = await getToken();
              const res = await fetch(`${getApiBase()}/api/referrals/regenerate`, {
                method: "POST",
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              });
              if (res.ok) void load();
            } catch {
              // ignore
            } finally {
              setRegenerating(false);
            }
          },
        },
      ],
    );
  }

  function daysUntil(isoDate: string | null): number | null {
    if (!isoDate) return null;
    const diff = new Date(isoDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const topPad = insets.top + 8;

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topPad + 16, paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.pageTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Referrals
        </Text>
        <View style={{ width: 22 }} />
      </View>

      {!data?.hasAccess ? (
        <View style={[styles.lockedBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="lock" size={28} color={colors.mutedForeground} />
          <Text style={[styles.lockedTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Referrals unlock after your first payment
          </Text>
          <Text style={[styles.lockedBody, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Once you have an active subscription, you can share your referral link and earn free months.
          </Text>
        </View>
      ) : (
        <>
          {data.link ? (
            <View style={[styles.linkCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.linkLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                Your referral link
              </Text>
              <Text
                style={[styles.linkText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
                numberOfLines={1}
              >
                {data.link}
              </Text>
              <View style={styles.linkActions}>
                <TouchableOpacity
                  style={[styles.linkBtn, { backgroundColor: colors.primary }]}
                  onPress={handleCopy}
                >
                  <Feather name={copied ? "check" : "copy"} size={15} color={colors.primaryForeground} />
                  <Text style={[styles.linkBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                    {copied ? "Copied" : "Copy"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.linkBtn, { backgroundColor: colors.muted }]}
                  onPress={handleShare}
                >
                  <Feather name="share-2" size={15} color={colors.foreground} />
                  <Text style={[styles.linkBtnText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                    Share
                  </Text>
                </TouchableOpacity>
              </View>
              {data.expiresAt && (
                <Text style={[styles.expiryNote, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  Expires in {daysUntil(data.expiresAt)} days
                </Text>
              )}
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.generateBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
              onPress={handleGenerateCode}
              disabled={generating}
            >
              {generating ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.generateBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                  Generate my referral link
                </Text>
              )}
            </TouchableOpacity>
          )}

          <View style={styles.statsGrid}>
            {[
              { label: "Referrals sent", value: data.totalSent },
              { label: "Conversions", value: data.totalConverted },
              { label: "Lifetime free months", value: data.lifetimeEarned },
              { label: "Available", value: data.balanceAvailable },
            ].map(({ label, value }) => (
              <View key={label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.statValue, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                  {value}
                </Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {label}
                </Text>
              </View>
            ))}
          </View>

          <View style={[styles.tierCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.tierHeader}>
              <Text style={[styles.tierName, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                {TIER_LABELS[data.currentTier] ?? "Advocate"}
              </Text>
              <View style={[styles.tierBadge, { backgroundColor: "#FBF0E6" }]}>
                <Text style={[styles.tierBadgeText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                  Tier {data.currentTier}
                </Text>
              </View>
            </View>
            <Text style={[styles.tierDesc, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {data.currentTier === 1
                ? "Every friend who pays = 1 free month for you"
                : data.currentTier === 2
                ? "Every 2 friends who pay = 1 free month for you"
                : "Every 3 friends who pay = 1 free month for you"}
            </Text>
            {data.conversionsToNextTier !== null && (
              <View style={styles.nextTierRow}>
                <Text style={[styles.nextTierText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {data.conversionsToNextTier} more free month{data.conversionsToNextTier !== 1 ? "s" : ""} to Tier {data.currentTier + 1}
                </Text>
                <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: colors.primary,
                        width: `${Math.min(100, (data.lifetimeEarned / (data.currentTier === 1 ? 4 : 7)) * 100)}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            )}
          </View>

          {data.link && (
            <TouchableOpacity
              style={styles.regenerateLink}
              onPress={handleRegenerate}
              disabled={regenerating}
            >
              {regenerating ? (
                <ActivityIndicator color={colors.mutedForeground} size="small" />
              ) : (
                <Text style={[styles.regenerateLinkText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  Regenerate link
                </Text>
              )}
            </TouchableOpacity>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  pageTitle: { fontSize: 20 },
  lockedBox: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    gap: 12,
  },
  lockedTitle: { fontSize: 16, textAlign: "center" },
  lockedBody: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  linkCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 10,
    marginBottom: 20,
  },
  linkLabel: { fontSize: 12 },
  linkText: { fontSize: 14, letterSpacing: 0.3 },
  linkActions: { flexDirection: "row", gap: 10 },
  linkBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  linkBtnText: { fontSize: 14 },
  expiryNote: { fontSize: 12 },
  generateBtn: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  generateBtnText: { fontSize: 16 },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    width: "47%",
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  statValue: { fontSize: 28 },
  statLabel: { fontSize: 13 },
  tierCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 10,
    marginBottom: 20,
  },
  tierHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tierName: { fontSize: 18 },
  tierBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  tierBadgeText: { fontSize: 12 },
  tierDesc: { fontSize: 14, lineHeight: 20 },
  nextTierRow: { gap: 8 },
  nextTierText: { fontSize: 13 },
  progressTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2 },
  regenerateLink: { alignItems: "center", paddingVertical: 8 },
  regenerateLinkText: { fontSize: 14 },
});
