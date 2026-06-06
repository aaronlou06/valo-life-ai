import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Redirect, Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, View, useColorScheme, ActivityIndicator } from "react-native";
import { setAuthTokenGetter, listReminders, listHabits } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useValoAuth } from "@/contexts/AuthContext";
import { isOnboardingComplete, loadOnboardingState } from "@/hooks/onboardingState";
import { scheduleHabitReminder } from "@/lib/notifications";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="checkin">
        <Icon sf={{ default: "checkmark.circle", selected: "checkmark.circle.fill" }} />
        <Label>Check-In</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="plan">
        <Icon sf={{ default: "list.bullet.clipboard", selected: "list.bullet.clipboard.fill" }} />
        <Label>Plan</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="health">
        <Icon sf={{ default: "heart", selected: "heart.fill" }} />
        <Label>Health</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="insights">
        <Icon sf={{ default: "chart.bar", selected: "chart.bar.fill" }} />
        <Label>Insights</Label>
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
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
          ) : null,
        tabBarLabelStyle: { fontFamily: "Inter_500Medium", fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="checkin"
        options={{
          title: "Check-In",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="checkmark.circle" tintColor={color} size={24} /> : <Feather name="check-circle" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: "Plan",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="list.bullet.clipboard" tintColor={color} size={24} /> : <Feather name="list" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="health"
        options={{
          title: "Health",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="heart" tintColor={color} size={24} /> : <Feather name="heart" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: "Insights",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="chart.bar" tintColor={color} size={24} /> : <Feather name="bar-chart-2" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) =>
            isIOS ? <SymbolView name="person" tintColor={color} size={24} /> : <Feather name="user" size={22} color={color} />,
        }}
      />
      <Tabs.Screen name="index" options={{ href: null }} />
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

  // Re-schedule all active habit reminders on app startup so they survive restarts.
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
