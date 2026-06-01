import { Router, type IRouter } from "express";
import { db, feedbackResponsesTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

// POST /api/feedback — store in-app micro-survey response
router.post("/feedback", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { rating, comment, context, sessionId, appVersion } = req.body as {
    rating?: number;
    comment?: string;
    context?: string;
    sessionId?: string;
    appVersion?: string;
  };

  if (rating != null && (rating < 1 || rating > 5)) {
    res.status(400).json({ error: "rating must be 1–5" });
    return;
  }

  try {
    const [row] = await db
      .insert(feedbackResponsesTable)
      .values({ userId, rating, comment, context, sessionId, appVersion })
      .returning({ id: feedbackResponsesTable.id });

    res.status(201).json({ ok: true, id: row?.id });
  } catch (err: any) {
    req.log.error({ err }, "feedback insert failed");
    res.status(500).json({ error: "Failed to save feedback" });
  }
});

// POST /api/feedback/anonymous — for pre-auth or anonymous feedback
router.post("/feedback/anonymous", async (req, res): Promise<void> => {
  const { rating, comment, context, sessionId } = req.body as {
    rating?: number;
    comment?: string;
    context?: string;
    sessionId?: string;
  };

  try {
    await db.insert(feedbackResponsesTable).values({ rating, comment, context, sessionId });
    res.status(201).json({ ok: true });
  } catch (err: any) {
    req.log.error({ err }, "anonymous feedback insert failed");
    res.status(500).json({ error: "Failed to save feedback" });
  }
});

export default router;
