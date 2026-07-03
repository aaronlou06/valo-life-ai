# CLAUDE.md — Valo

This file is loaded into context at the start of every Claude Code session. Read it before acting.

Last verified against codebase: 2026-07-03, commit `40dd7c3`.

---

## What Valo is

Valo is an AI-powered personal life companion iOS app, $20/month subscription, built by a solo developer (Aaron — sole product owner, architect, and decision-maker). The product thesis is **consolidation**: Valo must be competent enough across every life domain (health, fitness, nutrition, planning, journaling, focus, relationships, finances, spirituality) that users delete every other app.

The heart of the product is a Claude-driven pipeline behind voice check-ins, paired with an accountability layer (buddies/commitments), AI-generated meal plans, and an AI workout copilot. The AI *is* the information architecture: one unified data model powers many views; insights are overlays, not destinations; inputs are inferred from natural language.

**Current goal:** Reach a fully functional state, ship on the App Store, and adhere to all security and Apple guidelines.

---

## Tech stack (verified against code)

- **Frontend:** React Native + Expo (Expo Router), TypeScript
- **Backend:** Node.js / Express, PostgreSQL, Drizzle ORM
- **Database:** Plain PostgreSQL via `DATABASE_URL`, Drizzle push-based schema (no versioned migration files). **There is no Supabase code anywhere in the repo** — if a Supabase migration is still intended, it hasn't started; if it's been abandoned, the launch gate below should be retired. Confirm intent.
- **Auth:** Custom session-token auth (`usersTable.sessionToken` + expiry, checked in `requireAuth` middleware) — not Clerk, despite some package history. Email/password, no third-party SSO currently wired into the active auth screens.
- **Voice:** Vapi (outbound calling + in-app SDK) — still live duplex calls only; see "Voice/cost architecture" below.
- **AI:** Claude API via `@workspace/integrations-anthropic-ai`. Haiku-class (`claude-haiku-4-5`) for debrief extraction and pre-call intelligence; Sonnet-class (`claude-sonnet-4-6`) for meal-plan generation.
- **Health:** Apple HealthKit, fully wired (`react-native-health`, entitlements, multi-source reads — see Build rules).
- **Calendar/comms:** Google Calendar is genuinely integrated (OAuth + sync). **Garmin, Oura, and Whoop now have real backend routes** (`integrations-garmin.ts`, `integrations-oura.ts`, `integrations-whoop.ts`) with OAuth token storage (`wearableTokens` table) and a nightly sync job (`wearableSyncJob.ts`). **Twilio is still a UI placeholder** in `connections.tsx` (listed as "SMS reminders & notifications") with no backend route — fix or relabel before launch.
- **Build/deploy:** EAS (dev/preview/production profiles configured, production has `autoIncrement` on); Next.js marketing site (joinvalo.app, not in this monorepo).
- **Email:** Resend — wired for password-reset emails only (`resendEmail.ts`). Weekly Recap generates content but does not send it via Resend or push; domain verification status can't be confirmed from code (operational/DNS-level check).
- **Payments:** Implemented. Full monetization layer landed in one commit: Helcim WebView checkout (`HelcimPayWebView.tsx`), `paywall.tsx` (feature list, $20/mo card, 7-day trial badge), `referral-offer.tsx` (tier modal), `referrals.tsx` (copy/share/stats/tier progress), `CancellationModal` (reason picker → save attempt → confirm), `GracePeriodPrompt` (per-session banner), `SubscriptionContext` (polls `/api/subscription/status`, surfaces trialing/grace/active/expired/canceled). Server routes: `/api/subscription/*`, `/api/payment/helcim-*`, `/api/referrals/*`. Nightly subscription cron. Onboarding `StepReferralSource` step added. Routing gate in `index.tsx` (expired/canceled → `/paywall`, grace → soft prompt).

---

## Monorepo layout (pnpm workspace)

- Frontend app: `artifacts/valo/`
- API server: `artifacts/api-server/` (routes in `src/routes/`, business logic in `src/lib/`, auth middleware in `src/middlewares/`)
- Mockup/design preview tool: `artifacts/mockup-sandbox/` (Vite, not part of the shipped product)
- Shared libs: `lib/db` (Drizzle schema), `lib/api-spec` (OpenAPI source of truth), `lib/api-zod`, `lib/api-client-react` (generated React Query hooks — do not hand-edit), `lib/integrations-anthropic-ai` (Claude client + batch helpers)

**Package manager: pnpm only. Never npm or npx.** Run Expo via `pnpm exec expo ...` from `artifacts/valo/`.

