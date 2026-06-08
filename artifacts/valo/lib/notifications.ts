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
  // Accept 24-hour HH:MM
  const m24 = time.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const hour = parseInt(m24[1]!, 10);
    const minute = parseInt(m24[2]!, 10);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return { hour, minute };
  }
  // Accept 12-hour H:MM AM/PM (e.g. "6:30 PM", "12:00 AM")
  const m12 = time.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (m12) {
    let hour = parseInt(m12[1]!, 10);
    const minute = parseInt(m12[2]!, 10);
    const isPm = m12[3]!.toLowerCase() === "pm";
    if (isPm && hour !== 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return { hour, minute };
  }
  return null;
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

const MORNING_BRIEFING_ID = "valo.morning-briefing";

/**
 * Schedules a repeating daily local notification for the morning briefing.
 * Composes the body from the user's top goal and habit names, with friendly
 * fallbacks when those are not available.
 * When `enabled` is false the notification is cancelled instead of scheduled.
 */
export async function scheduleMorningBriefing(
  time: string,
  topGoalName?: string | null,
  topHabitName?: string | null,
  enabled = true,
): Promise<void> {
  if (!isNativePlatform()) return;
  if (!enabled) {
    await cancelMorningBriefing();
    return;
  }
  try {
    const parsed = parseHHMM(time);
    if (!parsed) return;

    await cancelMorningBriefing();

    const granted = await requestNotificationPermissions();
    if (!granted) return;

    let body: string;
    if (topGoalName && topHabitName) {
      body = `Today: work toward "${topGoalName}" and complete "${topHabitName}".`;
    } else if (topGoalName) {
      body = `Today: work toward "${topGoalName}".`;
    } else if (topHabitName) {
      body = `Today: complete "${topHabitName}".`;
    } else {
      body = "Start your day with intention. Open Valo to see your priorities.";
    }

    const Notifications = await _ensureHandler();
    await Notifications.scheduleNotificationAsync({
      identifier: MORNING_BRIEFING_ID,
      content: {
        title: "Good morning",
        body,
        data: { type: "morning-briefing" },
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

export async function cancelMorningBriefing(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    const Notifications = await _ensureHandler();
    await Notifications.cancelScheduledNotificationAsync(MORNING_BRIEFING_ID);
  } catch {
    // ignore
  }
}

const ENTITY_REMINDER_PREFIX = "valo.entity-reminder.";

/**
 * Schedules a one-time notification for an event reminder.
 * Silently skips if fireAt is in the past or expo-notifications is unavailable.
 */
export async function scheduleEventReminderNotification(
  reminderId: number,
  entityTitle: string,
  fireAt: Date,
): Promise<void> {
  if (!isNativePlatform()) {
    console.log(`[notifications] skipping event reminder ${reminderId} (not native)`);
    return;
  }
  try {
    if (fireAt <= new Date()) return;
    await cancelEntityReminderNotification(reminderId);
    const granted = await requestNotificationPermissions();
    if (!granted) return;
    const Notifications = await _ensureHandler();
    await Notifications.scheduleNotificationAsync({
      identifier: `${ENTITY_REMINDER_PREFIX}${reminderId}`,
      content: {
        title: "Reminder",
        body: entityTitle,
        data: { type: "entity-reminder", reminderId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    });
  } catch {
    // never surface to user
  }
}

/**
 * Schedules individual DATE-trigger notifications for a routine reminder,
 * covering all occurrences within the next 90 days.
 * Handles both 24-hour ("18:30") and 12-hour ("6:30 PM") routine times.
 * Silently skips if expo-notifications is unavailable or no time/days are set.
 */
export async function scheduleRoutineReminderNotification(
  reminderId: number,
  entityTitle: string,
  routineTimeHHMM: string,
  remindBeforeSeconds: number,
  daysOfWeek: number[],
): Promise<void> {
  if (!isNativePlatform()) {
    console.log(`[notifications] skipping routine reminder ${reminderId} (not native)`);
    return;
  }
  if (!routineTimeHHMM || daysOfWeek.length === 0) return;
  try {
    await cancelEntityReminderNotification(reminderId);
    const granted = await requestNotificationPermissions();
    if (!granted) return;
    const Notifications = await _ensureHandler();
    const parsed = parseHHMM(routineTimeHHMM);
    if (!parsed) return;

    const now = new Date();
    const cutoff = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const daySet = new Set(daysOfWeek);

    // Walk day-by-day over the 90-day window and schedule a DATE notification
    // for each occurrence whose fire time (routine time − offset) is still in the future.
    const cursor = new Date(now);
    cursor.setHours(0, 0, 0, 0);
    let notifIndex = 0;

    while (cursor <= cutoff) {
      if (daySet.has(cursor.getDay())) {
        const routineTime = new Date(cursor);
        routineTime.setHours(parsed.hour, parsed.minute, 0, 0);
        const fireAt = new Date(routineTime.getTime() - remindBeforeSeconds * 1000);
        if (fireAt > now) {
          await Notifications.scheduleNotificationAsync({
            identifier: `${ENTITY_REMINDER_PREFIX}${reminderId}.${notifIndex++}`,
            content: {
              title: "Routine reminder",
              body: entityTitle,
              data: { type: "routine-reminder", reminderId },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: fireAt,
            },
          });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  } catch {
    // never surface to user
  }
}

/**
 * Cancels all scheduled notifications for an entity reminder
 * (handles both one-time event and per-day routine variants).
 */
export async function cancelEntityReminderNotification(reminderId: number): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    const Notifications = await _ensureHandler();
    const base = `${ENTITY_REMINDER_PREFIX}${reminderId}`;
    const all = await Notifications.getAllScheduledNotificationsAsync();
    const matching = all.filter(
      (n) => n.identifier === base || n.identifier.startsWith(`${base}.`),
    );
    await Promise.all(
      matching.map((n) =>
        Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {}),
      ),
    );
  } catch {
    // ignore
  }
}
