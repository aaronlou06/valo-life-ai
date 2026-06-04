// All expo-notifications imports are inside function bodies to avoid native
// module crashes on builds where the module is not yet linked.

export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const Notifications = (await import("expo-notifications")) as typeof import("expo-notifications");
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

/**
 * Requests notification permission (if not already granted), retrieves the
 * Expo push token, and persists it to the server via PATCH /api/settings.
 *
 * Safe to call on every authenticated app launch — it is a no-op on
 * simulators (Expo push tokens only work on physical devices) and exits
 * silently on any error so it never blocks the UI.
 */
export async function registerForPushNotifications(
  projectId: string,
  getToken: () => Promise<string | null>
): Promise<void> {
  try {
    const Device = (await import("expo-device")) as typeof import("expo-device");
    if (!Device.isDevice) return;

    const Notifications = (await import("expo-notifications")) as typeof import("expo-notifications");
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const pushToken = tokenData.data;

    const authToken = await getToken();
    if (!authToken) return;

    const apiBase = process.env.EXPO_PUBLIC_DOMAIN
      ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
      : "";
    await fetch(`${apiBase}/api/settings`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ expoPushToken: pushToken }),
    });
  } catch {
    // Registration errors must never surface to the user
  }
}

export async function scheduleMorningBriefing(time: string): Promise<void> {
  try {
    const Notifications = (await import("expo-notifications")) as typeof import("expo-notifications");
    // Cancel any existing instance before re-scheduling
    await Notifications.cancelScheduledNotificationAsync("valo.morning-briefing").catch(() => {});
    const [hourStr, minuteStr] = time.split(":");
    const hour = parseInt(hourStr ?? "7", 10);
    const minute = parseInt(minuteStr ?? "0", 10);
    await Notifications.scheduleNotificationAsync({
      identifier: "valo.morning-briefing",
      content: {
        title: "Good morning",
        body: "Your morning briefing is ready. Start your day with intention.",
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        repeats: true,
        hour,
        minute,
      },
    });
  } catch {
    // Scheduling may fail if permissions are not granted; caller handles
  }
}

export async function scheduleCheckinReminder(time: string): Promise<void> {
  try {
    const Notifications = (await import("expo-notifications")) as typeof import("expo-notifications");
    await Notifications.cancelScheduledNotificationAsync("valo.checkin-reminder").catch(() => {});
    const [hourStr, minuteStr] = time.split(":");
    const hour = parseInt(hourStr ?? "20", 10);
    const minute = parseInt(minuteStr ?? "30", 10);
    await Notifications.scheduleNotificationAsync({
      identifier: "valo.checkin-reminder",
      content: {
        title: "Time to check in",
        body: "Take a moment to reflect on your day.",
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        repeats: true,
        hour,
        minute,
      },
    });
  } catch {
    // ignore
  }
}

export async function cancelAllNotifications(): Promise<void> {
  try {
    const Notifications = (await import("expo-notifications")) as typeof import("expo-notifications");
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // ignore
  }
}
