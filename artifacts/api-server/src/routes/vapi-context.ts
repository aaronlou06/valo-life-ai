import { Router, type IRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { buildVapiContext } from "../lib/buildVapiContext";

const router: IRouter = Router();

async function handleVapiContext(req: any, res: any): Promise<void> {
  const authUserId = (req as AuthenticatedRequest).userId;
  const rawUserId = Array.isArray(req.params.userId)
    ? req.params.userId[0]
    : req.params.userId;

  if (authUserId !== rawUserId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const context = await buildVapiContext(authUserId);
    res.json(context);
  } catch (err: any) {
    req.log.error({ err }, "buildVapiContext failed");
    res.status(500).json({ error: "Failed to assemble context" });
  }
}

router.get("/vapi/context/:userId", requireAuth, handleVapiContext);
router.post("/vapi/context/:userId", requireAuth, handleVapiContext);

export default router;
