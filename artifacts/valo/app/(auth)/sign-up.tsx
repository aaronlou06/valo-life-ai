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
  Image,
  KeyboardAvoidingView,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useValoAuth } from "@/contexts/AuthContext";

export default function SignUpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signUp } = useValoAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  const handleSignUp = async () => {
    if (!email || !password) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await signUp(email.trim(), password);
      router.replace("/(tabs)/today");
    } catch (e: any) {
      setError(e.message ?? "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: topPad + 40, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoArea}>
          <Image source={require("@/assets/images/icon.png")} style={styles.logo} />
          <Text style={[styles.appName, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Join Valo</Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Start understanding yourself better</Text>
        </View>

        <TextInput
          style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]}
          value={email}
          onChangeText={setEmail}
          placeholder="Email address"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="email-address"
          autoCapitalize="none"
          returnKeyType="next"
        />

        <View style={styles.passRow}>
          <TextInput
            style={[styles.input, { flex: 1, backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]}
            value={password}
            onChangeText={setPassword}
            placeholder="Choose a password (8+ characters)"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry={!showPass}
            returnKeyType="done"
            onSubmitEditing={handleSignUp}
          />
          <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPass((v) => !v)}>
            <Feather name={showPass ? "eye-off" : "eye"} size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {!!error && <Text style={[styles.error, { fontFamily: "Inter_400Regular" }]}>{error}</Text>}

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.primary, opacity: (!email || !password || loading) ? 0.5 : 1 }]}
          onPress={handleSignUp}
          disabled={!email || !password || loading}
        >
          {loading
            ? <ActivityIndicator color={colors.primaryForeground} />
            : <Text style={[styles.btnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>Create account</Text>}
        </TouchableOpacity>

        <View style={styles.footerRow}>
          <Text style={[styles.footerText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Already have an account? </Text>
          <Link href="/(auth)/sign-in">
            <Text style={[styles.linkText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>Sign in</Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 28 },
  logoArea: { alignItems: "center", marginBottom: 40 },
  logo: { width: 64, height: 64, borderRadius: 16, marginBottom: 12 },
  appName: { fontSize: 28, marginBottom: 4 },
  tagline: { fontSize: 15 },
  input: { height: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, fontSize: 15, marginBottom: 12 },
  passRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  eyeBtn: { position: "absolute", right: 14, top: 14 },
  error: { color: "#D4473E", fontSize: 13, marginBottom: 10 },
  btn: { height: 50, borderRadius: 12, justifyContent: "center", alignItems: "center", marginTop: 4, marginBottom: 20 },
  btnText: { fontSize: 16 },
  footerRow: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  footerText: { fontSize: 14 },
  linkText: { fontSize: 14 },
});
