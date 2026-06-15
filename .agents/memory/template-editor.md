---
name: Template editor patterns
description: Key decisions for workout template CRUD, TemplateEditor component, import (Claude), and copilot-edit URL-param strategy.
---

## TemplateEditor component
- `artifacts/valo/components/TemplateEditor.tsx` — shared by copilot-create and copilot-edit screens.
- Uses `react-native-draggable-flatlist` v4 for drag-to-reorder. GestureHandlerRootView is already in `_layout.tsx` — no extra wrapping needed.
- Exercise search: debounced (320ms) call to GET /exercises?search= using customFetch.
- Superset grouping: each pair of exercises sharing the same non-null `supersetGroupId` integer is a superset. "Group with next" toggles between pairing and un-pairing adjacent slots.

## copilot-edit.tsx — URL param strategy
- copilot-start.tsx passes template metadata (id, name, category, duration, notes) as navigation params.
- copilot-edit.tsx only fetches exercises (GET /workout/templates/:id/exercises), not template metadata.
- This avoids needing a GET /workout/templates/:id endpoint.

**Why:** Fetching all templates just to get one was wasteful; adding a single-template GET endpoint added unnecessary complexity. Params are available instantly with no latency.

## Template exercise save strategy
- On save in copilot-edit: DELETE all original slot IDs one-by-one, then POST all current slots in order.
- Simpler than tracking individual changes; slot IDs change on each save but that is acceptable since slot IDs are not referenced elsewhere.

**Why:** Tracking "added/removed/changed" slots requires maintaining a diff, which is complex UI state. Delete-all + re-insert is idempotent and easy to reason about.

## Import (Claude AI)
- `artifacts/api-server/src/lib/templateImport.ts` — `parseWorkoutImport(input)` accepts `{ text }` OR `{ imageBase64, mimeType }`.
- If imageBase64 is provided: Claude vision extracts workout text first, then standard parse prompt runs.
- Fetches up to 900 system exercises as a lookup table for Claude to match against.
- Returns `ParsedTemplate` with `confidence: "high"|"medium"|"low"` per exercise; matchedExerciseId is null for unmatched.
- Route: `POST /workout/templates/import` — must remain registered BEFORE `PATCH /workout/templates/:id` to avoid conflict.

## Server routes order matters
- `POST /workout/templates/import` and `PUT /workout/templates/:id/exercises/order` must be registered BEFORE their `:id`-parameterised counterparts to avoid Express routing ambiguity.
