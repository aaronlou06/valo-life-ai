---
name: Safe-area top padding on Expo web preview
description: Why every tab screen needs a web inset floor, not bare insets.top
---

# Safe-area top padding floor for web preview

On the Replit canvas, Valo is shown as the **Expo web** build inside a phone-frame
mockup iframe. On web, `useSafeAreaInsets()` returns `insets.top === 0`, so
`paddingTop: insets.top + N` collapses to just `N` px and the screen title renders
under the mockup's Dynamic Island.

**Rule:** every top-level tab screen must compute top padding as
`(Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top) + offset`.
Use the bare `insets.top` only on native. Offsets: large headings ~20-24, others ~16.

**Why:** the user repeatedly reported titles "cut off / too high" — the cause was
not the offset size but that three screens (Home, Health, Progress) used bare
`insets.top` with no web floor while the others already had the `Math.max(..., 67)`
guard. The screenshots were the web preview, not a real device.

**How to apply:** when adding or editing any `(tabs)/*` screen, never wrap in
`<SafeAreaView>` and add inset padding at the same time — pick one. Prefer
`useSafeAreaInsets()` + the web-floor expression above on the scroll container or
header. Keep all six tabs consistent.
