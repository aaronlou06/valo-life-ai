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

## Shape
- Backend: `lib/askValo.ts` (`answerUserQuestion`) builds context from debriefs, journal, goals, habits+completions, profile memory, daily_logs, and calendar events (-7d/+14d), calls `claude-haiku-4-5`, parses JSON `{answer, citations:[{source,date,excerpt}]}`. Strips markdown fences before JSON.parse.
- Route `POST /ask` (auth-gated) validates question non-empty, caps question length and clamps each prior-turn field before invoking the model.
- Contract-first: schemas live in `lib/api-spec/openapi.yaml` (operationId `askValo` → `useAskValo` hook). Re-run codegen after spec edits.
