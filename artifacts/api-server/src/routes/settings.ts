import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, userProfilesTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/settings", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;

  const rows = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);

  const profile = rows[0] ?? null;

  res.status(200).json({
    phoneNumber: profile?.phoneNumber ?? null,
    preferredCallTime: profile?.preferredCallTime ?? null,
    callTimezone: profile?.callTimezone ?? null,
    callsEnabled: profile?.callsEnabled ?? false,
    name: profile?.name ?? null,
    lifePriorities: profile?.lifePriorities ?? null,
    onboardingCompleted: profile?.onboardingCompleted ?? false,
    firstCallCompleted: profile?.firstCallCompleted ?? false,
    expoPushToken: profile?.expoPushToken ?? null,
    checkinReminderEnabled: profile?.checkinReminderEnabled ?? false,
  });
});

router.patch("/settings", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const {
    phoneNumber,
    preferredCallTime,
    callTimezone,
    callsEnabled,
    name,
    lifePriorities,
    expoPushToken,
    checkinReminderEnabled,
  } = req.body as {
    phoneNumber?: string | null;
    preferredCallTime?: string | null;
    callTimezone?: string | null;
    callsEnabled?: boolean;
    name?: string | null;
    lifePriorities?: string | null;
    expoPushToken?: string | null;
    checkinReminderEnabled?: boolean;
  };

  const updateValues: Partial<{
    phoneNumber: string | null;
    preferredCallTime: string | null;
    callTimezone: string | null;
    callsEnabled: boolean;
    name: string | null;
    lifePriorities: string | null;
    expoPushToken: string | null;
    checkinReminderEnabled: boolean;
  }> = {};

  if (phoneNumber !== undefined) updateValues.phoneNumber = phoneNumber;
  if (preferredCallTime !== undefined) updateValues.preferredCallTime = preferredCallTime;
  if (callTimezone !== undefined) updateValues.callTimezone = callTimezone;
  if (callsEnabled !== undefined) updateValues.callsEnabled = callsEnabled;
  if (name !== undefined) updateValues.name = name;
  if (lifePriorities !== undefined) updateValues.lifePriorities = lifePriorities;
  if (expoPushToken !== undefined) updateValues.expoPushToken = expoPushToken;
  if (checkinReminderEnabled !== undefined) updateValues.checkinReminderEnabled = checkinReminderEnabled;

  const existing = await db
    .select({ id: userProfilesTable.id })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(userProfilesTable)
      .set(updateValues)
      .where(eq(userProfilesTable.userId, userId));
  } else {
    await db.insert(userProfilesTable).values({ userId, ...updateValues });
  }

  res.status(200).json({ ok: true });
});

export default router;
