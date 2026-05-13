import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  dailyLogsTable,
  debriefExtractionsTable,
  transcriptsTable,
  insightsTable,
} from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

const EXTRACTION_SYSTEM_PROMPT = `You are a data extraction assistant. You will receive a transcript of an evening debrief conversation between a user and their AI companion Valo. Extract the following structured data from the conversation and return it as a JSON object with exactly these fields:
mood_score: number 1-10 (overall mood of the day as expressed by the user)
primary_emotion: string (one word — the dominant emotion expressed)
energy_level: string (low/moderate/high)
work_quality: string (rough/moderate/productive/great)
work_stress: string (low/moderate/high)
meaningful_connection: boolean (did they have a meaningful conversation with someone)
relationship_quality: string (strained/neutral/good/great — based on what they said)
sense_of_purpose: number 1-10
motivation_level: number 1-10
morning_routine_done: boolean or null if not mentioned
workout_felt: string (terrible/hard/okay/good/great) or null if not mentioned
nutrition_quality: string (poor/moderate/clean) or null if not mentioned
one_win: string (the main positive thing from their day, 1 sentence)
one_struggle: string (the main difficulty, 1 sentence)
tomorrow_intention: string (what they want to focus on tomorrow if mentioned)
valo_observation: string (Valo's closing observation from the transcript)
flags: array of strings (any significant things worth tracking — e.g. 'relationship conflict', 'sleep concern', 'high stress 3rd consecutive day')
Return only valid JSON. No explanation.`;

interface DebriefTranscriptEntry {
  role: "assistant" | "user";
  text: string;
}

async function extractWithClaude(transcriptText: string): Promise<Record<string, unknown>> {
  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 8192,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Transcript:\n${transcriptText}` }],
  });

  const block = message.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Unexpected Claude response type");
  }

  const jsonText = block.text.trim();
  return JSON.parse(jsonText);
}

router.post("/debrief/process", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { transcript } = req.body as { transcript: DebriefTranscriptEntry[] };

  if (!Array.isArray(transcript)) {
    res.status(400).json({ error: "transcript must be an array" });
    return;
  }

  const today = new Date().toISOString().split("T")[0]!;
  const fullText = transcript
    .map((t) => `${t.role === "assistant" ? "Valo" : "User"}: ${t.text}`)
    .join("\n");

  if (transcript.length === 0) {
    res.status(200).json({ ok: true, extraction: null });
    return;
  }

  let extraction: Record<string, unknown> = {};

  try {
    extraction = await extractWithClaude(fullText);
  } catch (err) {
    req.log.error({ err }, "Claude extraction failed");
    // Still save transcript; don't fail the whole request
  }

  const flags = Array.isArray(extraction.flags)
    ? JSON.stringify(extraction.flags)
    : null;

  await Promise.all([
    // 1. Save full transcript
    db.insert(transcriptsTable).values({
      userId,
      date: today,
      fullText,
    }),

    // 2. Save extraction
    extraction.mood_score != null
      ? db.insert(debriefExtractionsTable).values({
          userId,
          date: today,
          moodScore: typeof extraction.mood_score === "number" ? extraction.mood_score : null,
          primaryEmotion: typeof extraction.primary_emotion === "string" ? extraction.primary_emotion : null,
          energyLevel: typeof extraction.energy_level === "string" ? extraction.energy_level : null,
          workQuality: typeof extraction.work_quality === "string" ? extraction.work_quality : null,
          workStress: typeof extraction.work_stress === "string" ? extraction.work_stress : null,
          meaningfulConnection: typeof extraction.meaningful_connection === "boolean" ? extraction.meaningful_connection : null,
          relationshipQuality: typeof extraction.relationship_quality === "string" ? extraction.relationship_quality : null,
          senseOfPurpose: typeof extraction.sense_of_purpose === "number" ? extraction.sense_of_purpose : null,
          motivationLevel: typeof extraction.motivation_level === "number" ? extraction.motivation_level : null,
          morningRoutineDone: typeof extraction.morning_routine_done === "boolean" ? extraction.morning_routine_done : null,
          workoutFelt: typeof extraction.workout_felt === "string" ? extraction.workout_felt : null,
          nutritionQuality: typeof extraction.nutrition_quality === "string" ? extraction.nutrition_quality : null,
          oneWin: typeof extraction.one_win === "string" ? extraction.one_win : null,
          oneStruggle: typeof extraction.one_struggle === "string" ? extraction.one_struggle : null,
          tomorrowIntention: typeof extraction.tomorrow_intention === "string" ? extraction.tomorrow_intention : null,
          valoObservation: typeof extraction.valo_observation === "string" ? extraction.valo_observation : null,
          flags,
        })
      : Promise.resolve(),

    // 3. Update daily_log with mood + energy
    extraction.mood_score != null
      ? db
          .update(dailyLogsTable)
          .set({
            moodScore: typeof extraction.mood_score === "number" ? extraction.mood_score : undefined,
            primaryEmotion: typeof extraction.primary_emotion === "string" ? extraction.primary_emotion : undefined,
            energyLevel: typeof extraction.energy_level === "string" ? extraction.energy_level : undefined,
            meaningfulConnection: typeof extraction.meaningful_connection === "boolean" ? extraction.meaningful_connection : undefined,
          })
          .where(
            and(eq(dailyLogsTable.userId, userId), eq(dailyLogsTable.date, today))
          )
      : Promise.resolve(),

    // 4. Seed an insight from Valo's observation
    typeof extraction.valo_observation === "string"
      ? db.insert(insightsTable).values({
          userId,
          date: today,
          label: "Debrief insight",
          content: extraction.valo_observation as string,
          followUpQuestion: typeof extraction.tomorrow_intention === "string"
            ? `Tomorrow you wanted to: ${extraction.tomorrow_intention}`
            : "What will you focus on tomorrow?",
        })
      : Promise.resolve(),
  ]);

  res.status(200).json({ ok: true, extraction });
});

export default router;
