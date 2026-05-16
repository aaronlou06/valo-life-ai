import { eq, and, gte } from "drizzle-orm";
import { db, userProfilesTable, callsTable } from "@workspace/db";
import { buildVapiContext } from "./buildVapiContext";
import { logger } from "./logger";

function getCurrentTimeInTz(timezone: string): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

async function hasRecentCall(userId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000);
  const rows = await db
    .select({ id: callsTable.id })
    .from(callsTable)
    .where(
      and(
        eq(callsTable.userId, userId),
        gte(callsTable.initiatedAt, cutoff)
      )
    )
    .limit(1);
  return rows.length > 0;
}

async function initiateCall(
  userId: string,
  phoneNumber: string,
  firstCallCompleted: boolean
): Promise<void> {
  const vapiApiKey = process.env["VAPI_API_KEY"];
  const phoneNumberId = process.env["VAPI_PHONE_NUMBER_ID"];
  const regularAssistantId =
    process.env["VAPI_ASSISTANT_ID"] ?? "1f6a73ec-abef-4181-ac53-31b6a037a613";
  const firstCallAssistantId = process.env["VAPI_FIRST_CALL_ASSISTANT_ID"];

  if (!vapiApiKey || !phoneNumberId) {
    logger.warn("VAPI_API_KEY or VAPI_PHONE_NUMBER_ID not set — skipping outbound call");
    return;
  }

  const assistantId =
    !firstCallCompleted && firstCallAssistantId
      ? firstCallAssistantId
      : regularAssistantId;

  const context = await buildVapiContext(userId);

  const vapiBody = {
    assistantId,
    customer: { number: phoneNumber },
    phoneNumberId,
    assistantOverrides: { variableValues: context },
  };

  const res = await fetch("https://api.vapi.ai/call/phone", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${vapiApiKey}`,
    },
    body: JSON.stringify(vapiBody),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vapi API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { id?: string };

  await db.insert(callsTable).values({
    userId,
    vapiCallId: data.id ?? null,
    status: "initiated",
  });

  logger.info(
    { userId, vapiCallId: data.id, firstCallCompleted, assistantId },
    "Outbound call initiated"
  );
}

async function runSchedulerTick(): Promise<void> {
  const vapiApiKey = process.env["VAPI_API_KEY"];
  if (!vapiApiKey) return;

  try {
    const users = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.callsEnabled, true));

    for (const user of users) {
      if (!user.phoneNumber || !user.preferredCallTime || !user.callTimezone) continue;

      let tzTime: string;
      try {
        tzTime = getCurrentTimeInTz(user.callTimezone);
      } catch {
        logger.warn({ userId: user.userId, timezone: user.callTimezone }, "Invalid timezone in scheduler");
        continue;
      }

      if (tzTime !== user.preferredCallTime) continue;

      const recent = await hasRecentCall(user.userId);
      if (recent) continue;

      try {
        await initiateCall(user.userId, user.phoneNumber, user.firstCallCompleted);
      } catch (err) {
        logger.error({ err, userId: user.userId }, "Failed to initiate outbound call");
        await db
          .insert(callsTable)
          .values({ userId: user.userId, status: "failed" })
          .catch(() => {});
      }
    }
  } catch (err) {
    logger.error({ err }, "Scheduler tick error");
  }
}

export function startOutboundCallScheduler(): void {
  const vapiApiKey = process.env["VAPI_API_KEY"];
  if (!vapiApiKey) {
    logger.warn("VAPI_API_KEY not set — outbound call scheduler disabled");
    return;
  }
  logger.info("Outbound call scheduler started (60s interval)");
  setInterval(() => {
    void runSchedulerTick();
  }, 60_000);
}
