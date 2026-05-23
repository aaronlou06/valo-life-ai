import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

const ANALYZE_PROMPTS: Record<string, string> = {
  food: 'Analyze this meal photo. Return JSON only (no markdown): { "meal_name": string, "estimated_calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "meal_type": "breakfast" | "lunch" | "dinner" | "snack", "notes": string }',
  screentime: 'This is a screen time report screenshot. Extract and return JSON only (no markdown): { "total_daily_avg_hours": number, "most_used_apps": [{ "name": string, "daily_avg_minutes": number }], "pickups_per_day": number, "social_media_hours": number, "productivity_hours": number }',
  progress: 'This is a body progress photo. Return JSON only (no markdown): { "notes_for_user": string } — notes_for_user should be encouraging, observational, and non-judgmental (2-3 sentences max).',
  other: 'Look at this document or image and extract any useful health, financial, or lifestyle information. Return JSON only (no markdown): { "document_type": string, "key_findings": [{ "label": string, "value": string }], "summary": string, "recommended_action": string }',
};

router.post("/analyze-image", requireAuth, async (req, res): Promise<void> => {
  const { image, type } = req.body as { image?: string; type?: string };

  if (!type || !ANALYZE_PROMPTS[type]) {
    res.status(400).json({ error: "type must be one of: food, screentime, progress, other" });
    return;
  }

  if (!image || typeof image !== "string") {
    res.status(400).json({ error: "image is required (base64 string)" });
    return;
  }

  let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
  let imageData = image;

  if (image.startsWith("data:")) {
    const match = image.match(/^data:(image\/\w+);base64,(.+)$/s);
    if (match && match[1] && match[2]) {
      const mt = match[1];
      if (mt === "image/png" || mt === "image/gif" || mt === "image/webp") {
        mediaType = mt as typeof mediaType;
      }
      imageData = match[2];
    }
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: imageData,
            },
          },
          {
            type: "text",
            text: ANALYZE_PROMPTS[type]!,
          },
        ],
      },
    ],
  });

  const raw = message.content[0]?.type === "text" ? message.content[0].text : "{}";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  let data: unknown = {};
  try {
    data = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch {
    data = { raw };
  }

  res.json({ type, data });
});

export default router;
