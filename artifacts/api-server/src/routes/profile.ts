import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  dailyLogsTable,
  debriefExtractionsTable,
  userProfilesTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { getDateInTimezone, computeStreaks } from "./dashboard";

const router: IRouter = Router();

router.get("/profile/streak", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;

  const [profile, logDates, debriefDates] = await Promise.all([
    db
      .select({ callTimezone: userProfilesTable.callTimezone })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, userId))
      .limit(1),
    db
      .select({ date: dailyLogsTable.date })
      .from(dailyLogsTable)
      .where(eq(dailyLogsTable.userId, userId)),
    db
      .select({ date: debriefExtractionsTable.date })
      .from(debriefExtractionsTable)
      .where(eq(debriefExtractionsTable.userId, userId)),
  ]);

  const tz = profile[0]?.callTimezone ?? "America/New_York";
  const today = getDateInTimezone(tz);

  const allDates = new Set<string>([
    ...logDates.map((r) => r.date),
    ...debriefDates.map((r) => r.date),
  ]);

  const { current: currentStreak, longest: longestStreak, lastActive: lastActiveDate } =
    computeStreaks(allDates, today);

  res.json({ currentStreak, longestStreak, lastActiveDate });
});

export default router;
