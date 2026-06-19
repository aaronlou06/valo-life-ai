import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db, usersTable, userProfilesTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { deleteUserAccount } from "../lib/deleteAccount";
import { exportUserData } from "../lib/exportUserData";

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

export default router;
