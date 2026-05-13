# Valo

A full-stack personal AI life companion — a mobile app that helps users understand themselves through daily logging, goal tracking, habit building, and mood/insights.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, served at `/api`)
- `pnpm --filter @workspace/valo run dev` — run Expo app (dev only; use workflow to start)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — provisioned via Replit Clerk integration

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Mobile: Expo 54 + Expo Router 6, React Native 0.81
- API: Express 5
- Auth: Clerk (via `@clerk/expo` + `@clerk/express`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle for server)

## Where things live

- `lib/api-spec/openapi.yaml` — source-of-truth API contract
- `lib/api-client-react/src/generated/` — generated React Query hooks (do not edit)
- `lib/db/src/schema/` — all DB tables (dailyLogs, moodEntries, goals, habits, insights, logEntries)
- `artifacts/api-server/src/routes/` — all API route handlers
- `artifacts/api-server/src/middlewares/` — requireAuth, clerkProxyMiddleware
- `artifacts/valo/app/` — all Expo Router screens
- `artifacts/valo/constants/colors.ts` — warm amber/gold palette (light + dark)
- `artifacts/valo/hooks/useColors.ts` — color scheme hook

## Architecture decisions

- Contract-first API: OpenAPI spec → Orval codegen → typed hooks + Zod schemas used in both client and server
- Clerk auth: proxy middleware on the API server routes Clerk frontend API calls; `requireAuth` extracts `userId` from JWT on every protected route
- Daily logs upsert: `POST /api/daily-logs` creates or updates today's record (keyed on userId + date), so the mobile client can call it idempotently
- Dashboard computed server-side: `GET /api/dashboard` derives pillar scores from daily logs, moods, habits, and log entries — no client-side score calculation
- Seed insights: the insights route automatically seeds 3 example insight cards for new users with no data, so the screen is never empty

## Product

**5 tabs:**
1. **Today** — greeting, metric tiles (Sleep, HRV, Steps, RHR) with "Log it" tap targets if unlogged, and 3 pillar score cards (Health, Work & Mission, Relationships) with progress bars and status summaries
2. **Voice** — microphone button for evening debrief, today's top goal context, quick-log shortcuts (mood, water, wind-down, note)
3. **Goals** — Big Goals list with progress bars + Daily Habits with streak tracking and one-tap completion
4. **Insights** — 7-day mood bar chart + AI insight cards with follow-up questions
5. **Log** — Wearable sync "coming soon" banner, expandable Health Metrics form (sleep stepper with 0.5hr increments, HRV, RHR, Steps, workout type picker, duration, effort 1–10), quick-log grid, today's activity log

## User preferences

- Warm amber/gold palette (`#C17B3F` primary light, `#DDB278` primary dark), off-white background `#F7F5F2`
- Clean, calm, minimal UI. Thoughtful companion, not a clinical dashboard.
- No emojis in UI or code

## Gotchas

- After editing the OpenAPI spec, always run `pnpm --filter @workspace/api-spec run codegen` before editing screens that use those hooks
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` is injected at dev-server start via the `dev` script; it reads `$CLERK_PUBLISHABLE_KEY` from the environment
- DB push is required after any schema changes: `pnpm --filter @workspace/db run push`
- The `and()` import in server routes must come from `drizzle-orm`, not a local function

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `clerk-auth` skill for Clerk setup, token caching, and proxy configuration
