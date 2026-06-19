---
name: Account deletion
description: How full account deletion works in the API server and the FK-ordering constraint the schema-reflection approach can't see.
---

# Account deletion (DELETE /auth/account)

`artifacts/api-server/src/lib/deleteAccount.ts` owns the real deletion. The route only does re-auth (bcrypt.compare on current password) then calls `deleteUserAccount(userId)`.

Strategy: external revocations FIRST (Google grant revoke, Vapi per-call DELETE — best-effort, logged), then ONE db.transaction that deletes everything and rolls back on any error (fail-loud, no partial deletes).

Per-user tables are discovered by **live schema reflection** (`is(value, PgTable)` + a column whose `.name === "user_id"`), so any new per-user table is auto-covered. An `EXPLICIT_OR_PRESERVED` set excludes tables handled by hand or kept global.

**Why the explicit set exists (the durable trap):** reflection deletes generic tables in arbitrary export order, which is NOT FK-safe. Any non-cascade FK *between two per-user tables* breaks it.
- Known edges handled explicitly, child-before-parent: the whole workout subtree (set_logs/hr_samples → sessions; template_exercises → templates; program_days → programs; PRs/summaries before custom `exercises` due to exercise_id RESTRICT), and `action_log.proposed_action_id → proposed_actions.id` (default/RESTRICT FK).
- `exercises` with `user_id IS NULL` are shared system rows — only delete user-owned ones (`eq(userId, ...)` naturally skips NULL). `feature_flags` is global (uses `allowed_user_ids` array, no `user_id` col) — preserved.

**How to apply:** when you add a new table with a non-cascade FK to another per-user table, you MUST add both to `EXPLICIT_OR_PRESERVED` and delete them child-before-parent in the transaction — the generic loop will otherwise fail for users with linked rows. Tables with `onDelete: "cascade"`/`"set null"` need no special handling.

Frontend: `AuthContext.deleteAccount(password)` posts the password, and on success wipes the session plus all `@valo/healthkit*` AsyncStorage keys (enumerated via getAllKeys prefix match, so version bumps don't strand keys). profile.tsx `DeleteAccountModal` gates the final button on confirm-step + typed "DELETE" + non-empty password.

**Data export (GET /auth/export):** reuses the same reflection approach (read-only). Same `EXPORT_EXCLUDED` set concept, but credential exclusion matters: `users` is re-selected with only `{ email, createdAt }` (no passwordHash/sessionToken), `google_tokens` excluded entirely. Frontend uses `expo-file-system/legacy` (NOT the default import — v19 moved to `expo-file-system/next` for the new API; the legacy import still exports `documentDirectory`, `writeAsStringAsync`, `EncodingType`). Guard `if (!fsDocumentDirectory)` before write to handle unsupported platforms cleanly.
