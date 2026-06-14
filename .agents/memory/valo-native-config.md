---
name: Valo native config (Expo CNG)
description: How Valo's Expo native config is managed — static app.json + CNG, and BLE setup.
---

# Valo Expo native config

## Static app.json only — never app.config.js
Valo must use a **static `app.json`** for Expo config, not `app.config.js`/`.ts`.

**Why:** Replit's Expo Launch / EAS build flow breaks with dynamic config files (per the expo skill). A dynamic `app.config.js` previously existed and was migrated to `app.json`; the dynamic file was deleted.

**How to apply:** Edit `app.json` directly for any Expo setting. If a dynamic config reappears, migrate it back to `app.json` and delete it.

## Native folders are gitignored (CNG)
`artifacts/valo/ios/` and `android/` are in `.gitignore` and untracked. The project uses Continuous Native Generation — EAS/Expo Launch regenerates native projects from `app.json` (and config plugins) at build time.

**How to apply:** `app.json` is the source of truth. Do NOT hand-edit native files (Info.plist, AndroidManifest, etc.) to fix config — the edits get blown away on rebuild. Express everything through `app.json` infoPlist/permissions/entitlements and config plugins. Stale local native folders are harmless leftovers from local prebuilds; deleting them is safe (regenerated on next build).

## Bluetooth LE heart-rate readiness
`react-native-ble-plx` is installed and configured via its Expo config plugin in `app.json` with `isBackgroundEnabled: true`, `modes: ["central"]`, and a `bluetoothAlwaysPermission` string. iOS has `NSBluetoothAlwaysUsageDescription` and `bluetooth-central` in `UIBackgroundModes` (for receiving HR while backgrounded). Android has BLUETOOTH_SCAN/CONNECT, ACCESS_FINE_LOCATION, FOREGROUND_SERVICE_CONNECTED_DEVICE. `expo-dev-client` + eas.json dev profile (`developmentClient: true`) enable physical-device dev builds. Device UI was intentionally not built in this step.
