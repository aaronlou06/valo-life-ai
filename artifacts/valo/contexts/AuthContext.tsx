import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@valo/session";

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
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
  updateName: (name: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

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
          if (!parsed.expiresAt || new Date(parsed.expiresAt) > new Date()) {
            sessionRef.current = parsed;
            setSession(parsed);
          } else {
            await AsyncStorage.removeItem(STORAGE_KEY);
          }
        }
      } catch {
        // storage error — start unauthenticated
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
      // ignore network errors — still clear local session
    }
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
