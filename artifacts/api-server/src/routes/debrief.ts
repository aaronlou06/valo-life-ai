import { Router, type IRouter } from "express";
import { processDebriefTranscript, type TranscriptEntry } from "../lib/processDebrief";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.post("/debrief/process", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { transcript } = req.body as { transcript: TranscriptEntry[] };

  if (!Array.isArray(transcript)) {
    res.status(400).json({ error: "transcript must be an array" });
    return;
  }

  try {
    const extraction = await processDebriefTranscript(userId, transcript);
    res.status(200).json({ ok: true, extraction });
  } catch (err) {
    req.log.error({ err }, "processDebriefTranscript failed");
    res.status(500).json({ error: "Debrief processing failed" });
  }
});

export default router;
