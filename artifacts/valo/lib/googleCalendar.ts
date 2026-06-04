import AsyncStorage from "@react-native-async-storage/async-storage";

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

const SECURE_STORE_KEY = "valo.google.calendar.token";
const PKCE_VERIFIER_KEY = "@valo/google_pkce_verifier";
const CLIENT_ID = "421092683856-11b3biji2mcf9a1v8pjqbo0broed0m3u.apps.googleusercontent.com";
const REDIRECT_URI = "com.aaronlou06.valo:/oauth2redirect/google";

/** URL prefix used to identify OAuth redirect deep links. */
export const GOOGLE_OAUTH_PREFIX = REDIRECT_URI;

/**
 * Persists the PKCE code verifier to AsyncStorage so it can be recovered
 * if iOS kills the app before the OAuth redirect returns.
 */
export async function savePkceVerifier(verifier: string): Promise<void> {
  await AsyncStorage.setItem(PKCE_VERIFIER_KEY, verifier);
}

/**
 * Reads and clears the persisted PKCE verifier. Returns null if none stored.
 */
export async function consumePkceVerifier(): Promise<string | null> {
  const v = await AsyncStorage.getItem(PKCE_VERIFIER_KEY);
  if (v) await AsyncStorage.removeItem(PKCE_VERIFIER_KEY);
  return v;
}
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
];

// ── PKCE helpers ──────────────────────────────────────────────────────────────

export async function buildGoogleOAuthUrl(): Promise<{ url: string; codeVerifier: string }> {
  const Crypto = (await import("expo-crypto")) as typeof import("expo-crypto");

  // Generate a 64-char code verifier from random bytes using URL-safe chars
  const randomBytes = Crypto.getRandomBytes(48);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const codeVerifier = Array.from(randomBytes)
    .map((b) => chars[b % chars.length]!)
    .join("");

  // Code challenge = base64url(SHA256(verifier))
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  const codeChallenge = digest
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  });

  return {
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    codeVerifier,
  };
}

export async function exchangeGoogleAuthCode(
  code: string,
  codeVerifier: string,
  getToken: () => Promise<string | null>,
): Promise<boolean> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      }).toString(),
    });

    if (!res.ok) return false;

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const tokenData = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresIn: data.expires_in ?? null,
      issuedAt: Date.now(),
    };

    const SecureStore = (await import("expo-secure-store")) as typeof import("expo-secure-store");
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

    return true;
  } catch {
    return false;
  }
}

// ── Connection status & lifecycle ─────────────────────────────────────────────

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

// ── Types ─────────────────────────────────────────────────────────────────────

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
