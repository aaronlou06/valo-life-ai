import { useState, useEffect, useRef, useCallback } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useValoAuth } from "@/contexts/AuthContext";
import {
  requestHealthKitPermissions,
  fetchTodayHealthData,
  fetchTodayWorkout,
} from "@/lib/healthKit";
import { runHealthKitBackfill } from "@/lib/healthKitBackfill";

const LAST_SYNCED_KEY = "@valo/healthkit-last-synced";
const PERMISSIONS_KEY = "@valo/healthkit-permissions-requested";
const SERVER_RETRY_COUNT = 3;
const SERVER_RETRY_DELAY_MS = 2000;
const MOUNT_DELAY_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

export interface HealthKitSyncState {
  isSyncing: boolean;
  lastSynced: Date | null;
  isPermissionsGranted: boolean;
  syncNow: () => Promise<void>;
}

export function useHealthKitSync(): HealthKitSyncState {
  const { getToken, isSignedIn, handleUnauthorized } = useValoAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [isPermissionsGranted, setIsPermissionsGranted] = useState(false);

  // Ref-based guard so syncNow doesn't need isSyncing in its deps.
  const isSyncingRef = useRef(false);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const prevSignedIn = useRef(false);

  const syncNow = useCallback(async (): Promise<void> => {
    if (Platform.OS !== "ios") return;
    if (isSyncingRef.current) return;

    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const granted = await requestHealthKitPermissions();
      if (!granted) return;
      setIsPermissionsGranted(true);

      const [data, workout] = await Promise.all([
        fetchTodayHealthData(),
        fetchTodayWorkout(),
      ]);

      const hasData =
        data.sleepHours !== null ||
        data.hrv !== null ||
        data.restingHeartRate !== null ||
        data.steps !== null ||
        data.activeCalories !== null ||
        data.respiratoryRate !== null ||
        workout !== null;

      if (!hasData) return;

      // Token with one retry in case AuthContext hasn't finished loading from
      // AsyncStorage yet (very short window at mount time).
      let token = await getToken();
      if (!token) {
        await sleep(2000);
        token = await getToken();
      }
      if (!token) return;

      const body: Record<string, string | number> = {};
      if (data.sleepHours !== null) body.sleepHours = data.sleepHours;
      if (data.hrv !== null) body.hrv = data.hrv;
      if (data.restingHeartRate !== null) body.restingHeartRate = data.restingHeartRate;
      if (data.steps !== null) body.steps = Math.round(data.steps);
      if (data.activeCalories !== null) body.activeCalories = Math.round(data.activeCalories);
      if (data.respiratoryRate !== null) body.respiratoryRate = data.respiratoryRate;
      if (workout?.workoutType) body.workoutType = workout.workoutType;
      if (workout?.workoutDuration) body.workoutDuration = workout.workoutDuration;

      // Retry only on network/server errors. A 401 means the token is stale
      // — retrying with the same token won't help. AuthContext now validates
      // the token at startup and clears stale sessions, so a 401 here is an
      // edge case (token rotated mid-session). Clear session and bail; the
      // isSignedIn watcher below will re-trigger once auth is re-established.
      let lastStatus = 0;
      for (let attempt = 1; attempt <= SERVER_RETRY_COUNT; attempt++) {
        try {
          const res = await fetch(`${getApiBase()}/api/daily-logs`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
          });
          lastStatus = res.status;

          if (res.ok) {
            const now = new Date();
            setLastSynced(now);
            await AsyncStorage.setItem(LAST_SYNCED_KEY, now.toISOString());
            return;
          }

          // Auth failure — token is stale. Retrying won't help.
          if (res.status === 401 || res.status === 403) {
            await handleUnauthorized();
            return;
          }
        } catch {
          // Network error — worth retrying
        }

        if (attempt < SERVER_RETRY_COUNT) {
          await sleep(SERVER_RETRY_DELAY_MS);
        }
      }

      void lastStatus; // suppress unused-variable warning
    } catch {
      // ignore
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [getToken, handleUnauthorized]);

  useEffect(() => {
    if (Platform.OS !== "ios") return;

    async function init() {
      try {
        const stored = await AsyncStorage.getItem(LAST_SYNCED_KEY);
        if (stored) setLastSynced(new Date(stored));

        const alreadyRequested = await AsyncStorage.getItem(PERMISSIONS_KEY);
        const granted = await requestHealthKitPermissions();
        setIsPermissionsGranted(granted);

        if (!alreadyRequested) {
          await AsyncStorage.setItem(PERMISSIONS_KEY, "true");
        }

        if (granted) {
          // Delay to give AuthContext time to finish the /api/auth/me validation
          // and settle into a known-good auth state before the first sync attempt.
          await sleep(MOUNT_DELAY_MS);
          await syncNow();
          // Silently backfill historical data in the background. runHealthKitBackfill
          // guards itself with an AsyncStorage flag and no-ops after the first run.
          void runHealthKitBackfill(getToken, handleUnauthorized);
        }
      } catch {
        // ignore
      }
    }

    void init();
  }, [syncNow]);

  // Re-trigger sync when auth transitions false → true (sign-in or session
  // recovery after a stale-token sign-out). This is the primary recovery path
  // for the case where the startup sync bailed due to a 401.
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    if (isSignedIn && !prevSignedIn.current) {
      void syncNow();
    }
    prevSignedIn.current = isSignedIn;
  }, [isSignedIn, syncNow]);

  useEffect(() => {
    if (Platform.OS !== "ios") return;

    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (
          appState.current.match(/inactive|background/) &&
          nextState === "active"
        ) {
          void syncNow();
        }
        appState.current = nextState;
      }
    );

    return () => subscription.remove();
  }, [syncNow]);

  return { isSyncing, lastSynced, isPermissionsGranted, syncNow };
}
