import { and, eq } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  db,
  dailyLogsTable,
  debriefExtractionsTable,
  transcriptsTable,
  insightsTable,
  voiceDebriefsTable,
} from "@workspace/db";
import { logger } from "./logger";

export type TranscriptEntry = {
  role: "assistant" | "user";
  text: string;
};

const EXTRACTION_SYSTEM_PROMPT = `You are a data extraction assistant. You will receive a transcript of an evening debrief conversation between a user and their AI companion Valo. Extract the following structured data from the conversation and return it as a JSON object with exactly these fields:
mood_score: integer 1-10 (overall mood of the day as expressed by the user) or null
energy: integer 1-10 (energy level expressed by the user) or null
wins: array of strings — positive things the user mentioned (max 3, each ≤ 1 sentence)
stressors: array of strings — difficulties or stressors the user mentioned (max 3, each ≤ 1 sentence)
intentions: array of strings — things the user intends to do tomorrow (max 3, each ≤ 1 sentence)
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

export async function processDebriefTranscript(
  userId: string,
  transcript: TranscriptEntry[]
): Promise<Record<string, unknown>> {
  if (transcript.length === 0) return {};

  const today = new Date().toISOString().split("T")[0]!;
  const fullText = transcript
    .map((t) => `${t.role === "assistant" ? "Valo" : "User"}: ${t.text}`)
    .join("\n");

  let extraction: Record<string, unknown> = {};

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 8192,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Transcript:\n${fullText}` }],
    });
    const block = message.content[0];
    if (block && block.type === "text") {
      let raw = block.text.trim();
      // Claude sometimes wraps JSON in ```json ... ``` despite instructions
      const fenceMatch = raw.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
      if (fenceMatch?.[1]) raw = fenceMatch[1].trim();
      if (!raw.startsWith("{")) {
        const objStart = raw.indexOf("{");
        if (objStart >= 0) raw = raw.slice(objStart);
      }
      extraction = JSON.parse(raw) as Record<string, unknown>;
    }
  } catch (err) {
    logger.error({ err }, "Claude extraction failed in processDebriefTranscript");
  }

  const flags = Array.isArray(extraction.flags)
    ? JSON.stringify(extraction.flags)
    : null;

  const wins = Array.isArray(extraction.wins)
    ? JSON.stringify(extraction.wins)
    : null;

  const stressors = Array.isArray(extraction.stressors)
    ? JSON.stringify(extraction.stressors)
    : null;

  const intentions = Array.isArray(extraction.intentions)
    ? JSON.stringify(extraction.intentions)
    : null;

  await Promise.all([
    db.insert(transcriptsTable).values({ userId, date: today, fullText }),

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

    db.insert(voiceDebriefsTable).values({
      userId,
      callDate: today,
      transcriptText: fullText,
      mood: typeof extraction.mood_score === "number" ? extraction.mood_score : null,
      energy: typeof extraction.energy === "number" ? extraction.energy : null,
      wins,
      stressors,
      intentions,
      rawJson: JSON.stringify(extraction),
    }),

    extraction.mood_score != null
      ? db
          .update(dailyLogsTable)
          .set({
            moodScore: typeof extraction.mood_score === "number" ? extraction.mood_score : undefined,
            primaryEmotion: typeof extraction.primary_emotion === "string" ? extraction.primary_emotion : undefined,
            energyLevel: typeof extraction.energy_level === "string" ? extraction.energy_level : undefined,
            meaningfulConnection: typeof extraction.meaningful_connection === "boolean" ? extraction.meaningful_connection : undefined,
          })
          .where(and(eq(dailyLogsTable.userId, userId), eq(dailyLogsTable.date, today)))
      : Promise.resolve(),

    typeof extraction.valo_observation === "string"
      ? db.insert(insightsTable).values({
          userId,
          date: today,
          label: "Debrief insight",
          content: extraction.valo_observation as string,
          followUpQuestion:
            typeof extraction.tomorrow_intention === "string"
              ? `Tomorrow you wanted to: ${extraction.tomorrow_intention}`
              : "What will you focus on tomorrow?",
        })
      : Promise.resolve(),
  ]);

  return extraction;
}
