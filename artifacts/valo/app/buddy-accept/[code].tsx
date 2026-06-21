import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { useAcceptBuddyInvite, getListBuddiesQueryKey } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useValoAuth } from "@/contexts/AuthContext";

const TERRACOTTA = "#C17B3F";
const SAGE = "#6B9E78";

export default function BuddyAcceptScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { name, updateName } = useValoAuth();
  const params = useLocalSearchParams<{ code?: string }>();
  const code = (params.code ?? "").trim();

  const [displayName, setDisplayName] = useState(name ?? "");
  const [accepted, setAccepted] = useState(false);
  const [inviterName, setInviterName] = useState<string | null>(null);
  const acceptInvite = useAcceptBuddyInvite();

  const topPad = (Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top) + 12;

  const accept = async () => {
    if (acceptInvite.isPending || !code) return;
    const trimmed = displayName.trim();
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const res = await acceptInvite.mutateAsync({
        data: { code, ...(trimmed ? { displayName: trimmed } : {}) },
      });
      if (trimmed) updateName(trimmed);
      setInviterName(res.inviterDisplayName ?? null);
      queryClient.invalidateQueries({ queryKey: getListBuddiesQueryKey() });
      setAccepted(true);
    } catch {
      // surfaced via acceptInvite.isError
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.safe, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: topPad, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.iconBtn}>
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Buddy invite
        </Text>
        <View style={styles.iconBtn} />
      </View>

      <View style={{ padding: 16, flex: 1 }}>
        {accepted ? (
          <View style={styles.successWrap}>
            <View style={[styles.successIcon, { backgroundColor: `${SAGE}1F` }]}>
              <Feather name="check" size={28} color={SAGE} />
            </View>
            <Text style={[styles.successTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              {inviterName ? `You and ${inviterName} are connected` : "You're connected"}
            </Text>
            <Text style={[styles.lead, { color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" }]}>
              You can now support each other's commitments.
            </Text>
            <TouchableOpacity
              onPress={() => router.replace("/accountability-buddy")}
              activeOpacity={0.85}
              style={[styles.primaryBtn, { backgroundColor: TERRACOTTA }]}
            >
              <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>Go to Accountability</Text>
            </TouchableOpacity>
          </View>
        ) : !code ? (
          <Text style={[styles.lead, { color: colors.destructive, fontFamily: "Inter_400Regular" }]}>
            This invite link is missing its code.
          </Text>
        ) : (
          <>
            <Text style={[styles.lead, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Accept this invite to become accountability buddies. You'll each only see the commitments the other chooses to share.
            </Text>
            <Text style={[styles.label, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
              Your name
            </Text>
            <Text style={[styles.help, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              This is how your buddy will see you.
            </Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="e.g. Sam"
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.input,
                { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" },
              ]}
            />
            {acceptInvite.isError && (
              <Text style={[styles.errorText, { color: colors.destructive, fontFamily: "Inter_400Regular" }]}>
                This invite could not be accepted. It may have expired or already been used.
              </Text>
            )}
            <TouchableOpacity
              onPress={accept}
              activeOpacity={0.85}
              disabled={acceptInvite.isPending}
              style={[styles.primaryBtn, { backgroundColor: TERRACOTTA, opacity: acceptInvite.isPending ? 0.7 : 1 }]}
            >
              {acceptInvite.isPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>Accept invite</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18 },
  lead: { fontSize: 14, lineHeight: 21, marginBottom: 24 },
  label: { fontSize: 14, marginBottom: 4 },
  help: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  errorText: { fontSize: 13, marginTop: 10 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 15 },
  successWrap: { alignItems: "center", paddingTop: 40 },
  successIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  successTitle: { fontSize: 20, marginBottom: 8 },
});
