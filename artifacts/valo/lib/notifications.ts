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

// ─── Goal deadline reminders ──────────────────────────────────────────────────

const GOAL_REMINDER_OFFSETS = [7, 3, 1, 0] as const;

function goalNotifId(goalId: number, daysOffset: number): string {
  return `valo.goal-reminder.${goalId}.${daysOffset}d`;
}

/**
 * Cancels all pending deadline reminders for a goal. Safe to call even if no
 * reminders are scheduled.
 */
export async function cancelGoalReminders(goalId: number): Promise<void> {
  try {
    const Notifications = (await import("expo-notifications")) as typeof import("expo-notifications");
    await Promise.all(
      GOAL_REMINDER_OFFSETS.map((offset) =>
        Notifications.cancelScheduledNotificationAsync(goalNotifId(goalId, offset)).catch(() => {})
      )
    );
  } catch {
    // ignore
  }
}

/**
 * Schedules up to four local notifications for a goal deadline (7 days, 3 days,
 * 1 day, and the day itself) at 9:00 AM local time, skipping any dates that are
 * already in the past.
 *
 * - Requests notification permission lazily if not yet granted.
 * - Cancels any previously scheduled reminders for this goal before scheduling.
 * - Returns `true` if at least one reminder was successfully scheduled.
 */
export async function scheduleGoalReminders(goal: {
  id: number;
  title: string;
  targetDate?: string | null;
}): Promise<boolean> {
  if (!goal.targetDate) {
    await cancelGoalReminders(goal.id);
    return false;
  }

  try {
    const Notifications = (await import("expo-notifications")) as typeof import("expo-notifications");

    // Request permission if not already granted
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      const { status: newStatus } = await Notifications.requestPermissionsAsync();
      if (newStatus !== "granted") return false;
    }

    // Cancel existing reminders before scheduling fresh ones
    await cancelGoalReminders(goal.id);

    const datePart = goal.targetDate.split("T")[0]!;
    const [yStr, mStr, dStr] = datePart.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    const d = Number(dStr);
    if (!y || !m || !d) return false;

    const messages: Record<number, string> = {
      7: `One week left to reach "${goal.title}"`,
      3: `3 days left — keep pushing on "${goal.title}"`,
      1: `Tomorrow is the deadline for "${goal.title}"`,
      0: `Today is the deadline for "${goal.title}"`,
    };

    let scheduled = 0;
    const now = new Date();

    for (const offset of GOAL_REMINDER_OFFSETS) {
      const triggerDate = new Date(y, m - 1, d - offset, 9, 0, 0);
      if (triggerDate <= now) continue;

      await Notifications.scheduleNotificationAsync({
        identifier: goalNotifId(goal.id, offset),
        content: {
          title: "Goal reminder",
          body: messages[offset] ?? `Deadline approaching: "${goal.title}"`,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
      });
      scheduled++;
    }

    return scheduled > 0;
  } catch {
    return false;
  }
}

/**
 * Returns true if there are any pending local notifications for this goal.
 */
export async function hasGoalReminders(goalId: number): Promise<boolean> {
  try {
    const Notifications = (await import("expo-notifications")) as typeof import("expo-notifications");
    const all = await Notifications.getAllScheduledNotificationsAsync();
    return all.some((n) => n.identifier.startsWith(`valo.goal-reminder.${goalId}.`));
  } catch {
    return false;
  }
}
