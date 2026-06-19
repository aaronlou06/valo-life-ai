import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@valo/session";

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface StoredSession {
  token: string;
  userId: string;
  email: string;
  name: string | null;
  expiresAt: string;
}

export interface AuthContextType {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  email: string | null;
  name: string | null;
  getToken: () => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  handleUnauthorized: () => Promise<void>;
  updateName: (name: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Validate the stored session token against the server on startup.
// Retries on network errors (device may not have a stable connection yet).
// Returns true if the session is valid, false if the server rejected it.
// Throws if all retry attempts were network errors (caller should trust the
// local session rather than signing the user out on a connectivity blip).
async function validateTokenWithServer(token: string): Promise<boolean | "network-error"> {
  const RETRIES = 3;
  const DELAY_MS = 1500;

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(`${getApiBase()}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log(`[Auth] /api/auth/me attempt ${attempt}: ${res.status}`);
      // Any definitive HTTP response (200 or 401) is reliable; return it.
      return res.ok;
    } catch (err: unknown) {
      console.log(
        `[Auth] /api/auth/me attempt ${attempt} network error:`,
        err instanceof Error ? err.message : String(err)
      );
      if (attempt < RETRIES) {
        await sleep(DELAY_MS);
      }
    }
  }

  // All attempts were network errors — cannot determine validity.
  return "network-error";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [session, setSession] = useState<StoredSession | null>(null);
  const sessionRef = useRef<StoredSession | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed: StoredSession = JSON.parse(raw);
          const clientExpired =
            parsed.expiresAt && new Date(parsed.expiresAt) <= new Date();

          if (clientExpired) {
            console.log("[Auth] stored session expired client-side — clearing");
            await AsyncStorage.removeItem(STORAGE_KEY);
          } else {
            // Validate against the server. Every login rotates the DB token,
            // so a token from a previous session (or invalidated by logout from
            // another device) causes silent 401s on every request. Catching it
            // here at startup ensures the user is sent to sign-in immediately
            // rather than silently operating in a broken state.
            const valid = await validateTokenWithServer(parsed.token);

            if (valid === true) {
              console.log("[Auth] session token valid — restoring session");
              sessionRef.current = parsed;
              setSession(parsed);
            } else if (valid === false) {
              // Server definitively rejected the token (DB token is NULL or
              // was rotated). Clear it so the app routes to sign-in.
              console.log("[Auth] server rejected stored token — clearing session");
              await AsyncStorage.removeItem(STORAGE_KEY);
            } else {
              // Network error on all attempts — trust the local session. The
              // individual request retry logic in hooks will handle 401s, and
              // handleUnauthorized() will clean up if needed.
              console.log("[Auth] could not reach server at startup — trusting local session");
              sessionRef.current = parsed;
              setSession(parsed);
            }
          }
        }
      } catch {
        // Storage error — start unauthenticated
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  const saveSession = useCallback(async (s: StoredSession) => {
    sessionRef.current = s;
    setSession(s);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    return sessionRef.current?.token ?? null;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${getApiBase()}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Login failed");
    await saveSession({
      token: data.token,
      userId: data.userId,
      email: data.email,
      name: data.name ?? null,
      expiresAt: data.expiresAt ?? new Date(Date.now() + 90 * 86_400_000).toISOString(),
    });
  }, [saveSession]);

  const signUp = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${getApiBase()}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Registration failed");
    await saveSession({
      token: data.token,
      userId: data.userId,
      email: data.email,
      name: null,
      expiresAt: data.expiresAt ?? new Date(Date.now() + 90 * 86_400_000).toISOString(),
    });
  }, [saveSession]);

  const signOut = useCallback(async () => {
    try {
      const token = sessionRef.current?.token;
      if (token) {
        await fetch(`${getApiBase()}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // Ignore network errors — still clear local session
    }
    sessionRef.current = null;
    setSession(null);
    await AsyncStorage.multiRemove([
      STORAGE_KEY,
      "@valo/tomorrow-intention",
      "@valo/notification-prefs",
    ]);
  }, []);

  // Permanently delete the account after re-authentication. The server requires
  // and verifies the current password, then atomically removes all user data.
  // On success we wipe every piece of local state so a fresh sign-up on this
  // device starts clean (including all HealthKit sync flags).
  const deleteAccount = useCallback(async (password: string) => {
    const token = sessionRef.current?.token;
    const res = await fetch(`${getApiBase()}/api/auth/account`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({} as { error?: string }));
    if (!res.ok) {
      throw new Error((data as { error?: string }).error ?? "Account deletion failed");
    }

    sessionRef.current = null;
    setSession(null);

    const allKeys = await AsyncStorage.getAllKeys();
    const healthKitKeys = allKeys.filter((k) => k.startsWith("@valo/healthkit"));
    await AsyncStorage.multiRemove([
      STORAGE_KEY,
      "@valo/tomorrow-intention",
      "@valo/notification-prefs",
      ...healthKitKeys,
    ]);
  }, []);

  // Called by any hook or screen that receives a 401 for a non-auth endpoint.
  // Clears the local session so the app routes to sign-in. Does NOT hit the
  // logout endpoint (the token is already invalid server-side).
  const handleUnauthorized = useCallback(async () => {
    console.log("[Auth] handleUnauthorized called — clearing stale session");
    sessionRef.current = null;
    setSession(null);
    await AsyncStorage.multiRemove([
      STORAGE_KEY,
      "@valo/tomorrow-intention",
      "@valo/notification-prefs",
    ]);
  }, []);

  const updateName = useCallback((name: string) => {
    if (!sessionRef.current) return;
    const updated = { ...sessionRef.current, name };
    sessionRef.current = updated;
    setSession(updated);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isLoaded,
        isSignedIn: !!session,
        userId: session?.userId ?? null,
        email: session?.email ?? null,
        name: session?.name ?? null,
        getToken,
        signIn,
        signUp,
        signOut,
        deleteAccount,
        handleUnauthorized,
        updateName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useValoAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useValoAuth must be used within AuthProvider");
  return ctx;
}
