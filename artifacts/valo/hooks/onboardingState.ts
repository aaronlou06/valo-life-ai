import AsyncStorage from "@react-native-async-storage/async-storage";

const ONBOARDING_KEY = "@valo/onboarding-complete";

// Module-level flag so callers get a synchronous answer within a session.
let _onboardingComplete = false;

export function isOnboardingComplete(): boolean {
  return _onboardingComplete;
}

// Sets the in-memory flag immediately and persists to AsyncStorage so the
// flag survives hot reloads and app restarts regardless of whether the
// network call to /api/settings succeeded.
export function markOnboardingComplete(): void {
  _onboardingComplete = true;
  AsyncStorage.setItem(ONBOARDING_KEY, "true").catch(() => {});
}

// Call this once on startup before checking the API. Returns true if
// AsyncStorage confirms onboarding was already completed in a prior session.
export async function loadOnboardingState(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(ONBOARDING_KEY);
    if (val === "true") {
      _onboardingComplete = true;
      return true;
    }
  } catch {
    // ignore — fall through to API check
  }
  return false;
}
