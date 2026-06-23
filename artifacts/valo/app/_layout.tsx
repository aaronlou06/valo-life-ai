import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { setBaseUrl } from "@workspace/api-client-react";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useValoAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { HolidayRegionProvider } from "@/contexts/HolidayRegionContext";
import { WorkoutCopilotProvider } from "@/contexts/WorkoutCopilotContext";
import { HeartRateProvider } from "@/contexts/HeartRateContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import GracePeriodPrompt from "@/components/GracePeriodPrompt";
import { WorkoutCopilotPanel } from "@/components/WorkoutCopilotPanel";
import { GOOGLE_OAUTH_PREFIX } from "@/lib/googleCalendar";
import { installErrorLogger } from "@/lib/errorLogger";
import { scheduleCheckinReminder, scheduleMorningBriefing } from "@/lib/notifications";
// Side-effect import: registers the BGAppRefreshTask handler at module-load time.
// TaskManager.defineTask must run before BackgroundFetch.registerTaskAsync is called.
import "@/lib/backgroundHealthSync";

installErrorLogger();

console.log("[Valo] _layout module loaded");

const domain = process.env.EXPO_PUBLIC_DOMAIN;
const apiBase = domain ? `https://${domain}` : "";
if (apiBase) setBaseUrl(apiBase);

if (__DEV__) {
  console.log("[Valo] API base URL:", apiBase || "(relative — no EXPO_PUBLIC_DOMAIN set)");
}

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const HEALTH_URL = `${apiBase}/api/health`;
const RETRY_COUNT = 5;
const RETRY_DELAY_MS = 2000;
const RECHECK_INTERVAL_MS = 15000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function checkServer(): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_URL, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

function NotificationRestoreEffect() {
  const { isLoaded, isSignedIn, getToken } = useValoAuth();
  const hasRestoredRef = useRef(false);

  useEffect(() => {
    // Wait until auth has finished loading and user is signed in.
    // hasRestoredRef ensures we run the restore exactly once per session.
    if (!isLoaded || !isSignedIn || hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    async function restore() {
      try {
        const token = await getToken();
        if (!token) return;
        const [settingsRes, goalsRes, habitsRes] = await Promise.all([
          fetch(`${apiBase}/api/settings`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${apiBase}/api/goals`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${apiBase}/api/habits`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (!settingsRes.ok) return;
        const s = (await settingsRes.json()) as {
          checkinReminderEnabled?: boolean;
          preferredCallTime?: string | null;
          notifCheckin?: boolean;
          notifMorning?: boolean;
          morningBriefingTime?: string | null;
        };
        if (s.checkinReminderEnabled && s.preferredCallTime) {
          void scheduleCheckinReminder(s.preferredCallTime, s.notifCheckin !== false);
        }
        if (s.notifMorning !== false) {
          const briefingTime = s.morningBriefingTime ?? "07:00";
          let topGoalName: string | null = null;
          let topHabitName: string | null = null;
          if (goalsRes.ok) {
            const goals = (await goalsRes.json()) as Array<{ title: string; progressPercent: number }>;
            const active = goals.filter((g) => g.progressPercent < 100);
            if (active.length > 0) topGoalName = active[0]!.title;
          }
          if (habitsRes.ok) {
            const habits = (await habitsRes.json()) as Array<{ name: string; completedToday: boolean }>;
            const pending = habits.filter((h) => !h.completedToday);
            if (pending.length > 0) topHabitName = pending[0]!.name;
          }
          void scheduleMorningBriefing(briefingTime, topGoalName, topHabitName, true);
        }
      } catch {}
    }
    void restore();
  }, [isLoaded, isSignedIn, getToken]);

  return null;
}

function NotificationDeepLinkEffect() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === "web") return;

    let sub: { remove: () => void } | null = null;

    async function setup() {
      try {
        const Notifications = (await import("expo-notifications")) as typeof import("expo-notifications");
        sub = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data as Record<string, unknown>;
          const type = data?.type;
          if (type === "morning-briefing" || type === "checkin") {
            router.push("/(tabs)");
          }
        });
      } catch {}
    }

    void setup();

    return () => {
      sub?.remove();
    };
  }, [router]);

  return null;
}

