---
name: Workout live HR tracking (BLE)
description: How live heart-rate tracking is wired into the Workout Co-Pilot — BLE lifecycle, capture/persist, summary storage.
---

# Live HR tracking in Workout Co-Pilot

Live heart-rate via `react-native-ble-plx` (standard HR Service `0x180D`, measurement char `0x2A37`). Pure parsing/zone helpers live in `lib/heartRate.ts`; all BLE side effects in `contexts/HeartRateContext.tsx` (mounted in `_layout` inside `WorkoutCopilotProvider`).

## BLE lifecycle rules (learned the hard way)
- `createManager()` lazy-`require`s the native module and returns `null` on web / Expo Go → `supported=false`, no crash. Never `import` BleManager at module top level.
- Auto-reconnect uses a `while (!manualDisconnectRef && !shutdownRef)` loop with exponential backoff. **Both** flags must gate the loop AND any post-await `attachDevice`, or the loop keeps running against a destroyed manager after the provider unmounts (battery drain + setState-after-unmount).
  - **Why:** unmount cleanup destroys the manager but the in-flight reconnect promise can resolve afterward; guard before attaching.
- `onDisconnected` calls reconnect via a `reconnectRef` (ref holds latest fn) to avoid a stale-closure / re-subscribe cycle.
- The 15s scan auto-stop timeout must be stored in a ref and cleared on `stopScan`/rescan/unmount, else a stale timer stops a newer scan.

## Capture / persist / summarize
- `beginCapture(sessionId)` / `stopCapture` / `clearCapture` keyed by AsyncStorage `valo:hr_samples_<sessionId>` (debounced 1.5s writes) so samples survive reconnect/app backgrounding.
- On finish: client POSTs samples to `/workout/sessions/{id}/hr` (server computes avg/max, time-in-zone, Keytel calories in `lib/workoutHr.ts` and stores them ON the session), THEN `/complete`, then `clearCapture`. Summary params also passed to `copilot-summary`.
- Calorie accuracy needs `userProfiles.maxHeartRate` + `weightKg` (Settings → Heart Rate section); max HR falls back to `220 − age` then 190.
