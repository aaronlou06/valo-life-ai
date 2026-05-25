import { Alert } from "react-native";
import * as SecureStore from "expo-secure-store";

// expo-auth-session / expo-web-browser require native modules compiled into
// the app binary. Until the next EAS build includes them, the connect flow is
// stubbed so the module loads safely in the current binary.

const TOKEN_KEY = "@valo/google-calendar-token";

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

export async function isGoogleCalendarConnected(): Promise<boolean> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token !== null;
}

export async function connectGoogleCalendar(): Promise<boolean> {
  Alert.alert(
    "Coming soon",
    "Google Calendar sync will be available in the next update.",
  );
  return false;
}

export type GoogleCalendarEvent = {
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  description: string | null;
};

export async function fetchGoogleCalendarEvents(
  daysAhead: number,
): Promise<GoogleCalendarEvent[]> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) return [];

  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + daysAhead);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    if (res.status === 401) await SecureStore.deleteItemAsync(TOKEN_KEY);
    return [];
  }

  const data = (await res.json()) as { items?: Record<string, unknown>[] };
  const items = data.items ?? [];

  return items.map((item) => {
    const start =
      (item.start as Record<string, string> | undefined)?.dateTime ??
      (item.start as Record<string, string> | undefined)?.date ??
      null;
    const end =
      (item.end as Record<string, string> | undefined)?.dateTime ??
      (item.end as Record<string, string> | undefined)?.date ??
      null;
    const date = start
      ? start.substring(0, 10)
      : now.toISOString().substring(0, 10);
    return {
      title: (item.summary as string | undefined) ?? "Untitled",
      date,
      startTime: start,
      endTime: end,
      description: (item.description as string | undefined) ?? null,
    };
  });
}

export async function syncGoogleCalendarEvents(
  authToken: string,
): Promise<number> {
  const gcalToken = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!gcalToken) return 0;

  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/google-calendar/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ accessToken: gcalToken }),
    });

    if (!res.ok) return 0;
    const data = (await res.json()) as { count?: number };
    return data.count ?? 0;
  } catch {
    return 0;
  }
}
