import { Router, type IRouter } from "express";
import { answerUserQuestion, type AskTurn } from "../lib/askValo";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.post("/ask", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { question, priorTurns } = req.body as {
    question?: unknown;
    priorTurns?: unknown;
  };

  if (typeof question !== "string" || question.trim() === "") {
    res.status(400).json({ error: "question must be a non-empty string" });
    return;
  }

  const MAX_QUESTION_LEN = 2000;
  if (question.length > MAX_QUESTION_LEN) {
    res
      .status(400)
      .json({ error: `question must be at most ${MAX_QUESTION_LEN} characters` });
    return;
  }

  // Bound each prior turn field so a crafted history can't inflate the prompt.
  const MAX_TURN_LEN = 4000;
  const clamp = (s: string): string =>
    s.length > MAX_TURN_LEN ? s.slice(0, MAX_TURN_LEN) : s;

  const turns: AskTurn[] = Array.isArray(priorTurns)
    ? priorTurns
        .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
        .map((t) => ({
          question: typeof t.question === "string" ? clamp(t.question) : "",
          answer: typeof t.answer === "string" ? clamp(t.answer) : "",
        }))
        .filter((t) => t.question !== "" && t.answer !== "")
    : [];

  try {
    const result = await answerUserQuestion(userId, question.trim(), turns);
    res.status(200).json(result);
  } catch (err) {
    req.log.error({ err }, "answerUserQuestion failed");
    res.status(500).json({ error: "Ask Valo failed" });
  }
});

export default router;
