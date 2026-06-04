// All expo-notifications imports are inside function bodies to avoid native
// module crashes on builds where the module is not yet linked.

const EAS_PROJECT_ID = "04049eee-fcc9-49b2-808f-1485e9edcb08";

/**
 * Shared internal helper — called after permission is confirmed granted.
 * Fetches the Expo push token and persists it to the server.
 * All errors are swallowed; caller must already hold granted permission.
 */
async function _persistPushToken(
  getToken: () => Promise<string | null>
): Promise<void> {
  try {
    const Device = (await import("expo-device")) as typeof import("expo-device");
    if (!Device.isDevice) return;

    const Notifications = (await import("expo-notifications")) as typeof import("expo-notifications");
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
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
    // Token registration errors must never surface to the user
  }
}

/**
 * Requests notification permission. When `opts` is provided and permission
 * is granted, immediately registers the Expo push token with the server so
 * that remote push delivery works from the first permission grant.
 */
export async function requestNotificationPermissions(opts?: {
  getToken: () => Promise<string | null>;
}): Promise<boolean> {
  try {
    const Notifications = (await import("expo-notifications")) as typeof import("expo-notifications");
    const { status } = await Notifications.requestPermissionsAsync();
    const granted = status === "granted";
    if (granted && opts) {
      await _persistPushToken(opts.getToken);
    }
    return granted;
  } catch {
    return false;
  }
}

/**
 * Called on each authenticated app startup (only when permission is already
 * granted). Ensures the server always has an up-to-date push token for the
 * current device without prompting the user for permission again.
 *
 * No-op on simulators and exits silently on any error.
 */
export async function registerForPushNotifications(
  getToken: () => Promise<string | null>
): Promise<void> {
  try {
    const Notifications = (await import("expo-notifications")) as typeof import("expo-notifications");
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;
    await _persistPushToken(getToken);
  } catch {
    // Errors must never surface to the user
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
