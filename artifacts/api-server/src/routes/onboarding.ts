import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, userProfilesTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/onboarding/status", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;

  const rows = await db
    .select({
      onboardingCompleted: userProfilesTable.onboardingCompleted,
      firstCallCompleted: userProfilesTable.firstCallCompleted,
    })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);

  const profile = rows[0];
  res.status(200).json({
    onboardingCompleted: profile?.onboardingCompleted ?? false,
    firstCallCompleted: profile?.firstCallCompleted ?? false,
  });
});

const ALLOWED_FIELDS = [
  "name",
  "onboardingCompleted",
  "firstCallCompleted",
  "lifePriorities",
  "userIdentity",
  "userPriorities",
  "userWantsMore",
  "userWantsLess",
  "userMotivation",
  "biologicalSex",
  "age",
  "wearableDevice",
  "workoutDaysPerWeek",
  "dietType",
  "wakeTime",
  "bedTime",
  "workSchedule",
  "phoneNumber",
  "preferredCallTime",
  "callTimezone",
  "callsEnabled",
  "birthday",
  "preferredLanguage",
  "microphonePermission",
] as const;

router.patch("/onboarding/save", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const body = req.body as Record<string, unknown>;

  const updateValues: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (body[field] !== undefined) {
      updateValues[field] = body[field];
    }
  }

  if (Object.keys(updateValues).length === 0) {
    res.status(200).json({ ok: true });
    return;
  }

  const existing = await db
    .select({ id: userProfilesTable.id })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(userProfilesTable)
      .set(updateValues as Parameters<typeof db.update>[0] extends infer T ? any : never)
      .where(eq(userProfilesTable.userId, userId));
  } else {
    await db.insert(userProfilesTable).values({ userId, ...(updateValues as any) });
  }

  res.status(200).json({ ok: true });
});

export default router;