The root `preinstall` script guards against accidental npm/yarn use by checking `$npm_execpath`. If you ever see it fail with "Use pnpm instead" during a normal `pnpm run`, it means pnpm's internal install-consistency re-check fired mid-script — re-run `pnpm install` once to settle state, it's not a real npm/yarn invocation.

**Do not commit `pnpm-lock.yaml` changes generated on macOS without checking the diff first.** pnpm on this machine prunes cross-platform optional-dependency entries (Linux/Windows binaries for esbuild, rollup, lightningcss, etc.) down to macOS-arm64-only, which would break installs on Linux (Replit, CI, any Linux-hosted build). If `pnpm install` modifies the lockfile and the diff is mostly large deletions of `os:`/`cpu:` blocks, run `git checkout -- pnpm-lock.yaml` and leave it alone — your local `node_modules` still works fine against the wider committed lockfile.

---

## Protected files — NEVER modify

Do not edit these under any circumstances unless I explicitly say so in this session:

- `Recovery.tsx`
- `GoalProgress.tsx`
- `Motivation.tsx`

**Note: none of these three files currently exist anywhere in the repo.** Leaving this rule in place in case they get (re)created — confirm with Aaron whether this list is still accurate or should be updated/removed.

---

## Navigation model

Four bottom tabs — **Home, Plan, Health, Progress** (`artifacts/valo/components/CustomTabBar.tsx`) — with a center slot that opens the voice check-in as a modal. Profile is reached via a top-right avatar button that opens a menu (`app/(tabs)/index.tsx`), routing into `app/(tabs)/profile.tsx` / `app/settings.tsx`.

Beyond the tab bar, there's a large stack-route surface: `(auth)` (sign-in/up, forgot/reset password), modals (`meal-planner`, `write`, `ask-valo`, `voice`, `guided-checkin`, `buddy-invite`, `commitment/new`), and standalone screens (`accountability-buddy(-ies)`, `commitment/[id]`, `recap/[id]`, `buddy-accept/[code]`, `charts`, `copilot-*`, `(tools)/*`).

---

## Architecture principles (hold these by default)

- **Coach-agnostic commitment spine.** Implemented: `commitmentParticipants.role` is `'buddy' | 'ai_coach' | 'human_coach'` at the schema level. Only the `buddy` role has real product surface today (invite, accept, share-scope, encouragements). `ai_coach`/`human_coach` are schema-ready but have no behavior behind them yet.
- **Nothing mutates without a tap.** Partially realized: `action-proposals` exist server-side (currently one action type, `reschedule_workout`, generated in the nightly job per `generateActionProposals.ts`) but there is **no frontend confirm/reject/undo UI** for them yet — the hooks are imported in `app/(tabs)/index.tsx` but unused. Don't ship a proposal type without building its confirmation UI first.
- **Proposals are generated in nightly jobs, never synchronously** inside briefing/intelligence endpoints. Confirmed honored — `generateActionProposals.ts` explicitly runs in the nightly job, not the home-briefing request path. Keep new proposal types on this path.
- **Expected occurrences are derived from recurrence rules, not pre-materialized as rows.**
- **One exception-aware streak computation path.** Implemented via `verificationEvents` (unified done/missed spine for habits + routines, with `provenance: confirmed|recalled|assumed`) plus `commitmentExceptions` (pause/excused windows that streaks survive). Note `habit-completions.ts` (the old route) still exists alongside the new verification-events path — this looks like an in-progress migration, not a finished cutover; don't add new logic to the old path.
- **Server is the source of truth for shared state** (e.g. buddy/commitment state, encouragement rate-limits). Confirmed — all accountability state is backend-persisted and scope-enforced server-side.
- **Semantics:** a habit/routine being on the calendar does NOT mean it was completed. Keep these distinct.

### Voice / cost architecture
- Two-layer async check-in (cached audio + STT only, then a single batched Haiku follow-up call) is **still not implemented**. Vapi runs live duplex calls for every check-in (`outboundCaller.ts`, `vapi-webhook.ts`) — this remains the expensive path the architecture was meant to avoid. Treat this as a real open task, not done.
- What *is* real: a two-call Claude pipeline around each check-in —
  1. **Post-call extraction** (`processDebrief.ts`, `claude-haiku-4-5`): structured extraction from the call transcript into `debriefExtractions`.
  2. **Pre-call intelligence** (`generatePreCallIntelligence` in `buildVapiContext.ts`, `claude-haiku-4-5`): generates pattern observations / unresolved threads / suggested questions ahead of the next call, and also powers the "From Valo" home card insight (`fromValoInsight.ts`).
  There is no persistent "memory merger" step that fuses new extractions into a long-term memory record between these two — the closest analog is `insightsEngine.ts`, which runs independent statistical correlation + a separate Claude call over historical data. If a true memory-merge layer is still wanted, it doesn't exist yet.
