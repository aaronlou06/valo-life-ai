import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  visible: boolean;
  getToken: () => Promise<string | null>;
  onDismiss: () => void;
}

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

export default function ReferralPromptModal({ visible, getToken, onDismiss }: Props) {
  const colors = useColors();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [redeemed, setRedeemed] = useState(false);

  const handleSubmit = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      onDismiss();
      return;
    }
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${getApiBase()}/api/referrals/redeem`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ code: trimmed }),
      });
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; redeemed: boolean };
        setRedeemed(data.redeemed);
        setDone(true);
      } else {
        onDismiss();
      }
    } catch {
      onDismiss();
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setCode("");
    setDone(false);
    setRedeemed(false);
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={handleClose} activeOpacity={1} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {done ? (
            <View style={styles.body}>
              <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                {redeemed ? "Code applied." : "Code not recognised."}
              </Text>
              <Text style={[styles.sub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {redeemed
                  ? "Your referral has been recorded. Welcome to Valo."
                  : "That code may have expired or already been used."}
              </Text>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={handleClose}
                activeOpacity={0.85}
              >
                <Text style={[styles.primaryBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                  Continue
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.body}>
              <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                Have a referral code?
              </Text>
              <Text style={[styles.sub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Enter it here and it will be applied to your account.
              </Text>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="Enter code"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => void handleSubmit()}
                style={[
                  styles.input,
                  {
                    color: colors.foreground,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                    fontFamily: "Inter_400Regular",
                  },
                ]}
              />
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={[styles.skipBtn, { borderColor: colors.border }]}
                  onPress={handleClose}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.skipBtnText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    Skip
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.primary, flex: 1, opacity: loading ? 0.7 : 1 }]}
                  onPress={() => void handleSubmit()}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.primaryForeground} size="small" />
                  ) : (
                    <Text style={[styles.primaryBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                      Apply
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingBottom: 34,
  },
  body: { padding: 24, gap: 16 },
  heading: { fontSize: 20, lineHeight: 28 },
  sub: { fontSize: 14, lineHeight: 22 },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  btnRow: { flexDirection: "row", gap: 10 },
  primaryBtn: { height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  primaryBtnText: { fontSize: 15 },
  skipBtn: { height: 52, borderRadius: 14, borderWidth: 1, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
  skipBtnText: { fontSize: 15 },
});
