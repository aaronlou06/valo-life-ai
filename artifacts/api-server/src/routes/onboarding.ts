import { Router, type IRouter } from "express";
import { eq, and, gt } from "drizzle-orm";
import { db, userProfilesTable, goalsTable, referralCodesTable, referralConversionsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Status ────────────────────────────────────────────────────────────────────

router.get("/onboarding/status", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;

  const rows = await db
    .select({
      onboardingCompleted: userProfilesTable.onboardingCompleted,
      firstCallCompleted: userProfilesTable.firstCallCompleted,
      onboardingProgress: userProfilesTable.onboardingProgress,
    })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);

  const profile = rows[0];
  const progress = profile?.onboardingProgress
    ? (JSON.parse(profile.onboardingProgress) as {
        completed?: boolean;
        lastStep?: string;
        lastQuestion?: number;
        answersSOFar?: Record<string, unknown>;
      })
    : null;

  res.status(200).json({
    onboardingCompleted: profile?.onboardingCompleted ?? false,
    firstCallCompleted: profile?.firstCallCompleted ?? false,
    onboardingProgress: progress,
    lastStep: progress?.lastStep ?? null,
  });
});

// ── Save individual fields (incremental) ──────────────────────────────────────

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
  "topGoal",
  "topGoalProvenance",
  "referralSource",
  "onboardingAnswers",
  "onboardingProgress",
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

  await db
    .insert(userProfilesTable)
    .values({ userId, ...(updateValues as any) })
    .onConflictDoUpdate({
      target: userProfilesTable.userId,
      set: updateValues as any,
    });

  res.status(200).json({ ok: true });
});

// ── Progress save (for resume support) ───────────────────────────────────────

router.patch("/onboarding/progress", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { lastStep, lastQuestion, answersSOFar } = req.body as {
    lastStep?: string;
    lastQuestion?: number;
    answersSOFar?: Record<string, unknown>;
  };

  const progress = JSON.stringify({
    completed: false,
    lastStep: lastStep ?? null,
    lastQuestion: lastQuestion ?? 0,
    answersSOFar: answersSOFar ?? {},
  });

  await db
    .insert(userProfilesTable)
    .values({ userId, onboardingProgress: progress })
    .onConflictDoUpdate({
      target: userProfilesTable.userId,
      set: { onboardingProgress: progress },
    });

  res.status(200).json({ ok: true });
});

// ── Complete onboarding — Claude processing ───────────────────────────────────

const CLAUDE_SYSTEM_PROMPT = `You are processing onboarding answers for a new user of Valo, a personal AI life companion.
Based on these answers, populate the user's memory profile.
Return ONLY valid JSON with no markdown or preamble:
{
  "personal_details": [
    "array of clean factual statements about this person based on their answers",
    "write them as third-person facts e.g. 'Wants to improve his fitness and energy levels'"
  ],
  "things_that_matter": [
    "array of people, goals, and values that clearly matter to this person"
  ],
  "emotional_patterns": [
    "array of observations about what motivates and drives this person based on their answers"
  ],
  "recurring_struggles": [
    "array of struggles or patterns they mentioned — these are starting points, not conclusions"
  ],
  "top_goal": "their primary 90-day goal in one clean sentence",
  "user_motivation": "what drives them in one clean sentence",
  "user_call_time": "preferred check-in time in HH:MM 24h format, or null if not provided"
}`;

interface OnboardingAnswers {
  name?: string;
  area_to_improve?: string;
  ideal_day?: string;
  change_struggling_with?: string;
  important_people?: string;
  motivation?: string;
  success_90_days?: string;
  weighing_on_you?: string;
  call_time?: string;
  remember_this?: string;
  [key: string]: string | undefined;
}

interface ClaudeProfile {
  personal_details: string[];
  things_that_matter: string[];
  emotional_patterns: string[];
  recurring_struggles: string[];
  top_goal: string;
  user_motivation: string;
  user_call_time: string | null;
}

