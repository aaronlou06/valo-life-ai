import { db, userProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound?: "default";
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Sends a push notification to a user via Expo's push API.
 * Looks up the user's stored Expo push token and posts to
 * https://exp.host/--/api/v2/push/send. Resolves silently
 * when the token is missing (user has not granted permission
 * or is not yet registered).
 */
export async function sendPushNotification(
  userId: string,
  title: string,
  body: string
): Promise<void> {
  const rows = await db
    .select({ expoPushToken: userProfilesTable.expoPushToken })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);

  const token = rows[0]?.expoPushToken;
  if (!token) return;

  const message: ExpoPushMessage = { to: token, title, body, sound: "default" };

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(message),
    });

    if (!res.ok) {
      logger.warn({ userId, status: res.status }, "Expo push API returned non-OK status");
      return;
    }

    const json = (await res.json()) as { data?: ExpoPushTicket };
    const ticket = json.data;
    if (ticket?.status === "error") {
      logger.warn({ userId, error: ticket.message, detail: ticket.details }, "Expo push ticket error");
    }
  } catch (err) {
    logger.error({ userId, err }, "Failed to send push notification");
  }
}
