import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

const ANALYZE_PROMPTS: Record<string, string> = {
  food: 'Analyze this meal photo. Return JSON only (no markdown): { "meal_name": string, "estimated_calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "meal_type": "breakfast" | "lunch" | "dinner" | "snack", "notes": string }',
  progress: 'This is a body progress photo. Return JSON only (no markdown): { "notes_for_user": string } — notes_for_user should be encouraging, observational, and non-judgmental (2-3 sentences max).',
  other: 'Look at this document or image and extract any useful health, financial, or lifestyle information. Return JSON only (no markdown): { "document_type": string, "key_findings": [{ "label": string, "value": string }], "summary": string, "recommended_action": string }',
};

const SCREENTIME_PROMPTS: Record<string, string> = {
  daily: 'Extract data from this daily Screen Time screenshot. Return JSON only (no markdown): { "report_type": "daily", "total_hours": number, "top_apps": [{ "name": string, "minutes": number }], "pickups": number, "first_pickup_time": string, "notifications_received": number }',
  weekly: 'Extract data from this weekly Screen Time report screenshot. Return JSON only (no markdown): { "report_type": "weekly", "daily_avg_hours": number, "total_weekly_hours": number, "most_used_apps": [{ "name": string, "daily_avg_minutes": number, "weekly_minutes": number }], "avg_pickups_per_day": number, "social_media_hours": number, "productivity_hours": number, "longest_day": string, "shortest_day": string }',
};

router.post("/analyze-image", requireAuth, async (req, res): Promise<void> => {
  const { image, type, subtype } = req.body as { image?: string; type?: string; subtype?: string };

  if (!type || (!ANALYZE_PROMPTS[type] && type !== "screentime")) {
    res.status(400).json({ error: "type must be one of: food, screentime, progress, other" });
    return;
  }

  if (!image || typeof image !== "string") {
    res.status(400).json({ error: "image is required (base64 string)" });
    return;
  }

  let prompt: string;
  if (type === "screentime") {
    const key = subtype === "weekly" ? "weekly" : "daily";
    prompt = SCREENTIME_PROMPTS[key]!;
  } else {
    prompt = ANALYZE_PROMPTS[type]!;
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
            source: { type: "base64", media_type: mediaType, data: imageData },
          },
          { type: "text", text: prompt },
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
