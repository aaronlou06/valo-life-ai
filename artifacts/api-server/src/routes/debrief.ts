import { Router, type IRouter } from "express";
import { db, insightsTable, logEntriesTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.post("/debrief/process", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { transcript } = req.body as {
    transcript: Array<{ role: "assistant" | "user"; text: string }>;
  };

  if (!Array.isArray(transcript)) {
    res.status(400).json({ error: "transcript must be an array" });
    return;
  }

  const today = new Date().toISOString().split("T")[0]!;
  const userLines = transcript.filter((t) => t.role === "user").map((t) => t.text);
  const fullText = transcript.map((t) => `${t.role}: ${t.text}`).join("\n");

  await db.insert(logEntriesTable).values({
    userId,
    date: today,
    type: "debrief",
    title: "Evening debrief",
    subtitle: `${transcript.length} exchanges`,
    value: fullText.slice(0, 500),
  });

  if (userLines.length >= 2) {
    const snippets = userLines.slice(0, 3).join(" … ");
    await db.insert(insightsTable).values({
      userId,
      date: today,
      label: "Debrief reflection",
      content: `From tonight's debrief: "${snippets.slice(0, 280)}"`,
      followUpQuestion: "What would you do differently tomorrow?",
    });
  }

  res.status(200).json({ ok: true });
});

export default router;
