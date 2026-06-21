import { Router, type IRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import {
  listHabitVerificationsForDate,
  toggleHabitVerification,
} from "../lib/verificationEvents";

const router: IRouter = Router();

router.get("/habit-completions/:date", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const date = Array.isArray(req.params.date) ? req.params.date[0]! : req.params.date!;
  // Sourced from the verification spine; returned in the legacy completion shape.
  const rows = await listHabitVerificationsForDate(userId, date);
  res.json(rows);
});

router.post("/habit-completions/toggle", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { habitId, date } = req.body as { habitId?: number; date?: string };
  if (!habitId || !date) {
    res.status(400).json({ error: "habitId and date are required" });
    return;
  }
  // Single shared write path — the spine recomputes the cached streak on write.
  const row = await toggleHabitVerification(userId, habitId, date);
  res.status(200).json(row);
});

export default router;
