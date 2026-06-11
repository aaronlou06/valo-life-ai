import { Redirect, Tabs } from "expo-router";
import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { setAuthTokenGetter, listReminders, listHabits } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useValoAuth } from "@/contexts/AuthContext";
import { isOnboardingComplete, loadOnboardingState } from "@/hooks/onboardingState";
import { scheduleHabitReminder } from "@/lib/notifications";
import { CustomTabBar } from "@/components/CustomTabBar";

function ClassicTabLayout() {
  const colors = useColors();

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="plan" options={{ title: "Plan" }} />
      <Tabs.Screen name="health" options={{ title: "Health" }} />
      <Tabs.Screen name="progress" options={{ title: "Progress" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", href: null }} />
    </Tabs>
  );
}

export default function TabLayout() {
  const { isSignedIn, isLoaded, getToken } = useValoAuth();
  const colors = useColors();
  const [onboardingChecked, setOnboardingChecked] = useState(isOnboardingComplete());
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

  useEffect(() => {
    if (!isSignedIn) return;
    (async () => {
      try {
        const token = await getToken();
        const apiBase = process.env.EXPO_PUBLIC_DOMAIN
          ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
          : "";
        const settingsRes = await fetch(`${apiBase}/api/settings`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const notifHabitsEnabled: boolean = settingsRes.ok
          ? ((await settingsRes.json()) as { notifHabits?: boolean }).notifHabits !== false
          : true;

        const [reminders, habits] = await Promise.all([listReminders(), listHabits()]);
        const habitMap = new Map(habits.map((h) => [h.id, h.name]));
        for (const r of reminders) {
          if (!r.isActive || r.type !== "habit") continue;
          const meta = r.metadata as { habitId?: number } | null;
          const habitId = meta?.habitId;
          if (habitId == null) continue;
          const habitName = habitMap.get(habitId);
          if (!habitName) continue;
          scheduleHabitReminder(habitId, habitName, r.scheduledTime, notifHabitsEnabled).catch(() => {});
        }
      } catch {
        // Network failure or not yet signed in — silently skip
      }
    })();
  // Run once on sign-in
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn || isOnboardingComplete()) {
      setOnboardingChecked(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const cached = await loadOnboardingState();
        if (cached) {
          if (!cancelled) setOnboardingChecked(true);
          return;
        }

        const token = await getToken();
        const apiBase = process.env.EXPO_PUBLIC_DOMAIN
          ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
          : "";
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`${apiBase}/api/settings`, { headers });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setNeedsOnboarding(!data.onboardingCompleted);
        }
      } catch {
        // network failure — don't block the user
      } finally {
        if (!cancelled) setOnboardingChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [isSignedIn, getToken]);

  if (!isLoaded || !onboardingChecked) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  if (needsOnboarding) return <Redirect href="/onboarding" />;

  return <ClassicTabLayout />;
}
