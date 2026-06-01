import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, nutritionLogsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

function stripCodeFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
}

// POST /api/meal/plan — AI-generated meal plan via Claude
router.post("/meal/plan", requireAuth, async (req, res): Promise<void> => {
  const {
    dietType = "balanced",
    caloriesTarget = 2000,
    budget = "moderate",
    allergies = [],
    days = 7,
  } = req.body as {
    dietType?: string;
    caloriesTarget?: number;
    budget?: string;
    allergies?: string[];
    days?: number;
  };

  const allergyStr = allergies.length > 0 ? allergies.join(", ") : "none";
  const budgetMap: Record<string, string> = {
    low: "under $50/week",
    moderate: "$50–$100/week",
    high: "$100+/week",
  };
  const budgetDesc = budgetMap[budget] ?? budget;

  const prompt = `Generate a ${days}-day meal plan.
Diet: ${dietType}
Calories/day: ${caloriesTarget}
Weekly grocery budget: ${budgetDesc}
Allergies/restrictions: ${allergyStr}

Rules for the shoppingList:
- List ONLY the specific ingredients required to prepare the exact meals you generate above.
- Include quantities (e.g. "2 chicken breasts", "1 cup rolled oats", "3 large eggs", "400g canned chickpeas").
- Group into the categories below. Do NOT add items that are not actually used in any meal.
- Consolidate duplicates across days (e.g. if chicken appears Monday and Wednesday, write "4 chicken breasts" once).

Return ONLY valid JSON — no markdown, no prose — matching this schema exactly:
{
  "days": [
    {
      "day": 1,
      "dayName": "Monday",
      "meals": {
        "breakfast": { "name": "...", "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "prep_mins": 0 },
        "lunch":     { "name": "...", "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "prep_mins": 0 },
        "dinner":    { "name": "...", "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "prep_mins": 0 },
        "snack":     { "name": "...", "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "prep_mins": 0 }
      },
      "totals": { "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0 }
    }
  ],
  "shoppingList": [
    { "category": "Produce",   "items": ["3 bananas", "1 bag spinach", "..."] },
    { "category": "Proteins",  "items": ["4 chicken breasts (600g)", "..."] },
    { "category": "Dairy",     "items": ["500ml Greek yogurt", "..."] },
    { "category": "Grains",    "items": ["1 cup rolled oats", "..."] },
    { "category": "Pantry",    "items": ["2 tbsp olive oil", "..."] }
  ],
  "weeklyMacros": { "avg_calories": 0, "avg_protein_g": 0, "avg_carbs_g": 0, "avg_fat_g": 0 },
  "estimatedWeeklyBudget": "$XX–$XX"
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = message.content[0]?.type === "text" ? message.content[0].text : "";
    let plan: unknown;
    try {
      plan = JSON.parse(stripCodeFences(rawText));
    } catch {
      req.log.error({ rawText }, "meal/plan JSON parse failed");
      res.status(500).json({ error: "Failed to parse meal plan response" });
      return;
    }

    res.json({ ok: true, plan, meta: { dietType, caloriesTarget, budget, allergies, days } });
  } catch (err: any) {
    req.log.error({ err }, "meal/plan generation failed");
    res.status(500).json({ error: "Meal plan generation failed" });
  }
});

// POST /api/meal/swap — suggest 3 swap alternatives for a single meal
router.post("/meal/swap", requireAuth, async (req, res): Promise<void> => {
  const {
    mealName = "current meal",
    mealType = "meal",
    dietType = "balanced",
    caloriesTarget = 500,
    allergies = [],
  } = req.body as {
    mealName?: string;
    mealType?: string;
    dietType?: string;
    caloriesTarget?: number;
    allergies?: string[];
  };

  const prompt = `I follow a ${dietType} diet and want to swap my ${mealType} "${mealName}".
Target calories: ~${caloriesTarget}. Allergies: ${allergies.length > 0 ? allergies.join(", ") : "none"}.

Suggest 3 alternatives. Return ONLY valid JSON:
{
  "alternatives": [
    { "name": "...", "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "prep_mins": 0, "reason": "..." }
  ]
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = message.content[0]?.type === "text" ? message.content[0].text : "";
    let result: unknown;
    try {
      result = JSON.parse(stripCodeFences(rawText));
    } catch {
      res.status(500).json({ error: "Failed to parse swap alternatives" });
      return;
    }

    res.json({ ok: true, ...(result as object) });
  } catch (err: any) {
    req.log.error({ err }, "meal/swap failed");
    res.status(500).json({ error: "Meal swap failed" });
  }
});

// GET /api/meal/nutrition-logs
router.get("/meal/nutrition-logs", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { date } = req.query as { date?: string };

  try {
    const conditions = [eq(nutritionLogsTable.userId, userId)];
    if (date) conditions.push(eq(nutritionLogsTable.date, date));

    const logs = await db
      .select()
      .from(nutritionLogsTable)
      .where(and(...conditions))
      .orderBy(desc(nutritionLogsTable.createdAt));

    res.json({ logs });
  } catch (err: any) {
    req.log.error({ err }, "nutrition-logs fetch failed");
    res.status(500).json({ error: "Failed to fetch nutrition logs" });
  }
});

// POST /api/meal/nutrition-logs — save a manual nutrition log entry
router.post("/meal/nutrition-logs", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const { date, mealType, description, calories, proteinG, carbsG, fatG, source } = req.body as {
    date: string;
    mealType: string;
    description?: string;
    calories?: number;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
    source?: string;
  };

  if (!date || !mealType) {
    res.status(400).json({ error: "date and mealType are required" });
    return;
  }

  try {
    const [row] = await db
      .insert(nutritionLogsTable)
      .values({ userId, date, mealType, description, calories, proteinG, carbsG, fatG, source: source ?? "manual" })
      .returning();

    res.status(201).json({ ok: true, log: row });
  } catch (err: any) {
    req.log.error({ err }, "nutrition-log insert failed");
    res.status(500).json({ error: "Failed to save nutrition log" });
  }
});

export default router;
