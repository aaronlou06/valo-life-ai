import { Alert, Linking } from "react-native";

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

export async function isGoogleCalendarConnected(
  getToken: () => Promise<string | null>,
): Promise<boolean> {
  try {
    const token = await getToken();
    if (!token) return false;
    const res = await fetch(`${getApiBase()}/api/google-calendar/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { connected: boolean };
    return data.connected;
  } catch {
    return false;
  }
}

export async function connectGoogleCalendar(
  getToken: () => Promise<string | null>,
): Promise<void> {
  try {
    const token = await getToken();
    if (!token) {
      Alert.alert("Not signed in", "Please sign in to connect Google Calendar.");
      return;
    }

    const res = await fetch(`${getApiBase()}/api/auth/google/init`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      if (res.status === 503) {
        Alert.alert(
          "Not available yet",
          "Google Calendar sync is not yet configured. Check back soon.",
        );
      } else {
        Alert.alert("Error", "Could not start Google Calendar connection. Please try again.");
      }
      return;
    }

    const data = (await res.json()) as { authUrl: string };
    await Linking.openURL(data.authUrl);
  } catch {
    Alert.alert("Error", "Could not open Google authorization. Please try again.");
  }
}

export async function syncGoogleCalendarEvents(authToken: string): Promise<number> {
  try {
    const res = await fetch(`${getApiBase()}/api/google-calendar/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as { count?: number };
    return data.count ?? 0;
  } catch {
    return 0;
  }
}

export async function disconnectGoogleCalendar(
  getToken: () => Promise<string | null>,
): Promise<boolean> {
  try {
    const token = await getToken();
    if (!token) return false;
    const res = await fetch(`${getApiBase()}/api/google-calendar/disconnect`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type GoogleCalendarEvent = {
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  description: string | null;
};
