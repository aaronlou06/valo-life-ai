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

const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

router.post("/analyze-image", requireAuth, async (req, res): Promise<void> => {
  const {
    image,
    type,
    subtype,
    mediaType: clientMediaType,
  } = req.body as { image?: string; type?: string; subtype?: string; mediaType?: string };

  req.log.info(
    {
      bodyKeys: Object.keys(req.body),
      imageLength: typeof image === "string" ? image.length : 0,
      type,
      subtype,
      clientMediaType,
    },
    "analyze-image: request received",
  );

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

  const rawMediaType = (clientMediaType ?? "image/jpeg").toLowerCase();
  const mediaType = (ALLOWED_MEDIA_TYPES.has(rawMediaType) ? rawMediaType : "image/jpeg") as
    | "image/jpeg"
    | "image/png"
    | "image/gif"
    | "image/webp";

  const imageData = image.replace(/^data:image\/\w+;base64,/, "").replace(/\s/g, "");

  req.log.info(
    { type, subtype, mediaType, imageDataLength: imageData.length },
    "analyze-image: calling Claude",
  );

  let message: Awaited<ReturnType<typeof anthropic.messages.create>>;
  try {
    message = await anthropic.messages.create({
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
            { type: "text", text: prompt },
          ],
        },
      ],
    });
  } catch (err) {
    req.log.error(
      { err, type, subtype, imageDataLength: imageData.length },
      "analyze-image: Claude API call failed",
    );
    res.status(502).json({
      error: "Image analysis failed",
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
  req.log.info(
    { type, rawLength: raw.length, rawPreview: raw.slice(0, 300) },
    "analyze-image: Claude response received",
  );

  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  let data: unknown;
  try {
    data = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(stripped);
  } catch (parseErr) {
    req.log.warn(
      { parseErr, rawPreview: raw.slice(0, 300) },
      "analyze-image: JSON parse failed, returning raw as summary",
    );
    data = { summary: raw };
  }

  res.json({ type, data });
});

export default router;
