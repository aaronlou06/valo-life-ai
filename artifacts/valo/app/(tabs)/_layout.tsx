import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Redirect, Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { setAuthTokenGetter, listReminders, listHabits } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useValoAuth } from "@/contexts/AuthContext";
import { isOnboardingComplete, loadOnboardingState } from "@/hooks/onboardingState";
import { scheduleHabitReminder } from "@/lib/notifications";
import { CustomTabBar } from "@/components/CustomTabBar";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="plan">
        <Icon sf={{ default: "list.bullet.clipboard", selected: "list.bullet.clipboard.fill" }} />
        <Label>Plan</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="checkin">
        <Icon sf={{ default: "plus.circle.fill", selected: "plus.circle.fill" }} />
        <Label></Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="health">
        <Icon sf={{ default: "heart", selected: "heart.fill" }} />
        <Label>Health</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

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
      <Tabs.Screen name="checkin" options={{ title: "Check-In" }} />
      <Tabs.Screen name="health" options={{ title: "Health" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
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

  if (isLiquidGlassAvailable()) return <NativeTabLayout />;
  return <ClassicTabLayout />;
}
