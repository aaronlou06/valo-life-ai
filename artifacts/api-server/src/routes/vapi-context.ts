import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, goalsTable, userProfilesTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { buildVapiContext } from "../lib/buildVapiContext";

const router: IRouter = Router();

function formatCallTime(hhmm: string | null | undefined): string {
  if (!hhmm) return "not set";
  const [h, m] = hhmm.split(":").map(Number);
  const period = (h ?? 0) >= 12 ? "PM" : "AM";
  const hour = (h ?? 0) % 12 || 12;
  return `${hour}:${String(m ?? 0).padStart(2, "0")} ${period}`;
}

function resolveUserId(req: any): string | null {
  const authUserId = (req as AuthenticatedRequest).userId;
  const rawUserId = Array.isArray(req.params.userId)
    ? req.params.userId[0]
    : req.params.userId;
  if (authUserId !== rawUserId) return null;
  return authUserId;
}

async function handleVapiContext(req: any, res: any): Promise<void> {
  const userId = resolveUserId(req);
  if (!userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const context = await buildVapiContext(userId);
    res.json(context);
  } catch (err: any) {
    req.log.error({ err }, "buildVapiContext failed");
    res.status(500).json({ error: "Failed to assemble context" });
  }
}

async function handleFirstCallContext(req: any, res: any): Promise<void> {
  const userId = resolveUserId(req);
  if (!userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const [profileRows, goals] = await Promise.all([
      db
        .select()
        .from(userProfilesTable)
        .where(eq(userProfilesTable.userId, userId))
        .limit(1),
      db
        .select({ title: goalsTable.title })
        .from(goalsTable)
        .where(eq(goalsTable.userId, userId))
        .limit(1),
    ]);

    const profile = profileRows[0];
    const firstName = (profile?.name ?? "").split(" ")[0] || "friend";

    res.json({
      user_name: firstName,
      user_identity: profile?.userIdentity ?? null,
      user_priorities: profile?.userPriorities ?? null,
      user_wants_more: profile?.userWantsMore ?? null,
      user_wants_less: profile?.userWantsLess ?? null,
      user_motivation: profile?.userMotivation ?? null,
      user_first_goal: goals[0]?.title ?? "not set yet",
      user_call_time: formatCallTime(profile?.preferredCallTime),
    });
  } catch (err: any) {
    req.log.error({ err }, "first-call-context failed");
    res.status(500).json({ error: "Failed to assemble first call context" });
  }
}

router.get("/vapi/context/:userId", requireAuth, handleVapiContext);
router.post("/vapi/context/:userId", requireAuth, handleVapiContext);
router.get("/vapi/first-call-context/:userId", requireAuth, handleFirstCallContext);

export default router;