function RootLayoutNav() {
  return (
    <>
      <NotificationRestoreEffect />
      <NotificationDeepLinkEffect />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="settings" />
        <Stack.Screen name="goal/[id]" />
        <Stack.Screen name="recap/[id]" />
        <Stack.Screen name="meal-planner" options={{ presentation: "modal" }} />
        <Stack.Screen name="write" options={{ presentation: "modal" }} />
        <Stack.Screen name="ask-valo" options={{ presentation: "modal" }} />
        <Stack.Screen name="voice" options={{ presentation: "modal" }} />
        <Stack.Screen name="guided-checkin" options={{ presentation: "modal" }} />
        <Stack.Screen name="tools" />
        <Stack.Screen name="(tools)" />
        <Stack.Screen name="accountability-buddy" />
        <Stack.Screen name="accountability-buddies" />
        <Stack.Screen name="buddy-invite" options={{ presentation: "modal" }} />
        <Stack.Screen name="buddy-accept/[code]" options={{ presentation: "modal" }} />
        <Stack.Screen name="commitment/new" options={{ presentation: "modal" }} />
        <Stack.Screen name="commitment/[id]" />
        <Stack.Screen name="charts" />
        <Stack.Screen name="copilot-start" />
        <Stack.Screen name="copilot-workout" options={{ gestureEnabled: false }} />
        <Stack.Screen name="copilot-summary" options={{ gestureEnabled: false }} />
        <Stack.Screen name="oauth2redirect/google" />
        <Stack.Screen name="paywall" options={{ gestureEnabled: false }} />
        <Stack.Screen name="referral-offer" options={{ presentation: "modal" }} />
        <Stack.Screen name="referrals" />
      </Stack>
    </>
  );
}

type ServerStatus = "checking" | "ok" | "offline";

export default function RootLayout() {
  console.log("[Valo] RootLayout rendering");

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [serverStatus, setServerStatus] = useState<ServerStatus>("checking");
  const recheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect OAuth redirects that open the app from a fully-closed state.
  // In that case Linking.addEventListener never fires — only getInitialURL returns the URL.
  // The actual token exchange is handled by profile.tsx once it mounts.
  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      if (!url) return;
      console.log("[Valo] Initial URL on startup:", url);
      if (url.startsWith(GOOGLE_OAUTH_PREFIX)) {
        console.log("[Valo] OAuth redirect detected — profile screen will handle token exchange");
      }
    });

    const sub = Linking.addEventListener("url", ({ url }) => {
      console.log("[Valo] Linking URL event (root):", url);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!apiBase) {
      // Running in a context with no base URL (web preview) — skip check.
      setServerStatus("ok");
      return;
    }

    let cancelled = false;

    async function runCheck() {
      // Try up to RETRY_COUNT times with a delay between each attempt.
      for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
        if (cancelled) return;
        const ok = await checkServer();
        if (ok) {
          if (!cancelled) {
            console.log(`[Valo] server reachable on attempt ${attempt}`);
            setServerStatus("ok");
          }
          return;
        }
        console.log(`[Valo] server not reachable, attempt ${attempt}/${RETRY_COUNT}`);
        if (attempt < RETRY_COUNT) await sleep(RETRY_DELAY_MS);
      }

      // All retries exhausted — declare offline and schedule a recheck.
      if (!cancelled) {
        console.log("[Valo] server unreachable after all retries — showing banner");
        setServerStatus("offline");
        recheckRef.current = setTimeout(() => {
          if (!cancelled) void runCheck();
        }, RECHECK_INTERVAL_MS);
      }
    }

    void runCheck();

    return () => {
      cancelled = true;
      if (recheckRef.current) clearTimeout(recheckRef.current);
    };
  }, []);

  useEffect(() => {
    console.log("[Valo] fonts state — loaded:", fontsLoaded, "error:", fontError);
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Valo is loading</Text>
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
      <ThemeProvider>
      <AuthProvider>
        <HolidayRegionProvider>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <SubscriptionProvider>
                <WorkoutCopilotProvider>
                  <HeartRateProvider>
                    <RootLayoutNav />
                    <WorkoutCopilotPanel />
                    <GracePeriodPrompt />
                    {serverStatus === "offline" && (
                      <View style={styles.offlineBanner} pointerEvents="none">
                        <Text style={styles.offlineBannerText}>
                          Dev server is waking up, please wait...
                        </Text>
                      </View>
                    )}
                  </HeartRateProvider>
                </WorkoutCopilotProvider>
                </SubscriptionProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </SafeAreaProvider>
        </HolidayRegionProvider>
      </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: "#F7F5F2",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#C17B3F",
    fontSize: 16,
    marginBottom: 12,
  },
  offlineBanner: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#C17B3F",
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  offlineBannerText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
});
