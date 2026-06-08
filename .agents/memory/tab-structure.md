---
name: Tab Structure
description: Current bottom tab bar and navigation architecture for the Valo app.
---

## Current Structure (post-spec alignment)

**4 visible tabs + center FAB:**
- Home (`index`) — house icon
- Search (`search`) — magnifier icon
- **Center FAB** — amber/gold `+` button → navigates to `checkin` tab
- Notifications (`notifications`) — bell icon
- Profile (`profile`) — person icon

**Hidden tabs** (href: null, still routable from in-app navigation):
- `plan` — Plan screen
- `health` — Health screen
- `insights` — Insights screen (retained but hidden; spec says no Insights tab)

**Custom tab bar:** `artifacts/valo/components/CustomTabBar.tsx`
- Typed with `any` for the tab bar props to avoid `@react-navigation/bottom-tabs` type conflicts (package not directly available in the workspace)
- SF Symbol names passed as `as any` since they're dynamic strings (not literals)

**Layout file:** `artifacts/valo/app/(tabs)/_layout.tsx`
- Uses `tabBar={(props) => <CustomTabBar {...props} />}` on the `Tabs` component
- NativeTabLayout (Liquid Glass) also updated to 5 triggers matching the new structure

**Home screen:** `artifacts/valo/app/(tabs)/index.tsx`
- Full Home screen (no longer a redirect to checkin)
- Shows: greeting with user name/avatar, At a Glance horizontal card scroll, Your Spaces 2x2 grid

**Why:** Spec §5 defines 4 tabs (Home · Plan · Health · Profile) with a center Check-in FAB. The old structure had 5 tabs with Check-in as a regular tab and no FAB. The mockup the user provided confirmed the visual design: house, magnifier, [FAB], bell, person.
