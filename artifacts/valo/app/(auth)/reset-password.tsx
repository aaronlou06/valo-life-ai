import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useValoAuth } from "@/contexts/AuthContext";

const CODE_LENGTH = 6;
const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = typeof params.email === "string" ? params.email : "";
  const { resetPassword, requestPasswordReset } = useValoAuth();

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  const validate = (): string | null => {
    if (code.trim().length !== CODE_LENGTH) return `Enter the ${CODE_LENGTH}-digit code from your email.`;
    if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    if (password !== confirm) return "Passwords do not match.";
    return null;
  };

  const handleReset = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await resetPassword(email, code.trim(), password);
      router.replace({ pathname: "/(auth)/sign-in", params: { reset: "1" } });
    } catch (e: any) {
      setError(e.message ?? "Could not reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    setError("");
    setNotice("");
    try {
      await requestPasswordReset(email);
      setNotice("If an account exists for that email, a new code is on its way.");
    } catch (e: any) {
      setError(e.message ?? "Could not resend the code. Please try again.");
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: topPad + 16, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Enter your code</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            If an account exists for {email ? email : "that email"}, we've sent a {CODE_LENGTH}-digit code. Enter it below with your new password.
          </Text>
        </View>

        <TextInput
          style={[styles.input, styles.codeInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}
          value={code}
          onChangeText={(t) => setCode(t.replace(/[^0-9]/g, "").slice(0, CODE_LENGTH))}
          placeholder="000000"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="number-pad"
          maxLength={CODE_LENGTH}
          returnKeyType="next"
        />

        <View style={styles.passRow}>
          <TextInput
            style={[styles.input, { flex: 1, backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]}
            value={password}
            onChangeText={setPassword}
            placeholder="New password"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry={!showPass}
            autoCapitalize="none"
            returnKeyType="next"
          />
          <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPass((v) => !v)}>
            <Feather name={showPass ? "eye-off" : "eye"} size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <TextInput
          style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]}
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Confirm new password"
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry={!showPass}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={handleReset}
        />

        {!!error && <Text style={[styles.error, { fontFamily: "Inter_400Regular" }]}>{error}</Text>}
        {!!notice && <Text style={[styles.notice, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{notice}</Text>}

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.primary, opacity: loading ? 0.5 : 1 }]}
          onPress={handleReset}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={colors.primaryForeground} />
            : <Text style={[styles.btnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>Reset password</Text>}
        </TouchableOpacity>

        <View style={styles.footerRow}>
          <Text style={[styles.footerText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Didn't get a code? </Text>
          <TouchableOpacity onPress={handleResend} disabled={resending}>
            <Text style={[styles.linkText, { color: colors.primary, fontFamily: "Inter_500Medium", opacity: resending ? 0.5 : 1 }]}>
              {resending ? "Sending..." : "Resend code"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 28 },
  backBtn: { width: 40, height: 40, justifyContent: "center", marginBottom: 12 },
  header: { marginBottom: 28 },
  title: { fontSize: 28, marginBottom: 10 },
  subtitle: { fontSize: 15, lineHeight: 22 },
  input: { height: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, fontSize: 15, marginBottom: 12 },
  codeInput: { fontSize: 22, letterSpacing: 8, textAlign: "center" },
  passRow: { flexDirection: "row", alignItems: "center" },
  eyeBtn: { position: "absolute", right: 14, top: 14 },
  error: { color: "#D4473E", fontSize: 13, marginBottom: 10 },
  notice: { fontSize: 13, marginBottom: 10 },
  btn: { height: 50, borderRadius: 12, justifyContent: "center", alignItems: "center", marginTop: 4, marginBottom: 20 },
  btnText: { fontSize: 16 },
  footerRow: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  footerText: { fontSize: 14 },
  linkText: { fontSize: 14 },
});
