import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { randomBytes, randomInt } from "crypto";
import { and, eq, isNull, gt } from "drizzle-orm";
import { db, usersTable, userProfilesTable, passwordResetTokensTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { deleteUserAccount } from "../lib/deleteAccount";
import { exportUserData } from "../lib/exportUserData";
import { sendPasswordResetEmail } from "../lib/resendEmail";
import { rateLimit } from "../lib/rateLimit";

const router: IRouter = Router();

const SESSION_DAYS = 90;

function newToken(): string {
  return randomBytes(32).toString("hex");
}

function expiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + SESSION_DAYS);
  return d;
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }
  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, String(email).toLowerCase()))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(String(password), 12);
  const token = newToken();
  const expires = expiresAt();

  const [user] = await db
    .insert(usersTable)
    .values({ email: String(email).toLowerCase(), passwordHash, sessionToken: token, sessionExpiresAt: expires })
    .returning();

  res.status(201).json({
    token,
    userId: String(user.id),
    email: user.email,
    name: null,
    expiresAt: expires.toISOString(),
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, String(email).toLowerCase()))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(String(password), user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = newToken();
  const expires = expiresAt();

  await db
    .update(usersTable)
    .set({ sessionToken: token, sessionExpiresAt: expires })
    .where(eq(usersTable.id, user.id));

  const [profile] = await db
    .select({ name: userProfilesTable.name })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, String(user.id)))
    .limit(1);

  res.json({
    token,
    userId: String(user.id),
    email: user.email,
    name: profile?.name ?? null,
    expiresAt: expires.toISOString(),
  });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    await db
      .update(usersTable)
      .set({ sessionToken: null, sessionExpiresAt: null })
      .where(eq(usersTable.sessionToken, token));
  }
  res.sendStatus(200);
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);

  const [user] = await db
    .select({ id: usersTable.id, email: usersTable.email, sessionExpiresAt: usersTable.sessionExpiresAt })
    .from(usersTable)
    .where(eq(usersTable.sessionToken, token))
    .limit(1);

  if (!user || (user.sessionExpiresAt && user.sessionExpiresAt < new Date())) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [profile] = await db
    .select({ name: userProfilesTable.name })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, String(user.id)))
    .limit(1);

  res.json({ userId: String(user.id), email: user.email, name: profile?.name ?? null });
});

router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { currentPassword, newPassword } = req.body ?? {};

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "currentPassword and newPassword are required" });
    return;
  }
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, Number(userId)))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const valid = await bcrypt.compare(String(currentPassword), user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const passwordHash = await bcrypt.hash(String(newPassword), 12);
  await db
    .update(usersTable)
    .set({ passwordHash })
    .where(eq(usersTable.id, Number(userId)));

  res.json({ ok: true });
});

router.delete("/auth/account", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { password } = req.body ?? {};

  // Re-authentication: require and verify the current password before touching
  // anything. On mismatch, reject and delete nothing.
  if (!password || typeof password !== "string") {
    res.status(400).json({ error: "Password is required to delete your account" });
    return;
  }

  const [user] = await db
    .select({ passwordHash: usersTable.passwordHash })
    .from(usersTable)
    .where(eq(usersTable.id, Number(userId)))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Password is incorrect" });
    return;
  }

  try {
    await deleteUserAccount(userId);
  } catch (err) {
    req.log?.error({ err, userId }, "Account deletion failed — rolled back");
    res.status(500).json({ error: "Account deletion failed. No account data was removed; please try again." });
    return;
  }

  res.json({ ok: true });
});

// GET /api/auth/export — full user data export (no credentials)
router.get("/auth/export", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const today = new Date().toISOString().split("T")[0];

  try {
    const doc = await exportUserData(userId);
    res.setHeader("Content-Disposition", `attachment; filename="valo-export-${today}.json"`);
    res.setHeader("Content-Type", "application/json");
    res.json(doc);
  } catch (err) {
    req.log?.error({ err, userId }, "Export failed");
    res.status(500).json({ error: "Export failed. Please try again." });
  }
});

const RESET_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MIN_PASSWORD_LENGTH = 8;

function generateResetCode(): string {
  // 6-digit numeric code, zero-padded (000000–999999).
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function clientIp(req: { ip?: string; headers: Record<string, unknown> }): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  return req.ip ?? "unknown";
}

// POST /api/auth/forgot-password — anti-enumeration: always 200 with a neutral
// body whether or not the email maps to an account.
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body ?? {};
  const neutral = { ok: true } as const;

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "email is required" });
    return;
  }
  const normalizedEmail = email.toLowerCase().trim();

  // Rate-limit by email and by IP independently (5 requests / 15 min each) so
  // the endpoint can't be used to spam inboxes or probe for accounts.
  const ip = clientIp(req);
  const byEmail = rateLimit(`forgot:email:${normalizedEmail}`, 5, RESET_CODE_TTL_MS);
  const byIp = rateLimit(`forgot:ip:${ip}`, 5, RESET_CODE_TTL_MS);
  if (!byEmail.allowed || !byIp.allowed) {
    const retryAfter = Math.max(byEmail.retryAfterSeconds, byIp.retryAfterSeconds);
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({ error: "Too many requests. Please try again later." });
    return;
  }

  // Always generate and hash a code so request timing is similar regardless of
  // whether the account exists (reduces enumeration via timing).
  const code = generateResetCode();
  const codeHash = await bcrypt.hash(code, 12);

  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail))
    .limit(1);

  if (user) {
    const userId = String(user.id);
    // Invalidate any prior unused codes for this user (single outstanding code).
    await db
      .update(passwordResetTokensTable)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokensTable.userId, userId), isNull(passwordResetTokensTable.usedAt)));

    await db.insert(passwordResetTokensTable).values({
      userId,
      codeHash,
      expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
    });

    try {
      await sendPasswordResetEmail(normalizedEmail, code);
    } catch (err) {
      // Never leak existence/delivery failures to the caller; just log.
      req.log?.error({ err }, "Failed to send password-reset email");
    }
  }

  res.json(neutral);
});

// POST /api/auth/reset-password — verify code, set new password, invalidate
// the code and all existing sessions.
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { email, code, newPassword } = req.body ?? {};

  if (!email || !code || !newPassword) {
    res.status(400).json({ error: "email, code, and newPassword are required" });
    return;
  }
  if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    return;
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const codeStr = String(code).trim();
  const invalidCode = { error: "Invalid or expired code" } as const;

  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail))
    .limit(1);

  if (!user) {
    res.status(400).json(invalidCode);
    return;
  }
  const userId = String(user.id);

  // Candidate = most recent unused, unexpired code for this user.
  const [token] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(
      and(
        eq(passwordResetTokensTable.userId, userId),
        isNull(passwordResetTokensTable.usedAt),
        gt(passwordResetTokensTable.expiresAt, new Date()),
      ),
    )
    .orderBy(passwordResetTokensTable.createdAt)
    .limit(1);

  if (!token) {
    res.status(400).json(invalidCode);
    return;
  }

  const valid = await bcrypt.compare(codeStr, token.codeHash);
  if (!valid) {
    res.status(400).json(invalidCode);
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  // Update password + invalidate every active session, and consume the code.
  await db
    .update(usersTable)
    .set({ passwordHash, sessionToken: null, sessionExpiresAt: null })
    .where(eq(usersTable.id, user.id));

  await db
    .update(passwordResetTokensTable)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokensTable.id, token.id));

  res.json({ ok: true });
});

export default router;
