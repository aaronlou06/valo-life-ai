---
name: Dark mode
description: How theme switching works in Valo — ThemeContext, AsyncStorage persistence, and the Profile toggle.
---

ThemeProvider wraps the full root tree in `app/_layout.tsx` (inside ErrorBoundary, outside AuthProvider).

`contexts/ThemeContext.tsx`:
- Reads stored value from AsyncStorage key `@valo/theme` on mount; defaults to Appearance.getColorScheme() (system) until loaded.
- Returns `null` while loading to avoid flash-of-wrong-theme.
- `setColorScheme(scheme)` updates state and writes to AsyncStorage.

`hooks/useColors.ts`:
- Uses `useTheme()` from ThemeContext instead of `useColorScheme()` — this is important so the user's explicit override takes precedence over the system.

`constants/colors.ts`:
- Added `navBackground`, `navActive`, `navInactive` tokens to both light and dark palettes.
- Dark palette: bg #1A1814, card #302C26, muted #2E2A24, text #E8E4DE, mutedForeground #9A8D80, border #3A3530, navBg #1E1A16, navActive #D0C4B4, navInactive #6A6058.

`components/CustomTabBar.tsx`:
- Removed hardcoded ACTIVE_COLOR / INACTIVE_COLOR constants; uses `colors.navActive` / `colors.navInactive` / `colors.navBackground` from `useColors()`.

Profile toggle (`app/(tabs)/profile.tsx`):
- `AppearanceRow` component rendered between Notifications and Holiday region rows inside the Account settings card.
- Sun/moon pill toggle; pill bg and active indicator colors are hardcoded (not from palette) so they remain distinct regardless of current scheme.

**Why:** React Native's useColorScheme() only reflects the OS setting; ThemeContext lets the user explicitly override it, with the preference persisted so it survives app restarts.
