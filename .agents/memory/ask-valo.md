---
name: Ask Valo feature
description: Design decisions behind the "Ask Valo" grounded-retrieval Q&A feature (mobile + API)
---

# Ask Valo

Natural-language Q&A where the user asks about their own life and Claude answers grounded in their own logged data, with citations.

## Locked design decisions (keep consistent)
- **Citations = separate collapsible "Sources" section** below clean prose, NOT inline markers. The model is told explicitly not to put citation markers in the prose.
- **Entry point = Home screen only** — a search-bar-style button. Do not add other in-app entry points unless asked.
- **Context fetch is stateless every turn**: the API rebuilds the full DB context block on each request. Conversation continuity comes only from passing prior Q&A turns into the prompt (capped to last 5, `MAX_PRIOR_TURNS`).
- **Honesty over fabrication**: the system prompt requires the model to plainly say it has no data and return an empty citations array rather than invent a citation. **Why:** a fabricated citation is worse than admitting no data — this is the whole point of the feature.

## Keyboard avoidance in modal sheets
`KeyboardAvoidingView` with `behavior="padding"` and `keyboardVerticalOffset=0` silently fails when the screen is presented as a modal sheet (`presentation: "modal"` → `UIModalPresentationPageSheet` on iOS 13+). KAV measures keyboard height relative to the window top and subtracts the offset; with offset=0 it assumes the KAV starts at y=0, but the modal card's top gap + header height means the KAV is ~`insets.top + 56px` below the window — KAV under-compensates by exactly that amount, leaving the input bar partially behind the keyboard. The modal's top gap is also not a stable constant (varies by iOS version, drag state), so computing a correct offset dynamically is fragile.
**Fix:** replace KAV with `Keyboard.addListener('keyboardWillShow'/'keyboardWillHide')` (iOS) / `keyboardDidShow/Hide` (Android). Capture `e.endCoordinates.height` as state and apply it as `paddingBottom` on the flex container below the header. Flip the input bar's own `paddingBottom` to a flat `12` (no inset) when keyboard is up (the keyboard itself provides the visual buffer); restore `Math.max(insets.bottom, 12)` when it's down.

## Model output is NOT reliably bare JSON
`claude-haiku-4-5` frequently wraps the JSON object in conversational prose — a preamble before it and/or a trailing sentence after it — **especially on no-data and follow-up turns** (the chatty cases). It also sometimes fences it (` ```json `).
**Why:** a parser that only handles bare JSON or a fully-anchored `^```…```$` fence will `JSON.parse`-throw on the trailing characters and return a 500 — which is exactly what happened and looked like "data-returning questions work, these don't."
**How to apply:** extract the first *balanced* top-level `{…}` object (track brace depth, ignore braces inside string literals, honor `\` escapes) after stripping any fence; on parse failure or no-JSON, degrade gracefully to a plain-prose answer with empty citations rather than erroring. Only genuine upstream/network failures should surface as 500.

## Shape
- Backend: `lib/askValo.ts` (`answerUserQuestion`) builds context from debriefs, journal, goals, habits+completions, profile memory, daily_logs, and calendar events (-7d/+14d), calls `claude-haiku-4-5`, parses JSON `{answer, citations:[{source,date,excerpt}]}`. Strips markdown fences before JSON.parse.
- Route `POST /ask` (auth-gated) validates question non-empty, caps question length and clamps each prior-turn field before invoking the model.
- Contract-first: schemas live in `lib/api-spec/openapi.yaml` (operationId `askValo` → `useAskValo` hook). Re-run codegen after spec edits.
