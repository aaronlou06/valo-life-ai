import React, { useEffect } from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { consumePkceVerifier, exchangeGoogleAuthCode } from "@/lib/googleCalendar";
import { useValoAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

/**
 * OAuth 2.0 callback screen for Google Calendar.
 *
 * When the user completes Google sign-in, Google redirects to:
 *   com.aaronlou06.valo:/oauth2redirect/google?code=XXX
 *
 * Expo Router maps this to this screen (strips the scheme, matches the path).
 * This is the authoritative handler — the Linking listener in profile.tsx was
 * removed to avoid races.
 */
export default function GoogleOAuthCallback() {
  const { code, error, error_description } = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_description?: string;
  }>();
  const router = useRouter();
  const { getToken } = useValoAuth();
  const colors = useColors();

  useEffect(() => {
    void (async () => {
      if (error) {
        const desc = error_description
          ? decodeURIComponent(String(error_description).replace(/\+/g, " "))
          : null;
        console.log("[GCal] OAuth error in redirect:", error, desc);
        router.replace("/(tabs)/profile");
        return;
      }

      const rawCode = Array.isArray(code) ? code[0] : code;
      if (!rawCode) {
        console.log("[GCal] No auth code in redirect URL");
        router.replace("/(tabs)/profile");
        return;
      }

      const authCode = decodeURIComponent(rawCode);
      const verifier = await consumePkceVerifier();

      if (!verifier) {
        console.log("[GCal] No PKCE verifier — session may have expired. Redirecting.");
        router.replace("/(tabs)/profile");
        return;
      }

      console.log("[GCal] OAuth screen handling token exchange");
      const ok = await exchangeGoogleAuthCode(authCode, verifier, getToken);
      console.log("[GCal] Token exchange:", ok ? "success" : "failed");

      router.replace("/(tabs)/profile");
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        Connecting your calendar...
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  label: {
    fontSize: 15,
  },
});
