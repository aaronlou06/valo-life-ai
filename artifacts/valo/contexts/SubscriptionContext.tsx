import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useValoAuth } from "./AuthContext";

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

export type SubscriptionStatus = "trialing" | "grace" | "active" | "canceled" | "expired" | "loading";

export interface SubscriptionState {
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  currentPeriodEnd: string | null;
  freeMonthsAvailable: number;
  hadTrial: boolean;
  isLoaded: boolean;
  refresh: () => void;
}

const SubscriptionContext = createContext<SubscriptionState | null>(null);

const POLL_INTERVAL_MS = 60 * 1000;

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, getToken } = useValoAuth();

  const [state, setState] = useState<Omit<SubscriptionState, "refresh">>({
    status: "loading",
    trialEndsAt: null,
    graceEndsAt: null,
    currentPeriodEnd: null,
    freeMonthsAvailable: 0,
    hadTrial: false,
    isLoaded: false,
  });

  const fetchRef = useRef<(() => Promise<void>) | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const token = await getToken();
      const res = await fetch(`${getApiBase()}/api/subscription/status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const data = await res.json() as {
        status: SubscriptionStatus;
        trialEndsAt: string | null;
        graceEndsAt: string | null;
        currentPeriodEnd: string | null;
        freeMonthsAvailable: number;
        hadTrial: boolean;
      };
      setState({
        status: data.status,
        trialEndsAt: data.trialEndsAt,
        graceEndsAt: data.graceEndsAt,
        currentPeriodEnd: data.currentPeriodEnd,
        freeMonthsAvailable: data.freeMonthsAvailable,
        hadTrial: data.hadTrial,
        isLoaded: true,
      });
    } catch {
      setState((prev) => ({ ...prev, isLoaded: true }));
    }
  }, [isSignedIn, getToken]);

  fetchRef.current = fetchStatus;

  useEffect(() => {
    if (!isSignedIn) {
      setState({
        status: "loading",
        trialEndsAt: null,
        graceEndsAt: null,
        currentPeriodEnd: null,
        freeMonthsAvailable: 0,
        hadTrial: false,
        isLoaded: false,
      });
      return;
    }

    void fetchStatus();

    // Poll while in states that change over time.
    const shouldPoll = () =>
      state.status === "trialing" || state.status === "grace";

    intervalRef.current = setInterval(() => {
      if (shouldPoll()) {
        void fetchRef.current?.();
      }
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isSignedIn, fetchStatus]);

  const refresh = useCallback(() => {
    void fetchRef.current?.();
  }, []);

  return (
    <SubscriptionContext.Provider value={{ ...state, refresh }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionState {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be used within SubscriptionProvider");
  return ctx;
}