- "Get the data and get out" — breadth across life domains yields the majority of actionable insight. Capture breadth cheaply via fixed structured questions, then spend expensive AI turns only on the 1–2 threads worth pulling.

---

## Build & verification rules

- **Device build is ground truth for visual QA.** Static checks (typecheck, architect review, web preview) do NOT substitute for on-device runtime verification. `react-native-web` is only an approximation.
- **Always verify on an EAS dev build** — not Expo Go, not web preview. Native modules require a compiled binary.
- **Diagnose before fixing** on recurring bugs. Pull the actual file contents rather than trusting summaries or self-reports.
- Run **OpenAPI codegen after any route change** (`pnpm --filter @workspace/api-spec run codegen`).
- Insert manual-trigger endpoints and checkpoints before building UI against unverified generation output.
- `onTextLayout` is native-only and does not fire on `react-native-web` — use an `onLayout` height comparison instead.
- HealthKit (`artifacts/valo/lib/healthKit.ts`): each source — steps, sleep, HRV, resting HR, active calories, respiratory rate, workouts — is fetched independently and degrades to null on failure rather than throwing, so one source failing doesn't cascade. Confirmed in code: steps via `getDailyStepCountSamples` (cross-source de-duped), workouts via `getAnchoredWorkouts` (not `getWorkoutSamples`).
- **expo-localization** must be pinned to `~17.0.9` (the version compatible with Expo SDK 54). It was briefly `^57.0.0` (a 3-major-version overshoot targeting SDK 57), which crashed the app on launch because the native `LocalizationModule` was absent from the compiled binary. It must also be listed in the `plugins` array in `app.json` — without it, the config plugin doesn't run and the native module isn't linked. Both are correctly set as of commit `40dd7c3`. Do not upgrade expo-localization independently of the Expo SDK.

---

## Launch gates (can't ship without)

1. **Core loop works end-to-end and reliably** — onboard → scheduled check-in fires → data extracted → something visible comes back. **Status: working.** Vapi call → Haiku extraction → visible on Home/Insights/Recap.
2. **Privacy policy + ToS + app-specific compliance.** **Status: not done.** No real privacy policy or ToS content/route exists anywhere — `help.tsx` only references "our privacy policy" as placeholder FAQ text. **Voice-recording consent: not done.** Mic permission is requested (system-level), but there's no explicit recording-consent screen/checkbox, and `calls` has no consent field. **HealthKit usage rules: done** — entitlements, usage strings, and per-source error isolation are all properly wired.
3. **Supabase migration completed.** **Status: doesn't apply as worded** — there is no Supabase anywhere in the codebase; DB is plain Postgres. Confirm with Aaron whether Supabase is still the target (in which case this hasn't started) or whether this gate should be rewritten/dropped.
4. **Baseline stability** — clean empty / no-connectivity / API-error states. **Status: partial.** `EmptyState`/`ErrorBoundary`/`ErrorFallback` exist and are used on the original tabs (Plan, Insights-era screens), but the newer buddy/commitment/meal-plan/copilot screens don't consistently use them. No offline-specific handling found.
5. **Sign-up pricing mechanic** ($20/mo → decline → referral offer: 1 month free for 3 referrals). **Status: implemented.** `paywall.tsx`, `referral-offer.tsx`, `referrals.tsx`, Helcim checkout, `SubscriptionContext`, and all server routes are live. Routing gate in `index.tsx` enforces subscription state. Verify end-to-end payment flow and subscription state transitions before App Store submission.
6. **Resend domain verification.** **Status: partially wired, verification unconfirmed.** Resend sends password-reset email only; Weekly Recap has no delivery channel yet. Domain verification itself is an operational check outside the repo — verify directly with Resend's dashboard.

Open performance question to keep in mind: will referencing 90 days of data make Valo slow? Build test-data infrastructure to measure this.

---

## How to work with me

- I'm terse and directive. **Front-load the verdict.** Give concrete architectural calls, not option lists.
- Don't hedge excessively or over-explain. Prose over bullet lists where reasonable.
- Surface concerns BEFORE saying "approve." **Never list pre-conditions after approval.**
- When I flag something to save for later, capture it.
- Your role is architect holding full context — make concrete decisions.

### When generating prompts for the Replit Agent
- Align on architecture conversationally first, then produce the Replit Agent prompt for me to paste and execute; I review output before approving.
- Plan first; build incrementally with checkpoints.
- Be specific about intent, behavior, edge cases, and acceptance criteria — but NOT prescriptive about implementation. No exact file paths or hex values; those conflict with what the Agent finds in the actual codebase.
- Use positive language (state what to do, not what to avoid). Keep it simple. Reference specific files rather than the whole project.
- Plan mode for foundational/schema/investigative work; Power mode for new backend integrations; Economy mode for standard feature work; Lite mode only for scoped single-surface edits.

