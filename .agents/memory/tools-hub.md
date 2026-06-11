---
name: Tools hub
description: How the Check-in "Tools" option and its six tool sub-screens are structured.
---

# Tools hub

The CheckInSheet "Tools" option (`actionType: "open_tools"`) navigates to `/tools`, a 6-tile hub. Tiles route to flat routes, not a `(tools)` route group.

**Why:** The app's convention is flat feature routes (e.g. `meal-planner`, `settings`, `connections`) registered individually in `app/_layout.tsx`. A route group would clash with the two tool screens that already existed as flat routes.

**How to apply:**
- Meal Planner tile points to the existing `meal-planner.tsx` — that screen is a full backend-connected feature (AI meal plans, grocery ordering, AsyncStorage persistence). Never overwrite it with a placeholder.
- The other five tool screens (accountability-buddy, time-management, fitness, grocery, charts) are UI-only with local `useState` (no backend). `accountability-buddy` was previously a "coming soon" stub before being built out.
- New tool screens must be registered as `<Stack.Screen name="..." />` in `app/_layout.tsx` to be reachable.
- Charts use `react-native-svg` (installed). Accent colors are fixed brand hues per tile; everything else uses `useColors()` for dark-mode support.
