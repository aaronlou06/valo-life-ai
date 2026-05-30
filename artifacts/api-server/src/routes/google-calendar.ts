import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, calendarEventsTable, googleTokensTable, googleCalendarSelectionsTable } from "@workspace/db";
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

router.get(
  "/google-calendar/calendars",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;

    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      res.status(401).json({ error: "Google Calendar not connected" });
      return;
    }

    const gcalRes = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!gcalRes.ok) {
      res.status(502).json({ error: "Failed to fetch calendar list from Google" });
      return;
    }

    const gcalData = (await gcalRes.json()) as { items?: Record<string, unknown>[] };
    const items = gcalData.items ?? [];

    const stored = await db
      .select()
      .from(googleCalendarSelectionsTable)
      .where(eq(googleCalendarSelectionsTable.userId, userId));

    const selectionMap = new Map(stored.map((s) => [s.calendarId, s.isSelected]));

    const calendars = items.map((item) => ({
      calendarId: (item.id as string) ?? "",
      calendarName: (item.summary as string) ?? "Unnamed Calendar",
      calendarColor: (item.backgroundColor as string) ?? null,
      isSelected: selectionMap.has(item.id as string)
        ? selectionMap.get(item.id as string)!
        : (item.primary as boolean | undefined) === true,
    }));

    res.json({ calendars });
  },
);

router.post(
  "/google-calendar/calendars/selections",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    const { selections } = req.body as {
      selections: Array<{
        calendarId: string;
        calendarName: string;
        calendarColor: string | null;
        isSelected: boolean;
      }>;
    };

    if (!Array.isArray(selections)) {
      res.status(400).json({ error: "selections must be an array" });
      return;
    }

    await db
      .delete(googleCalendarSelectionsTable)
      .where(eq(googleCalendarSelectionsTable.userId, userId));

    if (selections.length > 0) {
      await db.insert(googleCalendarSelectionsTable).values(
        selections.map((s) => ({
          userId,
          calendarId: s.calendarId,
          calendarName: s.calendarName,
          calendarColor: s.calendarColor,
          isSelected: s.isSelected,
        })),
      );
    }

    res.json({ ok: true });
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

    await db
      .delete(googleCalendarSelectionsTable)
      .where(eq(googleCalendarSelectionsTable.userId, userId));

    req.log.info({ userId }, "Google Calendar disconnected");
    res.json({ ok: true });
  },
);

export default router;
