import { Alert } from "react-native";

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

const SECURE_STORE_KEY = "valo.google.calendar.token";

export async function isGoogleCalendarConnected(
  _getToken?: () => Promise<string | null>,
): Promise<boolean> {
  try {
    const SecureStore = (await import("expo-secure-store")) as typeof import("expo-secure-store");
    const raw = await SecureStore.getItemAsync(SECURE_STORE_KEY);
    return !!raw;
  } catch {
    return false;
  }
}

export async function connectGoogleCalendar(
  getToken: () => Promise<string | null>,
): Promise<void> {
  try {
    const SecureStore = (await import("expo-secure-store")) as typeof import("expo-secure-store");
    const AuthSession = (await import("expo-auth-session")) as typeof import("expo-auth-session");

    const CLIENT_ID = "421092683856-11b3biji2mcf9a1v8pjqbo0broed0m3u.apps.googleusercontent.com";
    const REDIRECT_URI = "com.aaronlou06.valo:/oauth2redirect/google";
    const SCOPES = [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events.readonly",
    ];
    const discovery = {
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
    };

    const request = new AuthSession.AuthRequest({
      clientId: CLIENT_ID,
      scopes: SCOPES,
      redirectUri: REDIRECT_URI,
      usePKCE: true,
      responseType: AuthSession.ResponseType.Code,
    });

    const result = await request.promptAsync(discovery);
    if (result.type !== "success") return;

    const tokenResponse = await AuthSession.exchangeCodeAsync(
      {
        clientId: CLIENT_ID,
        code: result.params.code ?? "",
        redirectUri: REDIRECT_URI,
        extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : {},
      },
      discovery,
    );

    const tokenData = {
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken ?? null,
      expiresIn: tokenResponse.expiresIn ?? null,
      issuedAt: tokenResponse.issuedAt,
    };

    await SecureStore.setItemAsync(SECURE_STORE_KEY, JSON.stringify(tokenData));

    // Notify server so it can sync events on behalf of the user
    const authToken = await getToken();
    if (authToken) {
      await fetch(`${getApiBase()}/api/google-calendar/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(tokenData),
      }).catch(() => {});
    }
  } catch {
    Alert.alert("Error", "Could not complete Google Calendar authorization. Please try again.");
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
    const SecureStore = (await import("expo-secure-store")) as typeof import("expo-secure-store");
    await SecureStore.deleteItemAsync(SECURE_STORE_KEY);

    // Best-effort server-side cleanup
    const token = await getToken();
    if (token) {
      await fetch(`${getApiBase()}/api/google-calendar/disconnect`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    return true;
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

export type GoogleCalendarInfo = {
  calendarId: string;
  calendarName: string;
  calendarColor: string | null;
  isSelected: boolean;
};

export async function fetchGoogleCalendars(
  authToken: string,
): Promise<GoogleCalendarInfo[] | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/google-calendar/calendars`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { calendars: GoogleCalendarInfo[] };
    return data.calendars;
  } catch {
    return null;
  }
}

export async function saveGoogleCalendarSelections(
  authToken: string,
  selections: GoogleCalendarInfo[],
): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/api/google-calendar/calendars/selections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ selections }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
