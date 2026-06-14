---
name: Workout Co-Pilot panel shell
description: How the persistent workout co-pilot panel and its global session store are wired in the Valo Expo app.
---

# Workout Co-Pilot shell

A persistent, minimizable panel for the workout feature. State lives in `WorkoutCopilotContext` (panel open/minimized + active session), persisted to AsyncStorage under `valo:copilot_panel_state` and `valo:copilot_active_session`, hydrated once on mount with a `hydrated` flag to avoid first-frame flicker.

**Mounting:** both `WorkoutCopilotProvider` and `WorkoutCopilotPanel` are mounted at the app ROOT (`app/_layout.tsx`), as siblings of `RootLayoutNav`, inside all providers (Auth/Theme/SafeArea). Root mounting is what makes the panel survive tab switches and any navigation — do NOT move it into `(tabs)/_layout`.
**Why:** the active session and the panel must outlive per-screen unmounts; only a root mount + AsyncStorage gives "survives tab change, backgrounding, and app restart".

**Visuals:** minimized = a slim bar floating at `insets.bottom + 64 (tab bar) + 8` above the tab bar; expanded = a bottom-sheet `Modal` mirroring `CheckInSheet`'s slide+backdrop animation. The bar wrapper uses `pointerEvents="box-none"` so it never blocks underlying UI.

**Gating:** panel returns null until `hydrated`, when not `isSignedIn`, and on auth/onboarding routes plus the five co-pilot *flow* routes themselves (matched against `MENU_OPTIONS[].route`). The `copilot-modules` launcher hub is intentionally NOT hidden — match flow routes precisely, not a broad `/copilot-` prefix.

**Menu → placeholder routes (flat files, not a group):** `/copilot-start`, `/copilot-create`, `/copilot-edit`, `/copilot-plan`, `/copilot-import`. All five share `components/CopilotPlaceholder.tsx`. `copilot-start` is the only one wired to the store — it calls `startSession({name,source:"start"})` to create a local session (sessionId null until server persistence exists later).
