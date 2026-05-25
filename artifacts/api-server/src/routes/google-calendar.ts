import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, calendarEventsTable } from "@workspace/db";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";

const router: IRouter = Router();

router.post(
  "/google-calendar/sync",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthenticatedRequest).userId;
    const { accessToken } = req.body as { accessToken?: unknown };

    if (!accessToken || typeof accessToken !== "string") {
      res.status(400).json({ error: "accessToken is required" });
      return;
    }

    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 30);

    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });

    const gcalRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!gcalRes.ok) {
      const status = gcalRes.status === 401 ? 401 : 502;
      res.status(status).json({ error: "Google Calendar API error" });
      return;
    }

    const gcalData = (await gcalRes.json()) as {
      items?: Record<string, unknown>[];
    };
    const items = gcalData.items ?? [];

    await db
      .delete(calendarEventsTable)
      .where(
        and(
          eq(calendarEventsTable.userId, userId),
          eq(calendarEventsTable.type, "google"),
        ),
      );

    if (items.length === 0) {
      res.json({ count: 0 });
      return;
    }

    const rows = items.map((item) => {
      const startRaw =
        (item.start as Record<string, string> | undefined)?.dateTime ??
        (item.start as Record<string, string> | undefined)?.date ??
        null;
      const endRaw =
        (item.end as Record<string, string> | undefined)?.dateTime ??
        (item.end as Record<string, string> | undefined)?.date ??
        null;
      const date = startRaw
        ? startRaw.substring(0, 10)
        : now.toISOString().substring(0, 10);
      return {
        userId,
        title: (item.summary as string | undefined) ?? "Untitled",
        date,
        startTime: startRaw ? new Date(startRaw) : null,
        endTime: endRaw ? new Date(endRaw) : null,
        type: "google" as const,
        notes: (item.description as string | undefined) ?? null,
        location: (item.location as string | undefined) ?? null,
      };
    });

    await db.insert(calendarEventsTable).values(rows);

    req.log.info({ userId, count: rows.length }, "Google Calendar synced");
    res.json({ count: rows.length });
  },
);

export default router;
