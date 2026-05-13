import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import type { Request, Response, NextFunction } from "express";

export interface AuthenticatedRequest extends Request {
  userId: string;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);

  const [user] = await db
    .select({ id: usersTable.id, sessionExpiresAt: usersTable.sessionExpiresAt })
    .from(usersTable)
    .where(eq(usersTable.sessionToken, token))
    .limit(1);

  if (!user || (user.sessionExpiresAt && user.sessionExpiresAt < new Date())) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  (req as AuthenticatedRequest).userId = String(user.id);
  next();
}
