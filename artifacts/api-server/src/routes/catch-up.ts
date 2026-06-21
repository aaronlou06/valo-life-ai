import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, habitsTable, routinesTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { buildCatchup } from "../lib/catchup";
import {
  recordVerificationEvent,
  type VerificationStatus,
  type VerificationProvenance,
} from "../lib/verificationEvents";

const router: IRouter = Router();

router.get("/catch-up", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const result = await buildCatchup(userId);
  res.json(result);
});

// Unified write path for the Verify spine: manual taps, catch-up reconciliation,
// and (later) voice all post here.
router.post("/verification-events", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { habitId, routineId, date, status, provenance } = req.body as {
    habitId?: number;
    routineId?: string;
    date?: string;
    status?: string;
    provenance?: string;
  };

  if (!date) {
    res.status(400).json({ error: "date is required" });
    return;
  }
  const hasHabit = habitId != null;
  const hasRoutine = routineId != null;
  if (hasHabit === hasRoutine) {
    res.status(400).json({ error: "exactly one of habitId or routineId is required" });
    return;
  }
  if (status !== "done" && status !== "missed") {
    res.status(400).json({ error: "status must be 'done' or 'missed'" });
    return;
  }
  if (
    provenance != null &&
    provenance !== "confirmed" &&
    provenance !== "recalled" &&
    provenance !== "assumed"
  ) {
    res.status(400).json({ error: "invalid provenance" });
    return;
  }

  // Ownership guard: the referenced habit/routine must belong to this user
  // before we write a verification event against it.
  if (hasHabit) {
    const owned = await db
      .select({ id: habitsTable.id })
      .from(habitsTable)
      .where(and(eq(habitsTable.id, habitId!), eq(habitsTable.userId, userId)))
      .limit(1);
    if (owned.length === 0) {
      res.status(404).json({ error: "habit not found" });
      return;
    }
  } else {
    const owned = await db
      .select({ id: routinesTable.id })
      .from(routinesTable)
      .where(and(eq(routinesTable.id, routineId!), eq(routinesTable.userId, userId)))
      .limit(1);
    if (owned.length === 0) {
      res.status(404).json({ error: "routine not found" });
      return;
    }
  }

  const row = await recordVerificationEvent({
    userId,
    item: hasHabit ? { habitId: habitId! } : { routineId: routineId! },
    occurrenceDate: date,
    status: status as VerificationStatus,
    provenance: (provenance as VerificationProvenance | undefined) ?? "confirmed",
  });
  res.status(200).json(row);
});

export default router;
