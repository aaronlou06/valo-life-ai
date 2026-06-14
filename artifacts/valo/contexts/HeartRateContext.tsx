import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { PermissionsAndroid, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  BleManager as BleManagerType,
  Device,
  Subscription,
} from "react-native-ble-plx";
import {
  HEART_RATE_MEASUREMENT_UUID,
  HEART_RATE_SERVICE_UUID,
  base64ToBytes,
  parseHeartRateMeasurement,
  type HrSample,
} from "@/lib/heartRate";

export type HrConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export type DiscoveredDevice = {
  id: string;
  name: string;
  rssi: number | null;
};

interface HeartRateContextType {
  supported: boolean;
  poweredOn: boolean;
  status: HrConnectionStatus;
  scanning: boolean;
  devices: DiscoveredDevice[];
  connectedDevice: { id: string; name: string } | null;
  bpm: number | null;
  samples: HrSample[];
  startScan: () => Promise<void>;
  stopScan: () => void;
  connect: (deviceId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  beginCapture: (sessionId: number) => Promise<void>;
  stopCapture: () => void;
  clearCapture: (sessionId: number) => Promise<void>;
}

const noop = () => {};
const asyncNoop = async () => {};

const HeartRateContext = createContext<HeartRateContextType>({
  supported: false,
  poweredOn: false,
  status: "disconnected",
  scanning: false,
  devices: [],
  connectedDevice: null,
  bpm: null,
  samples: [],
  startScan: asyncNoop,
  stopScan: noop,
  connect: asyncNoop,
  disconnect: asyncNoop,
  beginCapture: asyncNoop,
  stopCapture: noop,
  clearCapture: asyncNoop,
});

const LAST_DEVICE_KEY = "valo:hr_last_device";
const samplesKey = (sessionId: number) => `valo:hr_samples_${sessionId}`;

function createManager(): BleManagerType | null {
  if (Platform.OS === "web") return null;
  try {
    // Lazy require so web / Expo Go without the native module never crashes.
    const mod = require("react-native-ble-plx") as typeof import("react-native-ble-plx");
    return new mod.BleManager();
  } catch {
    return null;
  }
}

export function HeartRateProvider({ children }: { children: React.ReactNode }) {
  const managerRef = useRef<BleManagerType | null>(null);
  const [supported, setSupported] = useState(false);
  const [poweredOn, setPoweredOn] = useState(false);
  const [status, setStatus] = useState<HrConnectionStatus>("disconnected");
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<{ id: string; name: string } | null>(null);
  const [bpm, setBpm] = useState<number | null>(null);
  const [samples, setSamples] = useState<HrSample[]>([]);

  const deviceRef = useRef<Device | null>(null);
  const monitorRef = useRef<Subscription | null>(null);
  const disconnectSubRef = useRef<Subscription | null>(null);
  const samplesRef = useRef<HrSample[]>([]);
  const captureSessionRef = useRef<number | null>(null);
  const manualDisconnectRef = useRef(false);
  const reconnectingRef = useRef(false);
  const shutdownRef = useRef(false);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Holds the latest reconnect fn so the onDisconnected closure never goes stale.
  const reconnectRef = useRef<(deviceId: string) => void>(() => {});

  // ── Init manager + bluetooth state listener ──
  useEffect(() => {
    const manager = createManager();
    managerRef.current = manager;
    setSupported(manager !== null);
    if (!manager) return;

    const sub = manager.onStateChange((state) => {
      setPoweredOn(state === "PoweredOn");
    }, true);

    return () => {
      shutdownRef.current = true;
      manualDisconnectRef.current = true;
      reconnectingRef.current = false;
      sub.remove();
      monitorRef.current?.remove();
      disconnectSubRef.current?.remove();
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
      try {
        manager.destroy();
      } catch {
        // ignore
      }
    };
  }, []);

  const persistSamples = useCallback(() => {
    const sid = captureSessionRef.current;
    if (sid === null) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      AsyncStorage.setItem(samplesKey(sid), JSON.stringify(samplesRef.current)).catch(() => {});
    }, 1500);
  }, []);

  const handleBpm = useCallback(
    (value: number) => {
      setBpm(value);
      if (captureSessionRef.current !== null) {
        const sample: HrSample = { bpm: value, sampledAt: new Date().toISOString() };
        samplesRef.current = [...samplesRef.current, sample];
        setSamples(samplesRef.current);
        persistSamples();
      }
    },
    [persistSamples],
  );

  const startMonitor = useCallback(
    (device: Device) => {
      monitorRef.current?.remove();
      monitorRef.current = device.monitorCharacteristicForService(
        HEART_RATE_SERVICE_UUID,
        HEART_RATE_MEASUREMENT_UUID,
        (error, characteristic) => {
          if (error) return;
          const v = characteristic?.value;
          if (!v) return;
          const parsed = parseHeartRateMeasurement(base64ToBytes(v));
          if (parsed !== null && parsed > 0) handleBpm(parsed);
        },
      );
    },
    [handleBpm],
  );

  const attachDevice = useCallback(
    (d: Device) => {
      deviceRef.current = d;
      setConnectedDevice({ id: d.id, name: d.name ?? "Heart-rate monitor" });
      disconnectSubRef.current?.remove();
      disconnectSubRef.current = d.onDisconnected(() => {
        setBpm(null);
        if (manualDisconnectRef.current) {
          setStatus("disconnected");
          return;
        }
        reconnectRef.current(d.id);
      });
      startMonitor(d);
    },
    [startMonitor],
  );

  const attemptReconnect = useCallback(
    async (deviceId: string) => {
      const manager = managerRef.current;
      if (
        !manager ||
        reconnectingRef.current ||
        manualDisconnectRef.current ||
        shutdownRef.current
      )
        return;
      reconnectingRef.current = true;
      setStatus("reconnecting");
      let delay = 1500;
      while (!manualDisconnectRef.current && !shutdownRef.current) {
        try {
          const d = await manager.connectToDevice(deviceId, { timeout: 8000 });
          if (manualDisconnectRef.current || shutdownRef.current) {
            try {
              await manager.cancelDeviceConnection(d.id);
            } catch {
              // ignore
            }
            break;
          }
          await d.discoverAllServicesAndCharacteristics();
          attachDevice(d);
          setStatus("connected");
          reconnectingRef.current = false;
          return;
        } catch {
          await new Promise((r) => setTimeout(r, delay));
          delay = Math.min(delay * 1.5, 8000);
        }
      }
      reconnectingRef.current = false;
    },
    [attachDevice],
  );

  useEffect(() => {
    reconnectRef.current = (deviceId: string) => {
      void attemptReconnect(deviceId);
    };
  }, [attemptReconnect]);

  const stopScan = useCallback(() => {
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    managerRef.current?.stopDeviceScan();
    setScanning(false);
  }, []);

  const ensureAndroidPermissions = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== "android") return true;
    try {
      const perms = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ].filter(Boolean);
      const granted = await PermissionsAndroid.requestMultiple(perms);
      return Object.values(granted).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
    } catch {
      return false;
    }
  }, []);

  const startScan = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager || shutdownRef.current) return;
    const ok = await ensureAndroidPermissions();
    if (!ok) return;

    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    setDevices([]);
    setScanning(true);
    manager.startDeviceScan([HEART_RATE_SERVICE_UUID], null, (error, device) => {
      if (error) {
        setScanning(false);
        return;
      }
      if (!device) return;
      setDevices((prev) => {
        if (prev.some((d) => d.id === device.id)) return prev;
        return [
          ...prev,
          {
            id: device.id,
            name: device.name ?? device.localName ?? "Unknown device",
            rssi: device.rssi,
          },
        ];
      });
    });

    // Auto-stop scan after 15s to conserve battery.
    scanTimerRef.current = setTimeout(() => {
      scanTimerRef.current = null;
      manager.stopDeviceScan();
      setScanning(false);
    }, 15000);
  }, [ensureAndroidPermissions]);

  const connect = useCallback(
    async (deviceId: string) => {
      const manager = managerRef.current;
      if (!manager || shutdownRef.current) return;
      manualDisconnectRef.current = false;
      stopScan();
      setStatus("connecting");
      try {
        const d = await manager.connectToDevice(deviceId, { timeout: 10000 });
        await d.discoverAllServicesAndCharacteristics();
        attachDevice(d);
        setStatus("connected");
        AsyncStorage.setItem(LAST_DEVICE_KEY, d.id).catch(() => {});
      } catch {
        setStatus("disconnected");
        setConnectedDevice(null);
      }
    },
    [attachDevice, stopScan],
  );

  const disconnect = useCallback(async () => {
    manualDisconnectRef.current = true;
    reconnectingRef.current = false;
    monitorRef.current?.remove();
    monitorRef.current = null;
    disconnectSubRef.current?.remove();
    disconnectSubRef.current = null;
    const d = deviceRef.current;
    deviceRef.current = null;
    setBpm(null);
    setConnectedDevice(null);
    setStatus("disconnected");
    if (d) {
      try {
        await managerRef.current?.cancelDeviceConnection(d.id);
      } catch {
        // ignore
      }
    }
  }, []);

  const beginCapture = useCallback(async (sessionId: number) => {
    captureSessionRef.current = sessionId;
    try {
      const stored = await AsyncStorage.getItem(samplesKey(sessionId));
      const restored = stored ? (JSON.parse(stored) as HrSample[]) : [];
      samplesRef.current = Array.isArray(restored) ? restored : [];
    } catch {
      samplesRef.current = [];
    }
    setSamples(samplesRef.current);
  }, []);

  const stopCapture = useCallback(() => {
    captureSessionRef.current = null;
  }, []);

  const clearCapture = useCallback(async (sessionId: number) => {
    captureSessionRef.current = null;
    samplesRef.current = [];
    setSamples([]);
    await AsyncStorage.removeItem(samplesKey(sessionId)).catch(() => {});
  }, []);

  return (
    <HeartRateContext.Provider
      value={{
        supported,
        poweredOn,
        status,
        scanning,
        devices,
        connectedDevice,
        bpm,
        samples,
        startScan,
        stopScan,
        connect,
        disconnect,
        beginCapture,
        stopCapture,
        clearCapture,
      }}
    >
      {children}
    </HeartRateContext.Provider>
  );
}

export function useHeartRate() {
  return useContext(HeartRateContext);
}
