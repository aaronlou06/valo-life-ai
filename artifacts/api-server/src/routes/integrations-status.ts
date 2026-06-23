import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, wearableTokensTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

// GET /api/integrations/status
// Returns which wearable integrations are connected for the authenticated user.
router.get("/integrations/status", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;

  const rows = await db
    .select({ source: wearableTokensTable.source })
    .from(wearableTokensTable)
    .where(
      and(
        eq(wearableTokensTable.userId, userId),
        inArray(wearableTokensTable.source, ["oura", "whoop", "garmin"]),
      ),
    );

  const connected = new Set(rows.map((r) => r.source));
  res.json({
    oura: connected.has("oura"),
    whoop: connected.has("whoop"),
    garmin: connected.has("garmin"),
  });
});

export default router;
