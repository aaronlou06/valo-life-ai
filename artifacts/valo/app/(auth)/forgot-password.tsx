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
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useValoAuth } from "@/contexts/AuthContext";

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { requestPasswordReset } = useValoAuth();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  const handleSend = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    try {
      await requestPasswordReset(trimmed);
      // Always advance to the code screen with a neutral message — the server
      // never reveals whether the address is registered.
      router.push({ pathname: "/(auth)/reset-password", params: { email: trimmed } });
    } catch (e: any) {
      setError(e.message ?? "Could not send a reset code. Please try again.");
    } finally {
      setLoading(false);
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
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Reset password</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Enter your email and we'll send you a 6-digit code to reset your password.
          </Text>
        </View>

        <TextInput
          style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]}
          value={email}
          onChangeText={setEmail}
          placeholder="Email address"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          returnKeyType="send"
          onSubmitEditing={handleSend}
          autoFocus
        />

        {!!error && <Text style={[styles.error, { fontFamily: "Inter_400Regular" }]}>{error}</Text>}

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.primary, opacity: (!email.trim() || loading) ? 0.5 : 1 }]}
          onPress={handleSend}
          disabled={!email.trim() || loading}
        >
          {loading
            ? <ActivityIndicator color={colors.primaryForeground} />
            : <Text style={[styles.btnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>Send reset code</Text>}
        </TouchableOpacity>
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
  error: { color: "#D4473E", fontSize: 13, marginBottom: 10 },
  btn: { height: 50, borderRadius: 12, justifyContent: "center", alignItems: "center", marginTop: 4 },
  btnText: { fontSize: 16 },
});
