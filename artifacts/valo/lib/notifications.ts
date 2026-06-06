// All expo-notifications imports are inside function bodies to avoid native
// module crashes on builds where the module is not yet linked.
// Platform guard: expo-notifications transitively requires expo-application
// (a native-only module). Never import it on web.

import { Platform } from "react-native";

function isNativePlatform(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}

let _handlerSet = false;

async function _ensureHandler(): Promise<typeof import("expo-notifications")> {
  const Notifications = (await import("expo-notifications")) as typeof import("expo-notifications");
  if (!_handlerSet) {
    _handlerSet = true;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }
  return Notifications;
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    const Notifications = await _ensureHandler();
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const existing = await Notifications.getPermissionsAsync();
    const e = existing as unknown as { granted?: boolean; status?: string };
    if (e.granted === true || e.status === "granted") return true;
    const result = await Notifications.requestPermissionsAsync();
    const r = result as unknown as { granted?: boolean; status?: string };
    return r.granted === true || r.status === "granted";
  } catch {
    return false;
  }
}

const HABIT_REMINDER_PREFIX = "valo.habit-reminder.";

function habitNotificationId(habitId: number): string {
  return `${HABIT_REMINDER_PREFIX}${habitId}`;
}

function parseHHMM(time: string): { hour: number; minute: number } | null {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = parseInt(match[1]!, 10);
  const minute = parseInt(match[2]!, 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Schedules a repeating daily local notification for a habit.
 * When `enabled` is false the reminder is cancelled instead of scheduled.
 */
export async function scheduleHabitReminder(
  habitId: number,
  habitName: string,
  time: string,
  enabled = true,
): Promise<void> {
  if (!isNativePlatform()) return;
  if (!enabled) {
    await cancelHabitReminder(habitId);
    return;
  }
  try {
    const parsed = parseHHMM(time);
    if (!parsed) return;

    await cancelHabitReminder(habitId);

    const granted = await requestNotificationPermissions();
    if (!granted) return;

    const Notifications = await _ensureHandler();
    await Notifications.scheduleNotificationAsync({
      identifier: habitNotificationId(habitId),
      content: {
        title: "Habit reminder",
        body: `Time to do your habit — ${habitName}`,
        data: { habitId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        hour: parsed.hour,
        minute: parsed.minute,
        repeats: true,
      },
    });
  } catch {
    // Scheduling errors must never surface to the user
  }
}

export async function cancelHabitReminder(habitId: number): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    const Notifications = await _ensureHandler();
    await Notifications.cancelScheduledNotificationAsync(habitNotificationId(habitId));
  } catch {
    // ignore
  }
}

export async function getScheduledHabitIds(): Promise<number[]> {
  if (!isNativePlatform()) return [];
  try {
    const Notifications = await _ensureHandler();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled
      .filter((n) => n.identifier.startsWith(HABIT_REMINDER_PREFIX))
      .map((n) => {
        const idStr = n.identifier.slice(HABIT_REMINDER_PREFIX.length);
        return parseInt(idStr, 10);
      })
      .filter((id) => !isNaN(id));
  } catch {
    return [];
  }
}

const CHECKIN_REMINDER_ID = "valo.checkin-reminder";

/**
 * Schedules a repeating daily local notification for the evening check-in.
 * When `enabled` is false the reminder is cancelled instead of scheduled.
 */
export async function scheduleCheckinReminder(time: string, enabled = true): Promise<void> {
  if (!isNativePlatform()) return;
  if (!enabled) {
    await cancelCheckinReminder();
    return;
  }
  try {
    const parsed = parseHHMM(time);
    if (!parsed) return;

    await cancelCheckinReminder();

    const granted = await requestNotificationPermissions();
    if (!granted) return;

    const Notifications = await _ensureHandler();
    await Notifications.scheduleNotificationAsync({
      identifier: CHECKIN_REMINDER_ID,
      content: {
        title: "Time for your daily check-in",
        body: "Take a moment to reflect on your day with Valo.",
        data: { type: "checkin" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        hour: parsed.hour,
        minute: parsed.minute,
        repeats: true,
      },
    });
  } catch {
    // Scheduling errors must never surface to the user
  }
}

export async function cancelCheckinReminder(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    const Notifications = await _ensureHandler();
    await Notifications.cancelScheduledNotificationAsync(CHECKIN_REMINDER_ID);
  } catch {
    // ignore
  }
}
