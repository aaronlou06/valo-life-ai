import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { setBaseUrl } from "@workspace/api-client-react";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";

console.log("[Valo] _layout module loaded");

const domain = process.env.EXPO_PUBLIC_DOMAIN;
if (domain) setBaseUrl(`https://${domain}`);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
      <Stack.Screen name="settings" />
      <Stack.Screen name="goal" />
    </Stack>
  );
}

export default function RootLayout() {
  console.log("[Valo] RootLayout rendering");

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    console.log("[Valo] fonts state — loaded:", fontsLoaded, "error:", fontError);
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F7F5F2", justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: "#C17B3F", fontSize: 16, marginBottom: 12 }}>Valo is loading</Text>
        <ActivityIndicator color="#C17B3F" />
      </View>
    );
  }

  console.log("[Valo] RootLayout mounting full tree");

  return (
    <ErrorBoundary
      onError={(error, stack) => {
        console.error("[Valo] Tree error:", error.message);
        console.error("[Valo] Stack:", stack);
      }}
    >
      <AuthProvider>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </SafeAreaProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
