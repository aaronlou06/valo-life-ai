import { Platform } from "react-native";

type VapiLike = {
  on: (event: string, cb: (...args: any[]) => void) => void;
  off: (event: string, cb: (...args: any[]) => void) => void;
  start: (assistantId: string, options?: Record<string, unknown>) => Promise<unknown>;
  stop: () => void;
  setMuted: (muted: boolean) => void;
};

const noop: VapiLike = {
  on: () => {},
  off: () => {},
  start: async () => {},
  stop: () => {},
  setMuted: () => {},
};

function createVapi(): VapiLike {
  if (Platform.OS === "web") {
    console.log("[Valo] Vapi disabled on web");
    return noop;
  }
  try {
    // Dynamic require so Metro does NOT evaluate the native module at import
    // time — this prevents the crash in Expo Go where native bindings are absent.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const VapiModule = require("@vapi-ai/react-native") as { default: new (key: string) => VapiLike };
    const instance = new VapiModule.default(process.env.EXPO_PUBLIC_VAPI_KEY ?? "");
    console.log("[Valo] Vapi SDK initialised");
    return instance;
  } catch (e) {
    console.warn("[Valo] Vapi SDK unavailable (Expo Go or missing native module):", e);
    return noop;
  }
}

const vapi = createVapi();
export default vapi;
