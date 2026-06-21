import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useCreateBuddyInvite, type BuddyInviteResponse } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useValoAuth } from "@/contexts/AuthContext";

const TERRACOTTA = "#C17B3F";

export default function BuddyInviteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { name, updateName } = useValoAuth();

  const [displayName, setDisplayName] = useState(name ?? "");
  const [invite, setInvite] = useState<BuddyInviteResponse | null>(null);
  const createInvite = useCreateBuddyInvite();

  const topPad = (Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top) + 12;

  const generate = async () => {
    if (createInvite.isPending) return;
    const trimmed = displayName.trim();
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const res = await createInvite.mutateAsync({
        data: trimmed ? { displayName: trimmed } : {},
      });
      if (trimmed) updateName(trimmed);
      setInvite(res);
    } catch {
      // surfaced via createInvite.isError below
    }
  };

  const share = async () => {
    if (!invite) return;
    try {
      await Share.share({
        message: `Be my accountability buddy on Valo. Tap to join: ${invite.shareUrl}`,
      });
    } catch {
      // user dismissed share sheet
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.safe, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: topPad, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Invite a buddy
        </Text>
        <View style={styles.iconBtn} />
      </View>

      <View style={{ padding: 16, flex: 1 }}>
        {!invite ? (
          <>
            <Text style={[styles.lead, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              An accountability buddy can see the commitments you choose to share, and cheer you on.
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
              placeholder="e.g. Alex"
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.input,
                { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" },
              ]}
            />
            {createInvite.isError && (
              <Text style={[styles.errorText, { color: colors.destructive, fontFamily: "Inter_400Regular" }]}>
                Could not create an invite. Please try again.
              </Text>
            )}
            <TouchableOpacity
              onPress={generate}
              activeOpacity={0.85}
              disabled={createInvite.isPending}
              style={[styles.primaryBtn, { backgroundColor: TERRACOTTA, opacity: createInvite.isPending ? 0.7 : 1 }]}
            >
              {createInvite.isPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Feather name="link" size={16} color="#FFFFFF" />
                  <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>
                    Generate invite link
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={[styles.codeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.codeLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                INVITE CODE
              </Text>
              <Text style={[styles.code, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                {invite.code}
              </Text>
              <Text style={[styles.expiry, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Expires {new Date(invite.expiresAt).toLocaleDateString()}
              </Text>
            </View>
            <TouchableOpacity
              onPress={share}
              activeOpacity={0.75}
              style={[styles.urlRow, { backgroundColor: colors.muted, borderColor: colors.border }]}
            >
              <Text
                style={[styles.urlText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
                numberOfLines={1}
              >
                {invite.shareUrl}
              </Text>
              <Feather name="share" size={15} color={colors.mutedForeground} />
            </TouchableOpacity>
            <Text style={[styles.help, { color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 16 }]}>
              One person, one use. Tap the link above or share below.
            </Text>
            <TouchableOpacity
              onPress={share}
              activeOpacity={0.85}
              style={[styles.primaryBtn, { backgroundColor: TERRACOTTA }]}
            >
              <Feather name="share-2" size={16} color="#FFFFFF" />
              <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>Share invite</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.secondaryBtn}>
              <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                Done
              </Text>
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
  secondaryBtn: { alignItems: "center", paddingVertical: 14, marginTop: 8 },
  secondaryBtnText: { fontSize: 14 },
  codeCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
  },
  codeLabel: { fontSize: 11, letterSpacing: 0.6, marginBottom: 8 },
  code: { fontSize: 30, letterSpacing: 4 },
  expiry: { fontSize: 12, marginTop: 10 },
  urlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginTop: 12,
    marginBottom: 4,
  },
  urlText: { flex: 1, fontSize: 12 },
});