router.post("/onboarding/complete", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { answers, referralCode } = req.body as { answers: OnboardingAnswers; referralCode?: string };

  if (!answers || typeof answers !== "object") {
    res.status(400).json({ error: "answers object is required" });
    return;
  }

  const answerLines = [
    answers.name ? `name: ${answers.name}` : null,
    answers.area_to_improve ? `area_to_improve: ${answers.area_to_improve}` : null,
    answers.ideal_day ? `ideal_day: ${answers.ideal_day}` : null,
    answers.change_struggling_with ? `change_struggling_with: ${answers.change_struggling_with}` : null,
    answers.important_people ? `important_people: ${answers.important_people}` : null,
    answers.motivation ? `motivation: ${answers.motivation}` : null,
    answers.success_90_days ? `success_90_days: ${answers.success_90_days}` : null,
    answers.weighing_on_you ? `weighing_on_you: ${answers.weighing_on_you}` : null,
    answers.call_time ? `call_time: ${answers.call_time}` : null,
    answers.remember_this ? `remember_this: ${answers.remember_this}` : null,
  ].filter((l): l is string => l !== null);

  let profile: ClaudeProfile = {
    personal_details: [],
    things_that_matter: [],
    emotional_patterns: [],
    recurring_struggles: [],
    top_goal: "",
    user_motivation: "",
    user_call_time: answers.call_time ?? null,
  };

  // The new short onboarding may collect no open-text answers at all (name-only
  // or fully chip-based). Only run Claude synthesis when there is something to
  // synthesize; never block completion on an empty answer set.
  if (answerLines.length > 0) {
    try {
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1200,
        system: CLAUDE_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Raw answers:\n${answerLines.join("\n")}`,
          },
        ],
      });

      const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
      const clean = text.replace(/```(?:json)?\n?/g, "").replace(/```\n?/g, "").trim();
      profile = JSON.parse(clean) as ClaudeProfile;
    } catch (err) {
      logger.error({ err, userId }, "POST /onboarding/complete: Claude processing failed");
      // Proceed with raw data — don't block the user
    }
  }

  // ── Persist to DB ─────────────────────────────────────────────────────────
  const updateValues: Record<string, unknown> = {
    onboardingCompleted: true,
    onboardingAnswers: JSON.stringify(answers),
    onboardingProgress: JSON.stringify({ completed: true }),
  };

  if (answers.name) updateValues.name = answers.name;
  if (profile.user_motivation) updateValues.userMotivation = profile.user_motivation;
  if (profile.user_call_time) updateValues.preferredCallTime = profile.user_call_time;
  if (profile.top_goal) updateValues.topGoal = profile.top_goal;

  // Claude's synthesized identity + emotional patterns both go into userIdentity.
  // Do NOT overwrite userWantsMore / userWantsLess here — those hold the user's
  // raw chip selections saved earlier via /onboarding/save and must be preserved.
  const identityParts = [...profile.personal_details, ...profile.emotional_patterns];
  if (identityParts.length > 0) {
    updateValues.userIdentity = identityParts.join("; ");
  }
  if (profile.things_that_matter.length > 0) {
    updateValues.userPriorities = profile.things_that_matter.join("; ");
  }
  if (profile.recurring_struggles.length > 0) {
    updateValues.recurringStruggles = JSON.stringify(profile.recurring_struggles);
  }

  try {
    await db
      .insert(userProfilesTable)
      .values({ userId, ...(updateValues as any) })
      .onConflictDoUpdate({
        target: userProfilesTable.userId,
        set: updateValues as any,
      });

    // Create the top goal as a proper goal record if we have one
    if (profile.top_goal) {
      await db
        .insert(goalsTable)
        .values({
          userId,
          title: profile.top_goal,
          notes: "Set during onboarding",
          targetDate: (() => {
            const d = new Date();
            d.setDate(d.getDate() + 90);
            return d.toISOString().split("T")[0]!;
          })(),
        })
        .catch(() => {});
    }
  } catch (err) {
    req.log.error({ err, userId }, "POST /onboarding/complete: DB write failed");
    res.status(500).json({ error: "Failed to save onboarding profile" });
    return;
  }

  // Redeem referral code if provided.
  if (referralCode && typeof referralCode === "string") {
    try {
      const code = referralCode.trim();
      const now2 = new Date();
      const [rc] = await db
        .select()
        .from(referralCodesTable)
        .where(
          and(
            eq(referralCodesTable.code, code),
            eq(referralCodesTable.expired, false),
            gt(referralCodesTable.expiresAt, now2),
          ),
        )
        .limit(1);

      if (rc && rc.userId !== userId) {
        const [alreadyReferred] = await db
          .select({ id: referralConversionsTable.id })
          .from(referralConversionsTable)
          .where(eq(referralConversionsTable.referredUserId, userId))
          .limit(1);

        if (!alreadyReferred) {
          await db.insert(referralConversionsTable).values({
            referrerUserId: rc.userId,
            referredUserId: userId,
            codeUsed: code,
            signedUpAt: now2,
            firstPaidAt: null,
            freeMonthCredited: false,
          });
        }
      }
    } catch (err) {
      logger.error({ err, userId, referralCode }, "Referral code redeem failed in onboarding/complete");
    }
  }

  res.status(200).json({
    success: true,
    profile: {
      ...profile,
      name: answers.name,
    },
  });
});

export default router;
