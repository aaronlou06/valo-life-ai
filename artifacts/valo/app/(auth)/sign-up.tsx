import React, { useState, useCallback, useEffect } from "react";
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
import { useSignUp, useSSO } from "@clerk/expo";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { Link, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

WebBrowser.maybeCompleteAuthSession();

function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => { void WebBrowser.coolDownAsync(); };
  }, []);
}

export default function SignUpScreen() {
  useWarmUpBrowser();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signUp, errors, fetchStatus } = useSignUp();
  const { startSSOFlow } = useSSO();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [code, setCode] = useState("");

  const handleSignUp = async () => {
    const { error } = await signUp.password({ emailAddress: email, password });
    if (error) return;
    await signUp.verifications.sendEmailCode();
  };

  const handleVerify = async () => {
    await signUp.verifications.verifyEmailCode({ code });
    if (signUp.status === "complete") {
      await signUp.finalize({
        navigate: ({ decorateUrl }) => {
          const url = decorateUrl("/");
          if (url.startsWith("http")) { if (typeof window !== "undefined") window.location.href = url; }
          else router.replace("/(tabs)/today");
        },
      });
    }
  };

  const handleGoogle = useCallback(async () => {
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl: AuthSession.makeRedirectUri(),
      });
      if (createdSessionId) {
        setActive!({
          session: createdSessionId,
          navigate: () => router.replace("/(tabs)/today"),
        });
      }
    } catch (err) {
      console.error(err);
    }
  }, [startSSOFlow, router]);

  const isLoading = fetchStatus === "fetching";
  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const errorMsg = errors?.fields?.emailAddress?.message || errors?.fields?.password?.message || errors?.global?.[0]?.message;

  const needsVerification =
    signUp.status === "missing_requirements" &&
    signUp.unverifiedFields.includes("email_address") &&
    signUp.missingFields.length === 0;

  if (needsVerification) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView contentContainerStyle={[styles.container, { paddingTop: topPad + 40, paddingBottom: insets.bottom + 40 }]}>
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Check your email</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>We sent a code to {email}. Enter it below to verify.</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]}
            value={code}
            onChangeText={setCode}
            placeholder="6-digit code"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="numeric"
          />
          {errors?.fields?.code && <Text style={styles.error}>{errors.fields.code.message}</Text>}
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary, opacity: isLoading ? 0.6 : 1 }]}
            onPress={handleVerify}
            disabled={isLoading}
          >
            {isLoading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.btnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>Verify email</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => signUp.verifications.sendEmailCode()} style={styles.link}>
            <Text style={[styles.linkText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>Resend code</Text>
          </TouchableOpacity>
          <View nativeID="clerk-captcha" />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: topPad + 40, paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.logoArea}>
          <Image source={require("@/assets/images/icon.png")} style={styles.logo} />
          <Text style={[styles.appName, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>Join Valo</Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Start understanding yourself better</Text>
        </View>

        <TouchableOpacity style={[styles.googleBtn, { borderColor: colors.border, backgroundColor: colors.card }]} onPress={handleGoogle}>
          <Feather name="globe" size={18} color={colors.foreground} />
          <Text style={[styles.googleBtnText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>Continue with Google</Text>
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.dividerText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>or</Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        <TextInput
          style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]}
          value={email}
          onChangeText={setEmail}
          placeholder="Email address"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <View style={styles.passRow}>
          <TextInput
            style={[styles.input, { flex: 1, backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground, fontFamily: "Inter_400Regular" }]}
            value={password}
            onChangeText={setPassword}
            placeholder="Choose a password"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry={!showPass}
          />
          <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPass((v) => !v)}>
            <Feather name={showPass ? "eye-off" : "eye"} size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {!!errorMsg && <Text style={[styles.error, { fontFamily: "Inter_400Regular" }]}>{errorMsg}</Text>}

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.primary, opacity: (!email || !password || isLoading) ? 0.5 : 1 }]}
          onPress={handleSignUp}
          disabled={!email || !password || isLoading}
        >
          {isLoading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.btnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>Create account</Text>}
        </TouchableOpacity>

        <View style={styles.footerRow}>
          <Text style={[styles.footerText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>Already have an account? </Text>
          <Link href="/(auth)/sign-in">
            <Text style={[styles.linkText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>Sign in</Text>
          </Link>
        </View>

        <View nativeID="clerk-captcha" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 28 },
  logoArea: { alignItems: "center", marginBottom: 36 },
  logo: { width: 64, height: 64, borderRadius: 16, marginBottom: 12 },
  appName: { fontSize: 28, marginBottom: 4 },
  tagline: { fontSize: 15 },
  googleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderWidth: 1, borderRadius: 12, height: 50, marginBottom: 20 },
  googleBtnText: { fontSize: 15 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13 },
  input: { height: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, fontSize: 15, marginBottom: 12 },
  passRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  eyeBtn: { position: "absolute", right: 14, top: 14 },
  error: { color: "#D4473E", fontSize: 13, marginBottom: 10 },
  btn: { height: 50, borderRadius: 12, justifyContent: "center", alignItems: "center", marginTop: 4, marginBottom: 20 },
  btnText: { fontSize: 16 },
  footerRow: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  footerText: { fontSize: 14 },
  linkText: { fontSize: 14 },
  link: { alignItems: "center", marginTop: 12 },
  title: { fontSize: 24, marginBottom: 8 },
  subtitle: { fontSize: 15, marginBottom: 24 },
});