---

## Current priorities (snapshot — confirm with me, may have advanced)

- **Accountability module**, reframed as growth infrastructure (viral k-factor + churn-halving), not just a feature. Of the five planned pillars: **1:1 buddies + shared commitments + encouragements/cheering are fully built and persisted** (invite/accept flow, share-scope-enforced views, exception/pause handling, rate-limited cheering). **AI coach is schema-ready only** (`ai_coach` participant role exists, no behavior). **Accountability groups, anonymous groups/buddies, and wagers have no implementation at all.**
- **Ask Valo** (semantic retrieval over the user's own life data) and **Weekly Recap** ("Your Week with Valo") are both **built and live** (`ask-valo.tsx`/`askValo.ts`, `recap/[id].tsx`/`weekly-recap.ts`) — contrary to earlier notes calling these "awaiting QA," they have real implementations. Weekly Recap is missing a notification-delivery channel (no push, no email).
- **The agentic layer** (Valo proposes and executes actions with confirmation) is **backend-only and narrow**: one action type (`reschedule_workout`), generated nightly, validated server-side — but **no frontend confirmation/undo UI exists yet**. Don't describe this as "shipped" until the UI half is built.
- **New since last doc pass, not previously documented:**
  - **AI meal planning** (`meal-planner.tsx` + `meal-plans.ts`): training-aware (factors in training/rest day split from workout data), Claude Sonnet-generated, with macro-tolerance-checked swap endpoints (per-ingredient and full-meal). Fully implemented.
  - **Workout Copilot** (`copilot-start/workout/summary/plan/programs/modules` screens, `workout.ts`/`exercises.ts` routes, ~10 workout-related DB tables): fully implemented training program/session/PR tracking.
- **Non-voice check-in path:** `guided-checkin.tsx` (775 lines) is fully implemented — a typed/tap step-by-step check-in that captures cross-domain data without a voice call, reachable from the center-slot check-in menu. This was the "near-term" item from the prior doc pass; it's done.

---

## Claude Code operational rules

### Build & Debug Protocol
Follow this sequence for every bug fix or feature, without asking for confirmation between steps unless a step says otherwise:

1. **Investigate first.** Read the relevant code and confirm the root cause before touching anything. Report findings before proposing a fix.
2. **Make the code changes.**
3. **Run relevant checks** (`pnpm install`, `npx expo install --check`, typecheck) to confirm nothing broke.
4. **Report** what changed and the check results.
5. **Never run `eas build`** — always stop and let Aaron trigger builds manually, even if everything looks ready.
6. **Never run `git push`** — commit locally only; leave pushing to Aaron.
7. **Schema changes:** stop after investigation and present a plan before writing any migration.

### Permissions
`.claude/settings.json` at the repo root holds the `allow`/`ask`/`deny` permission rules and is the source of truth for what's auto-approved vs gated. Key rules: `pnpm *` and read-only git ops auto-approve; `eas build *`, `git push *`, `rm *`, and the DB push command always prompt; reading `.env` files is denied entirely.

### Device testing
- Metro requires `--tunnel` for physical device testing — Replit's internal IP is not reachable from a phone on a different network.
- `expo start` must be launched with `EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN` set. Without it, `process.env.EXPO_PUBLIC_DOMAIN` is `undefined` in the bundle, `getApiBase()` returns `""`, and all API calls become relative-path fetches that return HTML from the Metro bundler instead of JSON from the API server — causing `JSON.parse` crashes on login and every other API call.
- Full command: `EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN npx expo start --tunnel --port 8082` (8081 is occupied by the mockup-sandbox Vite server in this Replit).

### EAS authentication
Interactive `eas login` fails in Replit's non-interactive shell. Two working approaches:
- Type `! eas login` in the Claude Code prompt — the `!` prefix runs it in the session's interactive TTY.
- Set `EXPO_TOKEN=<token>` (from expo.dev → Account Settings → Access Tokens) and pass it inline: `EXPO_TOKEN=... eas build ...`. Authentication persists after first login so subsequent builds in the same environment don't need it again.

### Build credits
EAS build credits are limited. **Diagnose the root cause before triggering a build.** Never rebuild speculatively to see if something works — always confirm the fix in code first.

---

## IP / legal notes

- Trademark clearance for "Valo" in software/wellness classes is a high-priority risk — conflicting marks exist. USPTO Classes 9 and 42 recommended.
- Core pipeline logic is best protected as trade secrets.

---

## Test account

`aaronlou06@gmail.com` — seeded with multi-week realistic fake data.
