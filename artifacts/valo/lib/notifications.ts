import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  // NotificationPermissionsStatus extends PermissionResponse; check ios status or fall through to request
  if ((existing as unknown as { granted?: boolean }).granted) return true;
  if ((existing as unknown as { status?: string }).status === "granted") return true;
  const result = await Notifications.requestPermissionsAsync();
  const r = result as unknown as { granted?: boolean; status?: string };
  return r.granted === true || r.status === "granted";
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

export async function scheduleHabitReminder(
  habitId: number,
  habitName: string,
  time: string,
): Promise<void> {
  const parsed = parseHHMM(time);
  if (!parsed) return;

  await cancelHabitReminder(habitId);

  const granted = await requestNotificationPermissions();
  if (!granted) return;

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
}

export async function cancelHabitReminder(habitId: number): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(
    habitNotificationId(habitId),
  );
}

export async function getScheduledHabitIds(): Promise<number[]> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled
    .filter((n) => n.identifier.startsWith(HABIT_REMINDER_PREFIX))
    .map((n) => {
      const idStr = n.identifier.slice(HABIT_REMINDER_PREFIX.length);
      return parseInt(idStr, 10);
    })
    .filter((id) => !isNaN(id));
}
