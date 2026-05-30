import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, calendarEventsTable, googleTokensTable } from "@workspace/db";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { getValidAccessToken, syncCalendarEvents } from "./google-oauth";

const router: IRouter = Router();

router.get(
  "/google-calendar/status",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    const [row] = await db
      .select({ id: googleTokensTable.id })
      .from(googleTokensTable)
      .where(eq(googleTokensTable.userId, userId));
    res.json({ connected: row != null });
  },
);

router.post(
  "/google-calendar/sync",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;

    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      res.status(401).json({ error: "Google Calendar not connected" });
      return;
    }

    try {
      await syncCalendarEvents(userId, accessToken);
      const events = await db
        .select({ id: calendarEventsTable.id })
        .from(calendarEventsTable)
        .where(
          and(
            eq(calendarEventsTable.userId, userId),
            eq(calendarEventsTable.type, "google"),
          ),
        );
      req.log.info({ userId, count: events.length }, "Google Calendar synced");
      res.json({ count: events.length });
    } catch (err) {
      req.log.error({ err }, "Google Calendar sync failed");
      res.status(502).json({ error: "Sync failed" });
    }
  },
);

router.delete(
  "/google-calendar/disconnect",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;

    await db
      .delete(googleTokensTable)
      .where(eq(googleTokensTable.userId, userId));

    await db
      .delete(calendarEventsTable)
      .where(
        and(
          eq(calendarEventsTable.userId, userId),
          eq(calendarEventsTable.type, "google"),
        ),
      );

    req.log.info({ userId }, "Google Calendar disconnected");
    res.json({ ok: true });
  },
);

export default router;
