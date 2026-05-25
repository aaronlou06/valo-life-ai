import { useState, useEffect, useRef, useCallback } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useValoAuth } from "@/contexts/AuthContext";
import {
  requestHealthKitPermissions,
  fetchTodayHealthData,
} from "@/lib/healthKit";

const LAST_SYNCED_KEY = "@valo/healthkit-last-synced";
const PERMISSIONS_KEY = "@valo/healthkit-permissions-requested";

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
  const { getToken } = useValoAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [isPermissionsGranted, setIsPermissionsGranted] = useState(false);

  // Ref-based guard so syncNow doesn't need isSyncing in its deps.
  // Without this, every isSyncing state flip recreates syncNow, which in turn
  // restarts the AppState subscription on every sync cycle.
  const isSyncingRef = useRef(false);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  const syncNow = useCallback(async (): Promise<void> => {
    if (Platform.OS !== "ios") return;
    if (isSyncingRef.current) return;

    console.log("[HealthKit] syncNow called");

    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const granted = await requestHealthKitPermissions();
      console.log("[HealthKit] permissions:", granted);
      if (!granted) return;
      setIsPermissionsGranted(true);

      const data = await fetchTodayHealthData();
      console.log("[HealthKit] data:", JSON.stringify(data));

      const hasData =
        data.sleepHours !== null ||
        data.hrv !== null ||
        data.restingHeartRate !== null ||
        data.steps !== null;

      if (!hasData) {
        console.log("[HealthKit] no data to sync");
        return;
      }

      const token = await getToken();
      console.log("[HealthKit] token:", token ? "present" : "missing");
      if (!token) return;

      const body: Record<string, number> = {};
      if (data.sleepHours !== null) body.sleepHours = data.sleepHours;
      if (data.hrv !== null) body.hrv = data.hrv;
      if (data.restingHeartRate !== null) body.restingHeartRate = data.restingHeartRate;
      if (data.steps !== null) body.steps = Math.round(data.steps);

      const res = await fetch(`${getApiBase()}/api/daily-logs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      console.log("[HealthKit] POST /api/daily-logs:", res.status);

      const now = new Date();
      setLastSynced(now);
      await AsyncStorage.setItem(LAST_SYNCED_KEY, now.toISOString());
    } catch (err: unknown) {
      console.log("[HealthKit] sync error:", err instanceof Error ? err.message : String(err));
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [getToken]);

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

        if (granted) await syncNow();
      } catch {
        // ignore
      }
    }

    void init();
  }, [syncNow]);

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
