import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { ClerkProvider, ClerkLoaded, ClerkLoading } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { setBaseUrl } from "@workspace/api-client-react";

import { ErrorBoundary } from "@/components/ErrorBoundary";

const domain = process.env.EXPO_PUBLIC_DOMAIN;
if (domain) setBaseUrl(`https://${domain}`);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Publishable keys are intentionally public — safe to embed in client code.
// This fallback ensures the app boots even when EXPO_PUBLIC_ vars are not
// baked into the native bundle (e.g. first Metro start before env is injected).
const FALLBACK_PUBLISHABLE_KEY = "pk_test_ZGVzaXJlZC1haXJlZGFsZS0zNy5jbGVyay5hY2NvdW50cy5kZXYk";

const envKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
console.log(
  "[Valo] Clerk env key present:", !!envKey,
  "| first 10:", envKey?.slice(0, 10) ?? "(none)",
);
const publishableKey = envKey || FALLBACK_PUBLISHABLE_KEY;
console.log("[Valo] Using publishable key first 10:", publishableKey.slice(0, 10));

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
      <Stack.Screen name="settings" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary
      onError={(err, stack) => console.log("[Valo] RootLayout error:", err.message, stack)}
    >
      <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
        <ClerkLoading>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F7F5F2" }}>
            <ActivityIndicator size="large" color="#C17B3F" />
            <Text style={{ marginTop: 12, color: "#8B8780", fontFamily: "System" }}>
              Loading...
            </Text>
          </View>
        </ClerkLoading>
        <ClerkLoaded>
          <SafeAreaProvider>
            <ErrorBoundary
              onError={(err, stack) =>
                console.log("[Valo] Inner error after ClerkLoaded:", err.message, stack)
              }
            >
              <QueryClientProvider client={queryClient}>
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <KeyboardProvider>
                    <RootLayoutNav />
                  </KeyboardProvider>
                </GestureHandlerRootView>
              </QueryClientProvider>
            </ErrorBoundary>
          </SafeAreaProvider>
        </ClerkLoaded>
      </ClerkProvider>
    </ErrorBoundary>
  );
}
