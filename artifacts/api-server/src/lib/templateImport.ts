import { and, eq, isNull } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, exercisesTable } from "@workspace/db";
import { logger } from "./logger";

export interface ParsedExercise {
  name: string;
  matchedExerciseId: number | null;
  matchedExerciseName: string | null;
  confidence: "high" | "medium" | "low";
  prescribedSets: number | null;
  prescribedReps: number | null;
  prescribedWeightKg: number | null;
  restSec: number | null;
  supersetGroupId: number | null;
  notes: string | null;
}

export interface ParsedTemplate {
  templateName: string;
  category: string;
  estimatedDurationMin: number | null;
  exercises: ParsedExercise[];
}

const VALID_CATEGORIES = new Set(["strength", "cardio", "hiit", "mobility", "sport"]);

type ImportInput =
  | { text: string }
  | { imageBase64: string; mimeType: string };

/**
 * Parses a workout (freeform text OR an image via Claude vision) into a structured template.
 * Fetches the exercise library to attempt name matching; unmatched exercises
 * (confidence !== "high") are returned with matchedExerciseId=null so the
 * client can surface them for user confirmation.
 */
export async function parseWorkoutImport(input: ImportInput): Promise<ParsedTemplate> {
  let text: string;

  if ("imageBase64" in input) {
    // Use Claude vision to extract workout text from the image first.
    logger.info("templateImport: extracting text from image via Claude vision");
    try {
      const visionMsg = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: input.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                  data: input.imageBase64,
                },
              },
              {
                type: "text",
                text: "Extract all workout and exercise information from this image as plain text. Include exercise names, sets, reps, weights, rest periods, and any other workout parameters. Return only the extracted workout text, nothing else.",
              },
            ],
          },
        ],
      });
      text = visionMsg.content[0]?.type === "text" ? visionMsg.content[0].text.trim() : "";
      if (!text) throw new Error("Could not extract workout data from the image.");
    } catch (err) {
      if (err instanceof Error && err.message.includes("Could not extract")) throw err;
      logger.error({ err }, "templateImport: Claude vision failed");
      throw new Error("AI image analysis failed. Please try again or paste the workout text instead.");
    }
  } else {
    text = input.text;
  }
  // Fetch system exercises for matching (id + name, capped for prompt size).
  const exercises = await db
    .select({ id: exercisesTable.id, name: exercisesTable.name, category: exercisesTable.category })
    .from(exercisesTable)
    .where(and(isNull(exercisesTable.userId), eq(exercisesTable.isSystem, true), eq(exercisesTable.isArchived, false)))
    .orderBy(exercisesTable.name)
    .limit(900);

  const libraryLines = exercises
    .map((e) => `${e.id}:${e.name} [${e.category}]`)
    .join("\n");

  const prompt = `You are a precise workout parser. Parse the workout text into structured JSON.

EXERCISE LIBRARY — match by ID when confident:
${libraryLines}

WORKOUT TEXT:
${text}

Return ONLY valid JSON (no markdown, no code fences) matching exactly this shape:
{
  "templateName": "string",
  "category": "strength|cardio|hiit|mobility|sport",
  "estimatedDurationMin": number or null,
  "exercises": [
    {
      "name": "string (exercise name as written in the text)",
      "matchedExerciseId": number or null,
      "confidence": "high|medium|low",
      "prescribedSets": number or null,
      "prescribedReps": number or null,
      "prescribedWeightKg": number or null,
      "restSec": number or null,
      "supersetGroupId": number or null,
      "notes": string or null
    }
  ]
}

Rules:
- matchedExerciseId: use the library ID when you are highly confident the exercise is the same (exact or near-exact name). Use null if uncertain.
- confidence: "high" = near-exact name match, "medium" = reasonable synonym, "low" = guessing.
- prescribedWeightKg: convert lbs to kg (divide by 2.2046). Round to one decimal.
- restSec: convert to seconds (e.g. "2 min" -> 120, "90s" -> 90). Use null if not specified.
- supersetGroupId: assign the same positive integer to exercises that form a superset (e.g. A1/A2 notation, "SS:" prefix, or "superset with"). Use null for standalone exercises. Different superset pairs get different integers (1, 2, 3...).
- prescribedReps: if a rep range is given (e.g. "8-12"), use the lower bound.
- templateName: infer from context (e.g. "Push Day", "Upper Body") or use "My Workout" if unclear.
- category: infer from exercise types (strength/cardio/hiit/mobility/sport).`;

  let raw: string;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
  } catch (err) {
    logger.error({ err }, "templateImport: Claude call failed");
    throw new Error("AI parsing failed. Please try again.");
  }

  // Strip any accidental markdown fences.
  const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    logger.warn({ raw }, "templateImport: failed to parse Claude JSON");
    throw new Error("AI returned an unparseable response. Please try again.");
  }

  const result = parsed as Record<string, unknown>;

  // Build a lookup from exerciseId → name for populating matchedExerciseName.
  const exerciseMap = new Map(exercises.map((e) => [e.id, e.name]));

  const rawExercises = Array.isArray(result.exercises) ? result.exercises : [];

  const parsedExercises: ParsedExercise[] = rawExercises.map((e: Record<string, unknown>) => {
    const matchedId =
      typeof e.matchedExerciseId === "number" && exerciseMap.has(e.matchedExerciseId)
        ? e.matchedExerciseId
        : null;

    return {
      name: typeof e.name === "string" ? e.name : "Unknown exercise",
      matchedExerciseId: matchedId,
      matchedExerciseName: matchedId !== null ? (exerciseMap.get(matchedId) ?? null) : null,
      confidence: (["high", "medium", "low"].includes(e.confidence as string)
        ? e.confidence
        : "low") as ParsedExercise["confidence"],
      prescribedSets: typeof e.prescribedSets === "number" ? Math.round(e.prescribedSets) : null,
      prescribedReps: typeof e.prescribedReps === "number" ? Math.round(e.prescribedReps) : null,
      prescribedWeightKg:
        typeof e.prescribedWeightKg === "number"
          ? Math.round(e.prescribedWeightKg * 10) / 10
          : null,
      restSec: typeof e.restSec === "number" ? Math.round(e.restSec) : null,
      supersetGroupId:
        typeof e.supersetGroupId === "number" && e.supersetGroupId > 0
          ? e.supersetGroupId
          : null,
      notes: typeof e.notes === "string" && e.notes.trim() ? e.notes.trim() : null,
    };
  });

  const category =
    typeof result.category === "string" && VALID_CATEGORIES.has(result.category)
      ? result.category
      : "strength";

  return {
    templateName:
      typeof result.templateName === "string" && result.templateName.trim()
        ? result.templateName.trim()
        : "My Workout",
    category,
    estimatedDurationMin:
      typeof result.estimatedDurationMin === "number"
        ? Math.round(result.estimatedDurationMin)
        : null,
    exercises: parsedExercises,
  };
}
