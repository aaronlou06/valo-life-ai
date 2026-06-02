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
