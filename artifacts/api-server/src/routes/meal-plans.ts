import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  mealPlansTable,
  mealPlanDayTypesTable,
  mealSlotsTable,
  mealIngredientsTable,
  userDietPreferencesTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  calcBMR,
  calcTDEE,
  applyGoal,
  deriveMacros,
  distributeWeekly,
  splitMeals,
  buildShoppingList,
  VALID_MACRO_PROFILES,
  type DayTypeMacros,
  type MealTarget,
} from "../lib/mealCalc";
import {
  buildAllergenPromptBlock,
  buildAllergenTerms,
  ingredientContainsAllergen,
} from "../lib/allergens";

// Meal plan generation requires longer context reasoning — use Sonnet so the
// model can hold all slot targets + allergen rules in one pass without truncation.
// Ingredient-swap calls reuse this same model for consistency.
const MEAL_GEN_MODEL = "claude-sonnet-4-6";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
}

interface AiIngredient {
  name: string;
  quantity_per_serving: number;
  unit: string;
  calories_per_serving: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

interface AiMealSlot {
  slot_index: number;
  slot_name: string;
  recipe_name: string;
  instructions?: string;
  prep_mode: "prep" | "cook";
  ingredients: AiIngredient[];
}

interface AiDayType {
  day_type: "training" | "rest";
  meals: AiMealSlot[];
}

// Sums ingredient macros for a meal
function sumIngredientMacros(ingredients: AiIngredient[]) {
  return ingredients.reduce(
    (acc, ing) => ({
      calories: acc.calories + ing.calories_per_serving,
      proteinG: acc.proteinG + ing.protein_g,
      carbsG: acc.carbsG + ing.carbs_g,
      fatG: acc.fatG + ing.fat_g,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}

// Validates and scales a meal slot to hit its macro target within ±5% tolerance.
// Returns the scaled ingredients and actual macros.
function validateAndScaleMeal(
  meal: AiMealSlot,
  target: MealTarget,
  allergenTerms: string[],
): { ok: boolean; reason?: string; ingredients: AiIngredient[]; actual: { calories: number; proteinG: number; carbsG: number; fatG: number } } {
  // Allergen check first (absolute rejection)
  for (const ing of meal.ingredients) {
    if (ingredientContainsAllergen(ing.name, allergenTerms)) {
      return { ok: false, reason: `Allergen violation: "${ing.name}"`, ingredients: meal.ingredients, actual: sumIngredientMacros(meal.ingredients) };
    }
  }

  const raw = sumIngredientMacros(meal.ingredients);
  if (raw.calories === 0) {
    return { ok: false, reason: "Ingredients sum to 0 calories", ingredients: meal.ingredients, actual: raw };
  }

  const scale = target.calories / raw.calories;
  const scaled = meal.ingredients.map((ing) => ({
    ...ing,
    quantity_per_serving: Math.round(ing.quantity_per_serving * scale * 100) / 100,
    calories_per_serving: Math.round(ing.calories_per_serving * scale),
    protein_g: Math.round(ing.protein_g * scale * 10) / 10,
    carbs_g: Math.round(ing.carbs_g * scale * 10) / 10,
    fat_g: Math.round(ing.fat_g * scale * 10) / 10,
  }));

  const actual = sumIngredientMacros(scaled);

  function checkTolerance(a: typeof actual, t: MealTarget): string | null {
    const calPct = Math.abs(a.calories - t.calories) / t.calories;
    const proP = t.proteinG > 0 ? Math.abs(a.proteinG - t.proteinG) / t.proteinG : 0;
    const carP = t.carbsG > 0 ? Math.abs(a.carbsG - t.carbsG) / t.carbsG : 0;
    const fatP = t.fatG > 0 ? Math.abs(a.fatG - t.fatG) / t.fatG : 0;
    if (calPct > 0.05) return `calories off ${(calPct * 100).toFixed(1)}%`;
    if (proP > 0.05) return `protein off ${(proP * 100).toFixed(1)}%`;
    if (carP > 0.05) return `carbs off ${(carP * 100).toFixed(1)}%`;
    if (fatP > 0.05) return `fat off ${(fatP * 100).toFixed(1)}%`;
    return null;
  }

  // ── Pass 1: calorie-scaled ──────────────────────────────────────────────────
  const pass1Err = checkTolerance(actual, target);
  if (!pass1Err) {
    return { ok: true, ingredients: scaled, actual };
  }

  // ── Pass 2: re-scale on protein to pull protein closer to target ────────────
  // After protein re-scale, re-check ALL four macros at ±5%.
  const proteinScale = target.proteinG / (actual.proteinG || 1);
  const scaled2 = scaled.map((ing) => ({
    ...ing,
    quantity_per_serving: Math.round(ing.quantity_per_serving * proteinScale * 100) / 100,
    calories_per_serving: Math.round(ing.calories_per_serving * proteinScale),
    protein_g: Math.round(ing.protein_g * proteinScale * 10) / 10,
    carbs_g: Math.round(ing.carbs_g * proteinScale * 10) / 10,
    fat_g: Math.round(ing.fat_g * proteinScale * 10) / 10,
  }));
  const actual2 = sumIngredientMacros(scaled2);
  const pass2Err = checkTolerance(actual2, target);

  if (!pass2Err) {
    return { ok: true, ingredients: scaled2, actual: actual2 };
  }

  // Both passes failed — hard reject so caller can re-prompt
  return {
    ok: false,
    reason: `Macro tolerance exceeded after two scaling passes: ${pass2Err}`,
    ingredients: scaled2,
    actual: actual2,
  };
}

// Expected slot names in order for a given mealsPerDay value.
// Must stay in sync with splitMeals() in mealCalc.ts.
function expectedSlotNames(mealsPerDay: number): string[] {
  return ["Breakfast", "Lunch", "Dinner", "Snack"].slice(0, mealsPerDay);
}

// Builds a SINGLE combined prompt that asks Claude to generate BOTH training-day
// and rest-day templates in one response. This reduces latency by one round-trip
// and lets the model reason about variety across day types simultaneously.
function buildCombinedGenerationPrompt(
  trainingTargets: MealTarget[],
  restTargets: MealTarget[],
  macroProfile: string,
  cuisineStyle: string | null,
  allergies: string[],
  dislikes: string | null,
  prepPerSlot: Record<string, string>,
  mealsPerDay: number,
): string {
  const allergenBlock = buildAllergenPromptBlock(allergies);
  const slotNames = expectedSlotNames(mealsPerDay);

  function slotList(targets: MealTarget[], dayLabel: string): string {
    return targets
      .map(
        (m) =>
          `    [${dayLabel}] ${m.slotName} (slot ${m.slotIndex}): ${m.calories} kcal, ${m.proteinG}g protein, ${m.carbsG}g carbs, ${m.fatG}g fat; prep_mode=${prepPerSlot[m.slotName.toLowerCase()] ?? "cook"}`,
      )
      .join("\n");
  }

  const slotSection = [
    "Training day slots:",
    slotList(trainingTargets, "training"),
    "",
    "Rest day slots:",
    slotList(restTargets, "rest"),
  ].join("\n");

  // Inline schema example uses the first slot name as a placeholder
  const exampleSlotName = slotNames[0] ?? "Breakfast";

  return `You are a professional sports nutritionist. Generate a full weekly meal plan template covering BOTH a training day AND a rest day.

Macro profile: ${macroProfile}
${cuisineStyle ? `Cuisine style preference: ${cuisineStyle}` : ""}
Dislikes / avoid: ${dislikes ?? "none"}
STRICT allergen exclusions (reject allergen AND all listed derivatives):
${allergenBlock}

${slotSection}

Rules:
- Return ONLY valid JSON, no markdown, no prose.
- You MUST return EXACTLY ${mealsPerDay} meal(s) for each day type — no more, no fewer.
- Slot indices and slot names MUST exactly match the list above (0-based, in order: ${slotNames.join(", ")}).
- Each meal MUST include 3–5 ingredients with realistic per-serving quantities.
- Ingredient macros must plausibly sum to each slot's calorie target (before server-side scaling).
- Do NOT include any ingredient containing an allergen or its derivatives.
- Keep recipes practical and varied; training and rest days may share ingredients but must differ in at least one meal.

JSON schema:
{
  "training": {
    "day_type": "training",
    "meals": [
      {
        "slot_index": 0,
        "slot_name": "${exampleSlotName}",
        "recipe_name": "...",
        "instructions": "...",
        "prep_mode": "prep|cook",
        "ingredients": [
          { "name": "...", "quantity_per_serving": 0, "unit": "...", "calories_per_serving": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0 }
        ]
      }
    ]
  },
  "rest": {
    "day_type": "rest",
    "meals": [
      {
        "slot_index": 0,
        "slot_name": "${exampleSlotName}",
        "recipe_name": "...",
        "instructions": "...",
        "prep_mode": "prep|cook",
        "ingredients": [
          { "name": "...", "quantity_per_serving": 0, "unit": "...", "calories_per_serving": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0 }
        ]
      }
    ]
  }
}`;
}

// Validates the structure of a parsed day type against the expected slot count and names.
// Returns an error string on failure, or null on success.
function validateDayTypeStructure(
  parsed: AiDayType,
  expectedTargets: MealTarget[],
  dayLabel: string,
): string | null {
  const slotNames = expectedTargets.map((t) => t.slotName);
  if (parsed.meals.length !== expectedTargets.length) {
    return `${dayLabel} day: expected ${expectedTargets.length} meals but got ${parsed.meals.length}`;
  }
  for (let i = 0; i < parsed.meals.length; i++) {
    const meal = parsed.meals[i]!;
    if (meal.slot_index !== i) {
      return `${dayLabel} day slot ${i}: expected slot_index=${i} but got ${meal.slot_index}`;
    }
    if (meal.slot_name !== slotNames[i]) {
      return `${dayLabel} day slot ${i}: expected slot_name="${slotNames[i]}" but got "${meal.slot_name}"`;
    }
  }
  return null;
}

// Loads a plan with all relations for GET responses
async function loadFullPlan(planId: number, userId: string) {
  const planRows = await db
    .select()
    .from(mealPlansTable)
    .where(and(eq(mealPlansTable.id, planId), eq(mealPlansTable.userId, userId)));

  const plan = planRows[0];
  if (!plan) return null;

  const dayTypes = await db
    .select()
    .from(mealPlanDayTypesTable)
    .where(eq(mealPlanDayTypesTable.planId, planId));

  const slots = await db
    .select()
    .from(mealSlotsTable)
    .where(eq(mealSlotsTable.planId, planId));

  const ingredients = await db
    .select()
    .from(mealIngredientsTable)
    .where(eq(mealIngredientsTable.planId, planId));

  const dayTypesFull = dayTypes.map((dt) => {
    const dtSlots = slots
      .filter((s) => s.dayTypeId === dt.id)
      .sort((a, b) => a.slotIndex - b.slotIndex);
    const meals = dtSlots.map((slot) => {
      const slotIngredients = ingredients.filter((i) => i.mealSlotId === slot.id);
      return { ...slot, ingredients: slotIngredients };
    });
    return { ...dt, meals };
  });

  return { ...plan, dayTypes: dayTypesFull };
}

// ── POST /api/meal-plans ──────────────────────────────────────────────────────

router.post("/meal-plans", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const body = req.body as {
    macrosKnown?: boolean;
    knownCalories?: number;
    knownProteinG?: number;
    knownCarbsG?: number;
    knownFatG?: number;
    sex?: "male" | "female";
    age?: number;
    weightKg?: number;
    heightCm?: number;
    activityLevel?: string;
    goal?: string;
    macroProfile: string;
    cuisineStyle?: string;
    allergies?: string[];
    dislikes?: string;
    mealsPerDay: number;
    trainingDaysPerWeek: number;
    restDaysPerWeek: number;
    prepPerSlot?: Record<string, string>;
  };

  // Validate macroProfile
  if (!VALID_MACRO_PROFILES.includes(body.macroProfile?.toLowerCase())) {
    res.status(400).json({ error: `macroProfile must be one of: ${VALID_MACRO_PROFILES.join(", ")}` });
    return;
  }

  if ((body.trainingDaysPerWeek ?? 0) + (body.restDaysPerWeek ?? 0) !== 7) {
    res.status(400).json({ error: "trainingDaysPerWeek + restDaysPerWeek must equal 7" });
    return;
  }

  if (!body.mealsPerDay || body.mealsPerDay < 1 || body.mealsPerDay > 3) {
    res.status(400).json({ error: "mealsPerDay must be 1, 2, or 3" });
    return;
  }

  // ── Step 1: derive macro targets ──
  let dailyMacros: DayTypeMacros;
  let clampExplanation = "";

  try {
    if (body.macrosKnown && body.knownCalories) {
      dailyMacros = {
        calories: body.knownCalories,
        proteinG: body.knownProteinG ?? 0,
        carbsG: body.knownCarbsG ?? 0,
        fatG: body.knownFatG ?? 0,
      };
    } else {
      if (!body.sex || !body.age || !body.weightKg || !body.heightCm || !body.activityLevel || !body.goal) {
        res.status(400).json({ error: "When macrosKnown is false, sex/age/weightKg/heightCm/activityLevel/goal are required" });
        return;
      }
      const bmr = calcBMR(body.weightKg, body.heightCm, body.age, body.sex);
      const tdee = calcTDEE(bmr, body.activityLevel);
      const { calories, clampExplanation: clampExp } = applyGoal(tdee, body.goal, body.sex);
      clampExplanation = clampExp;
      const macros = deriveMacros(calories, body.weightKg, body.goal, body.macroProfile, body.sex);
      dailyMacros = { calories: macros.calories, proteinG: macros.proteinG, carbsG: macros.carbsG, fatG: macros.fatG };
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }

  // ── Step 2: distribute weekly ──
  let distribution: ReturnType<typeof distributeWeekly>;
  try {
    distribution = distributeWeekly(dailyMacros, body.trainingDaysPerWeek, body.restDaysPerWeek);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }

  // ── Step 3: split meals per day type ──
  const trainingMealTargets = splitMeals(distribution.training, body.mealsPerDay);
  const restMealTargets = splitMeals(distribution.rest, body.mealsPerDay);

  const allergies = body.allergies ?? [];
  const allergenTerms = buildAllergenTerms(allergies);
  const prepPerSlot = body.prepPerSlot ?? {};

  // ── Step 4: AI generation — single combined call for both day types ──
  // One request returns training + rest templates together, reducing latency and
  // letting the model reason about cross-day variety in one context window.

  const combinedPrompt = buildCombinedGenerationPrompt(
    trainingMealTargets,
    restMealTargets,
    body.macroProfile,
    body.cuisineStyle ?? null,
    allergies,
    body.dislikes ?? null,
    prepPerSlot,
    body.mealsPerDay,
  );

  let genAttempts = 0;
  let genLastError = "";
  const generatedDayTypes: AiDayType[] = [];

  while (genAttempts < 2 && generatedDayTypes.length < 2) {
    genAttempts++;
    let raw = "";
    try {
      const msg = await anthropic.messages.create({
        model: MEAL_GEN_MODEL,
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: combinedPrompt + (genLastError ? `\n\nPrevious attempt failed: ${genLastError}. Please fix these issues exactly.` : ""),
          },
        ],
      });
      raw = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    } catch (err: any) {
      req.log.error({ err }, "meal-plans: AI call failed");
      res.status(500).json({ error: "AI generation failed" });
      return;
    }

    let parsedCombined: { training: AiDayType; rest: AiDayType } | null = null;
    try {
      parsedCombined = JSON.parse(stripFences(raw)) as { training: AiDayType; rest: AiDayType };
    } catch {
      genLastError = "Response was not valid JSON";
      continue;
    }

    const dayTypePairs: Array<{ key: "training" | "rest"; parsed: AiDayType; targets: MealTarget[] }> = [
      { key: "training", parsed: parsedCombined.training, targets: trainingMealTargets },
      { key: "rest", parsed: parsedCombined.rest, targets: restMealTargets },
    ];

    let combinedOk = true;
    const acceptedDayTypes: AiDayType[] = [];

    for (const { key, parsed, targets } of dayTypePairs) {
      // ── Structural validation: exact count + correct slot indices/names ──
      const structErr = validateDayTypeStructure(parsed, targets, key);
      if (structErr) {
        genLastError = structErr;
        combinedOk = false;
        break;
      }

      // ── Macro validation and calorie scaling per slot ──
      const validatedMeals: AiMealSlot[] = [];
      for (let i = 0; i < parsed.meals.length; i++) {
        const meal = parsed.meals[i]!;
        const target = targets[i]!;
        const result = validateAndScaleMeal(meal, target, allergenTerms);
        if (!result.ok) {
          genLastError = `${key} slot ${i} ("${meal.slot_name}") failed: ${result.reason}`;
          combinedOk = false;
          break;
        }
        validatedMeals.push({ ...meal, ingredients: result.ingredients });
      }
      if (!combinedOk) break;
      acceptedDayTypes.push({ ...parsed, meals: validatedMeals });
    }

    if (combinedOk) {
      generatedDayTypes.push(...acceptedDayTypes);
    }
  }

  if (generatedDayTypes.length < 2) {
    req.log.error({ genLastError }, "meal-plans: generation failed after retries");
    res.status(500).json({ error: `Could not generate valid meal templates: ${genLastError}` });
    return;
  }

  // ── Step 5: persist to DB ──
  try {
    const [plan] = await db
      .insert(mealPlansTable)
      .values({
        userId,
        macroProfile: body.macroProfile,
        cuisineStyle: body.cuisineStyle ?? null,
        allergies,
        dislikes: body.dislikes ?? null,
        mealsPerDay: body.mealsPerDay,
        trainingDaysPerWeek: body.trainingDaysPerWeek,
        restDaysPerWeek: body.restDaysPerWeek,
        dailyBaselineCalories: dailyMacros.calories,
        dailyProteinG: dailyMacros.proteinG,
        dailyCarbsG: dailyMacros.carbsG,
        dailyFatG: dailyMacros.fatG,
        inputsSnapshot: body as unknown as Record<string, unknown>,
      })
      .returning();

    if (!plan) {
      res.status(500).json({ error: "Failed to persist plan" });
      return;
    }

    for (const aiDt of generatedDayTypes) {
      const targetMacros = aiDt.day_type === "training" ? distribution.training : distribution.rest;

      const [dtRow] = await db
        .insert(mealPlanDayTypesTable)
        .values({
          planId: plan.id,
          userId,
          dayType: aiDt.day_type,
          targetCalories: targetMacros.calories,
          targetProteinG: targetMacros.proteinG,
          targetCarbsG: targetMacros.carbsG,
          targetFatG: targetMacros.fatG,
        })
        .returning();

      if (!dtRow) continue;

      for (const aiMeal of aiDt.meals) {
        const mealTarget =
          (aiDt.day_type === "training" ? trainingMealTargets : restMealTargets)[aiMeal.slot_index]
          ?? (aiDt.day_type === "training" ? trainingMealTargets : restMealTargets)[0]!;

        const actual = sumIngredientMacros(aiMeal.ingredients);

        const [slotRow] = await db
          .insert(mealSlotsTable)
          .values({
            dayTypeId: dtRow.id,
            planId: plan.id,
            userId,
            slotIndex: aiMeal.slot_index,
            slotName: aiMeal.slot_name,
            recipeName: aiMeal.recipe_name,
            instructions: aiMeal.instructions ?? null,
            prepMode: aiMeal.prep_mode ?? "cook",
            targetCalories: mealTarget.calories,
            targetProteinG: mealTarget.proteinG,
            targetCarbsG: mealTarget.carbsG,
            targetFatG: mealTarget.fatG,
            actualCalories: actual.calories,
            actualProteinG: Math.round(actual.proteinG),
            actualCarbsG: Math.round(actual.carbsG),
            actualFatG: Math.round(actual.fatG),
          })
          .returning();

        if (!slotRow) continue;

        for (const ing of aiMeal.ingredients) {
          await db.insert(mealIngredientsTable).values({
            mealSlotId: slotRow.id,
            planId: plan.id,
            userId,
            name: ing.name,
            quantityPerServing: ing.quantity_per_serving,
            unit: ing.unit,
            caloriesPerServing: ing.calories_per_serving,
            proteinG: ing.protein_g,
            carbsG: ing.carbs_g,
            fatG: ing.fat_g,
          });
        }
      }
    }

    // Save diet preferences for pre-fill on next visit
    await db
      .insert(userDietPreferencesTable)
      .values({
        userId,
        macroProfile: body.macroProfile,
        cuisineStyle: body.cuisineStyle ?? null,
        allergies,
        dislikes: body.dislikes ?? null,
        mealsPerDay: body.mealsPerDay,
        trainingDaysPerWeek: body.trainingDaysPerWeek,
      })
      .onConflictDoUpdate({
        target: userDietPreferencesTable.userId,
        set: {
          macroProfile: body.macroProfile,
          cuisineStyle: body.cuisineStyle ?? null,
          allergies,
          dislikes: body.dislikes ?? null,
          mealsPerDay: body.mealsPerDay,
          trainingDaysPerWeek: body.trainingDaysPerWeek,
          updatedAt: new Date(),
        },
      });

    const fullPlan = await loadFullPlan(plan.id, userId);
    // Return MealPlanFull directly to match the OpenAPI contract.
    // clampExplanation (if any) is surfaced as a response header so the client
    // can display a user-friendly note without breaking the schema shape.
    if (clampExplanation) {
      res.setHeader("X-Calorie-Clamp", clampExplanation);
    }
    res.status(201).json(fullPlan);
  } catch (err: any) {
    req.log.error({ err }, "meal-plans: DB persist failed");
    res.status(500).json({ error: "Failed to save plan" });
  }
});

// ── GET /api/meal-plans/:id ───────────────────────────────────────────────────

router.get("/meal-plans/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(idParam ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const plan = await loadFullPlan(id, userId);
    if (!plan) { res.status(404).json({ error: "Not found" }); return; }
    res.json(plan);
  } catch (err: any) {
    req.log.error({ err }, "meal-plans GET failed");
    res.status(500).json({ error: "Failed to fetch plan" });
  }
});

// ── POST /api/meal-plans/:id/meals/:mealId/swap ───────────────────────────────

router.post("/meal-plans/:id/meals/:mealId/swap", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const idParam2 = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const mealIdParam = Array.isArray(req.params.mealId) ? req.params.mealId[0] : req.params.mealId;
  const planId = parseInt(idParam2 ?? "", 10);
  const mealId = parseInt(mealIdParam ?? "", 10);
  if (isNaN(planId) || isNaN(mealId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const planRows = await db
      .select()
      .from(mealPlansTable)
      .where(and(eq(mealPlansTable.id, planId), eq(mealPlansTable.userId, userId)));
    const plan = planRows[0];
    if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }

    const slotRows = await db
      .select()
      .from(mealSlotsTable)
      .where(and(eq(mealSlotsTable.id, mealId), eq(mealSlotsTable.planId, planId)));
    const slot = slotRows[0];
    if (!slot) { res.status(404).json({ error: "Meal slot not found" }); return; }

    const dtRows = await db
      .select()
      .from(mealPlanDayTypesTable)
      .where(eq(mealPlanDayTypesTable.id, slot.dayTypeId));
    const dayType = dtRows[0];
    if (!dayType) { res.status(404).json({ error: "Day type not found" }); return; }

    const allergies = (plan.allergies as string[]) ?? [];
    const allergenTerms = buildAllergenTerms(allergies);
    const allergenBlock = buildAllergenPromptBlock(allergies);

    const ingredientId = typeof req.body?.ingredientId === "number" ? req.body.ingredientId as number : null;

    // ── Per-ingredient swap ────────────────────────────────────────────────
    if (ingredientId !== null) {
      const ingRows = await db
        .select()
        .from(mealIngredientsTable)
        .where(and(eq(mealIngredientsTable.id, ingredientId), eq(mealIngredientsTable.mealSlotId, mealId)));
      const targetIng = ingRows[0];
      if (!targetIng) { res.status(404).json({ error: "Ingredient not found in this meal slot" }); return; }

      const ingSwapPrompt = `You are a professional sports nutritionist. Suggest a single ingredient replacement.

Ingredient to replace: "${targetIng.name}" (${targetIng.quantityPerServing} ${targetIng.unit})
Original macros: ${targetIng.caloriesPerServing} kcal, ${targetIng.proteinG}g protein, ${targetIng.carbsG}g carbs, ${targetIng.fatG}g fat
Meal: "${slot.recipeName}" (${slot.slotName})
Macro profile: ${plan.macroProfile}
STRICT allergen exclusions (reject allergen AND all listed derivatives):
${allergenBlock}
Dislikes: ${plan.dislikes ?? "none"}

Rules:
- Return ONLY valid JSON, no markdown, no prose.
- Choose a functionally similar ingredient (same meal role — protein source, carb, fat, vegetable, etc.).
- Quantity and unit should reflect a realistic serving that delivers approximately the same macros.
- Do NOT include any allergen or its derivatives.

JSON schema:
{
  "name": "...",
  "quantity_per_serving": 0,
  "unit": "...",
  "calories_per_serving": 0,
  "protein_g": 0,
  "carbs_g": 0,
  "fat_g": 0
}`;

      const ingMsg = await anthropic.messages.create({
        model: MEAL_GEN_MODEL,
        max_tokens: 512,
        messages: [{ role: "user", content: ingSwapPrompt }],
      });
      const ingRaw = ingMsg.content[0]?.type === "text" ? ingMsg.content[0].text : "";

      let newIng: AiIngredient;
      try {
        newIng = JSON.parse(stripFences(ingRaw)) as AiIngredient;
      } catch {
        res.status(500).json({ error: "AI response was not valid JSON" });
        return;
      }

      // Allergen check on the new ingredient
      if (ingredientContainsAllergen(newIng.name, allergenTerms)) {
        res.status(422).json({ error: `Allergen violation in suggested replacement: "${newIng.name}"` });
        return;
      }

      // Scale the new ingredient to match original's calorie contribution
      if (newIng.calories_per_serving > 0 && targetIng.caloriesPerServing > 0) {
        const scale = targetIng.caloriesPerServing / newIng.calories_per_serving;
        newIng = {
          ...newIng,
          quantity_per_serving: Math.round(newIng.quantity_per_serving * scale * 100) / 100,
          calories_per_serving: Math.round(newIng.calories_per_serving * scale),
          protein_g: Math.round(newIng.protein_g * scale * 10) / 10,
          carbs_g: Math.round(newIng.carbs_g * scale * 10) / 10,
          fat_g: Math.round(newIng.fat_g * scale * 10) / 10,
        };
      }

      // Pre-commit reconciliation (slot → day → weekly).
      // All checks are purely projective — no DB write until all three pass.

      // Load current ingredients for this slot (to project new slot total)
      const existingIngRows = await db
        .select()
        .from(mealIngredientsTable)
        .where(eq(mealIngredientsTable.mealSlotId, mealId));

      const otherIngredients = existingIngRows.filter((i) => i.id !== ingredientId);
      const otherSum = otherIngredients.reduce(
        (acc, i) => ({
          calories: acc.calories + i.caloriesPerServing,
          proteinG: acc.proteinG + i.proteinG,
          carbsG: acc.carbsG + i.carbsG,
          fatG: acc.fatG + i.fatG,
        }),
        { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      );
      const projectedSlotCalories = otherSum.calories + newIng.calories_per_serving;
      const projectedSlotProtein = otherSum.proteinG + newIng.protein_g;
      const projectedSlotCarbs = otherSum.carbsG + newIng.carbs_g;
      const projectedSlotFat = otherSum.fatG + newIng.fat_g;

      // ── Slot-level check (±5% on all four macros) ─────────────────────────
      const calTol = slot.targetCalories > 0
        ? Math.abs(projectedSlotCalories - slot.targetCalories) / slot.targetCalories : 0;
      const protTol = slot.targetProteinG > 0
        ? Math.abs(projectedSlotProtein - slot.targetProteinG) / slot.targetProteinG : 0;
      const carbTol = slot.targetCarbsG > 0
        ? Math.abs(projectedSlotCarbs - slot.targetCarbsG) / slot.targetCarbsG : 0;
      const fatTol = slot.targetFatG > 0
        ? Math.abs(projectedSlotFat - slot.targetFatG) / slot.targetFatG : 0;

      const slotWorstMacro = [
        calTol > 0.05 ? `calories ${(calTol * 100).toFixed(1)}% off` : null,
        protTol > 0.05 ? `protein ${(protTol * 100).toFixed(1)}% off` : null,
        carbTol > 0.05 ? `carbs ${(carbTol * 100).toFixed(1)}% off` : null,
        fatTol > 0.05 ? `fat ${(fatTol * 100).toFixed(1)}% off` : null,
      ].filter(Boolean);

      if (slotWorstMacro.length > 0) {
        res.status(422).json({
          error: `Ingredient swap would drift slot macros out of ±5% tolerance: ${slotWorstMacro.join(", ")}. Try a closer substitute.`,
        });
        return;
      }

      // ── Day-level check (±5% on all four macros) ──────────────────────────
      const allPlanSlots = await db
        .select()
        .from(mealSlotsTable)
        .where(eq(mealSlotsTable.planId, planId));

      const slotsInThisDayType = allPlanSlots.filter((s) => s.dayTypeId === slot.dayTypeId);

      type DayTotals = { cal: number; pro: number; carb: number; fat: number };
      const projDay = slotsInThisDayType.reduce<DayTotals>(
        (acc, s) => s.id === mealId
          ? { cal: acc.cal + projectedSlotCalories, pro: acc.pro + projectedSlotProtein, carb: acc.carb + projectedSlotCarbs, fat: acc.fat + projectedSlotFat }
          : { cal: acc.cal + s.actualCalories, pro: acc.pro + s.actualProteinG, carb: acc.carb + s.actualCarbsG, fat: acc.fat + s.actualFatG },
        { cal: 0, pro: 0, carb: 0, fat: 0 },
      );

      const dayWorstMacro = [
        dayType.targetCalories > 0 && Math.abs(projDay.cal - dayType.targetCalories) / dayType.targetCalories > 0.05
          ? `calories ${(Math.abs(projDay.cal - dayType.targetCalories) / dayType.targetCalories * 100).toFixed(1)}% off` : null,
        dayType.targetProteinG > 0 && Math.abs(projDay.pro - dayType.targetProteinG) / dayType.targetProteinG > 0.05
          ? `protein ${(Math.abs(projDay.pro - dayType.targetProteinG) / dayType.targetProteinG * 100).toFixed(1)}% off` : null,
        dayType.targetCarbsG > 0 && Math.abs(projDay.carb - dayType.targetCarbsG) / dayType.targetCarbsG > 0.05
          ? `carbs ${(Math.abs(projDay.carb - dayType.targetCarbsG) / dayType.targetCarbsG * 100).toFixed(1)}% off` : null,
        dayType.targetFatG > 0 && Math.abs(projDay.fat - dayType.targetFatG) / dayType.targetFatG > 0.05
          ? `fat ${(Math.abs(projDay.fat - dayType.targetFatG) / dayType.targetFatG * 100).toFixed(1)}% off` : null,
      ].filter(Boolean);

      if (dayWorstMacro.length > 0) {
        res.status(422).json({
          error: `Ingredient swap would drift ${dayType.dayType}-day totals out of ±5% tolerance: ${dayWorstMacro.join(", ")}. Try a closer substitute.`,
        });
        return;
      }

      // ── Weekly-level check (±5% of weekly budget, all four macros) ─────────
      const allPlanDayTypes = await db
        .select()
        .from(mealPlanDayTypesTable)
        .where(eq(mealPlanDayTypesTable.planId, planId));

      const weeklyBudgets = {
        cal: 7 * plan.dailyBaselineCalories,
        pro: 7 * plan.dailyProteinG,
        carb: 7 * plan.dailyCarbsG,
        fat: 7 * plan.dailyFatG,
      };

      const weeklyProj = allPlanDayTypes.reduce<DayTotals>(
        (acc, dt) => {
          const n = dt.dayType === "training" ? plan.trainingDaysPerWeek : plan.restDaysPerWeek;
          const dtSlots = allPlanSlots.filter((s) => s.dayTypeId === dt.id);
          const dtTotals: DayTotals = dt.id === slot.dayTypeId
            ? projDay
            : dtSlots.reduce<DayTotals>(
                (a, s) => ({ cal: a.cal + s.actualCalories, pro: a.pro + s.actualProteinG, carb: a.carb + s.actualCarbsG, fat: a.fat + s.actualFatG }),
                { cal: 0, pro: 0, carb: 0, fat: 0 },
              );
          return { cal: acc.cal + dtTotals.cal * n, pro: acc.pro + dtTotals.pro * n, carb: acc.carb + dtTotals.carb * n, fat: acc.fat + dtTotals.fat * n };
        },
        { cal: 0, pro: 0, carb: 0, fat: 0 },
      );

      const weeklyWorstMacro = [
        weeklyBudgets.cal > 0 && Math.abs(weeklyProj.cal - weeklyBudgets.cal) / weeklyBudgets.cal > 0.05
          ? `calories ${(Math.abs(weeklyProj.cal - weeklyBudgets.cal) / weeklyBudgets.cal * 100).toFixed(1)}% off` : null,
        weeklyBudgets.pro > 0 && Math.abs(weeklyProj.pro - weeklyBudgets.pro) / weeklyBudgets.pro > 0.05
          ? `protein ${(Math.abs(weeklyProj.pro - weeklyBudgets.pro) / weeklyBudgets.pro * 100).toFixed(1)}% off` : null,
        weeklyBudgets.carb > 0 && Math.abs(weeklyProj.carb - weeklyBudgets.carb) / weeklyBudgets.carb > 0.05
          ? `carbs ${(Math.abs(weeklyProj.carb - weeklyBudgets.carb) / weeklyBudgets.carb * 100).toFixed(1)}% off` : null,
        weeklyBudgets.fat > 0 && Math.abs(weeklyProj.fat - weeklyBudgets.fat) / weeklyBudgets.fat > 0.05
          ? `fat ${(Math.abs(weeklyProj.fat - weeklyBudgets.fat) / weeklyBudgets.fat * 100).toFixed(1)}% off` : null,
      ].filter(Boolean);

      if (weeklyWorstMacro.length > 0) {
        res.status(422).json({
          error: `Ingredient swap would drift the weekly budget out of tolerance: ${weeklyWorstMacro.join(", ")}. Try a closer substitute.`,
        });
        return;
      }

      // Tolerance passed — commit to DB
      await db.delete(mealIngredientsTable).where(eq(mealIngredientsTable.id, ingredientId));
      await db.insert(mealIngredientsTable).values({
        mealSlotId: mealId,
        planId,
        userId,
        name: newIng.name,
        quantityPerServing: newIng.quantity_per_serving,
        unit: newIng.unit,
        caloriesPerServing: newIng.calories_per_serving,
        proteinG: newIng.protein_g,
        carbsG: newIng.carbs_g,
        fatG: newIng.fat_g,
      });

      // Re-aggregate slot actuals from all current ingredients (after commit)
      const allIngRows = await db
        .select()
        .from(mealIngredientsTable)
        .where(eq(mealIngredientsTable.mealSlotId, mealId));

      const newActual = allIngRows.reduce(
        (acc, i) => ({ calories: acc.calories + i.caloriesPerServing, proteinG: acc.proteinG + i.proteinG, carbsG: acc.carbsG + i.carbsG, fatG: acc.fatG + i.fatG }),
        { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      );

      await db.update(mealSlotsTable).set({
        actualCalories: newActual.calories,
        actualProteinG: Math.round(newActual.proteinG),
        actualCarbsG: Math.round(newActual.carbsG),
        actualFatG: Math.round(newActual.fatG),
        updatedAt: new Date(),
      }).where(eq(mealSlotsTable.id, mealId));

      const updatedSlot = await db.select().from(mealSlotsTable).where(eq(mealSlotsTable.id, mealId));
      res.json({ ...updatedSlot[0], ingredients: allIngRows });
      return;
    }

    // ── Full-meal swap ─────────────────────────────────────────────────────
    const swapPrompt = `You are a professional sports nutritionist. Suggest an alternative recipe for this meal slot.

Current recipe: "${slot.recipeName}" (${slot.slotName} on a ${dayType.dayType} day)
Macro target: ${slot.targetCalories} kcal, ${slot.targetProteinG}g protein, ${slot.targetCarbsG}g carbs, ${slot.targetFatG}g fat
Macro profile: ${plan.macroProfile}
STRICT allergen exclusions (reject allergen AND all listed derivatives):
${allergenBlock}
Dislikes: ${plan.dislikes ?? "none"}

Return ONLY valid JSON with this schema:
{
  "slot_index": ${slot.slotIndex},
  "slot_name": "${slot.slotName}",
  "recipe_name": "...",
  "instructions": "...",
  "prep_mode": "${slot.prepMode}",
  "ingredients": [
    {
      "name": "...",
      "quantity_per_serving": 0,
      "unit": "...",
      "calories_per_serving": 0,
      "protein_g": 0,
      "carbs_g": 0,
      "fat_g": 0
    }
  ]
}`;

    let swapAttempts = 0;
    let swapLastError = "";
    let acceptedMeal: AiMealSlot | null = null;

    while (swapAttempts < 2 && !acceptedMeal) {
      swapAttempts++;
      const msg = await anthropic.messages.create({
        model: MEAL_GEN_MODEL,
        max_tokens: 2048,
        messages: [{ role: "user", content: swapPrompt + (swapLastError ? `\n\nPrevious attempt failed: ${swapLastError}. Please fix these issues.` : "") }],
      });
      const raw = msg.content[0]?.type === "text" ? msg.content[0].text : "";

      let aiMeal: AiMealSlot;
      try {
        aiMeal = JSON.parse(stripFences(raw)) as AiMealSlot;
      } catch {
        swapLastError = "Response was not valid JSON";
        continue;
      }

      const target: MealTarget = {
        slotIndex: slot.slotIndex,
        slotName: slot.slotName,
        calories: slot.targetCalories,
        proteinG: slot.targetProteinG,
        carbsG: slot.targetCarbsG,
        fatG: slot.targetFatG,
      };

      const result = validateAndScaleMeal(aiMeal, target, allergenTerms);
      if (!result.ok) {
        swapLastError = result.reason ?? "Validation failed";
        continue;
      }
      acceptedMeal = { ...aiMeal, ingredients: result.ingredients };
    }

    if (!acceptedMeal) {
      res.status(422).json({ error: `Swap failed after ${swapAttempts} attempts: ${swapLastError}` });
      return;
    }

    // ── Pre-commit reconciliation: day-level and weekly-level invariant checks ──
    // validateAndScaleMeal already confirmed the slot is within ±5% on all four macros.
    // Verify the swap does not drift the overall day and weekly budgets beyond ±5%
    // on all four macros: calories, protein, carbs, and fat.
    const newActualForDayCheck = sumIngredientMacros(acceptedMeal.ingredients);
    const projectedSlotCal = newActualForDayCheck.calories;
    const projectedSlotPro = newActualForDayCheck.proteinG;
    const projectedSlotCarb = newActualForDayCheck.carbsG;
    const projectedSlotFat = newActualForDayCheck.fatG;

    const allPlanSlotsForSwap = await db
      .select()
      .from(mealSlotsTable)
      .where(eq(mealSlotsTable.planId, planId));

    const slotsInSwapDayType = allPlanSlotsForSwap.filter((s) => s.dayTypeId === slot.dayTypeId);
    const projectedDayCalForSwap = slotsInSwapDayType.reduce(
      (sum, s) => sum + (s.id === mealId ? projectedSlotCal : s.actualCalories), 0,
    );
    const projectedDayProForSwap = slotsInSwapDayType.reduce(
      (sum, s) => sum + (s.id === mealId ? projectedSlotPro : s.actualProteinG), 0,
    );
    const projectedDayCarbForSwap = slotsInSwapDayType.reduce(
      (sum, s) => sum + (s.id === mealId ? projectedSlotCarb : s.actualCarbsG), 0,
    );
    const projectedDayFatForSwap = slotsInSwapDayType.reduce(
      (sum, s) => sum + (s.id === mealId ? projectedSlotFat : s.actualFatG), 0,
    );

    const swapDayCalTol  = dayType.targetCalories  > 0 ? Math.abs(projectedDayCalForSwap  - dayType.targetCalories)  / dayType.targetCalories  : 0;
    const swapDayProTol  = dayType.targetProteinG  > 0 ? Math.abs(projectedDayProForSwap  - dayType.targetProteinG)  / dayType.targetProteinG  : 0;
    const swapDayCarbTol = dayType.targetCarbsG    > 0 ? Math.abs(projectedDayCarbForSwap - dayType.targetCarbsG)    / dayType.targetCarbsG    : 0;
    const swapDayFatTol  = dayType.targetFatG      > 0 ? Math.abs(projectedDayFatForSwap  - dayType.targetFatG)      / dayType.targetFatG      : 0;

    const swapDayViolations: string[] = [];
    if (swapDayCalTol  > 0.05) swapDayViolations.push(`calories ${(swapDayCalTol  * 100).toFixed(1)}% off`);
    if (swapDayProTol  > 0.05) swapDayViolations.push(`protein ${(swapDayProTol   * 100).toFixed(1)}% off`);
    if (swapDayCarbTol > 0.05) swapDayViolations.push(`carbs ${(swapDayCarbTol    * 100).toFixed(1)}% off`);
    if (swapDayFatTol  > 0.05) swapDayViolations.push(`fat ${(swapDayFatTol       * 100).toFixed(1)}% off`);

    if (swapDayViolations.length > 0) {
      res.status(422).json({
        error: `Meal swap would drift ${dayType.dayType}-day totals out of ±5% tolerance (${swapDayViolations.join(", ")}). Try a closer alternative.`,
      });
      return;
    }

    const allPlanDayTypesForSwap = await db
      .select()
      .from(mealPlanDayTypesTable)
      .where(eq(mealPlanDayTypesTable.planId, planId));

    const weeklyCalBudgetForSwap  = 7 * plan.dailyBaselineCalories;
    const weeklyProBudgetForSwap  = 7 * plan.dailyProteinG;
    const weeklyCarbBudgetForSwap = 7 * plan.dailyCarbsG;
    const weeklyFatBudgetForSwap  = 7 * plan.dailyFatG;

    const weeklySwapTotals = allPlanDayTypesForSwap.reduce(
      (acc, dt) => {
        const recurrence = dt.dayType === "training" ? plan.trainingDaysPerWeek : plan.restDaysPerWeek;
        const dtSlots = allPlanSlotsForSwap.filter((s) => s.dayTypeId === dt.id);
        const isAffected = dt.id === slot.dayTypeId;
        const dtCal  = isAffected ? projectedDayCalForSwap  : dtSlots.reduce((s, r) => s + r.actualCalories,  0);
        const dtPro  = isAffected ? projectedDayProForSwap  : dtSlots.reduce((s, r) => s + r.actualProteinG,  0);
        const dtCarb = isAffected ? projectedDayCarbForSwap : dtSlots.reduce((s, r) => s + r.actualCarbsG,    0);
        const dtFat  = isAffected ? projectedDayFatForSwap  : dtSlots.reduce((s, r) => s + r.actualFatG,      0);
        return {
          cal:  acc.cal  + dtCal  * recurrence,
          pro:  acc.pro  + dtPro  * recurrence,
          carb: acc.carb + dtCarb * recurrence,
          fat:  acc.fat  + dtFat  * recurrence,
        };
      },
      { cal: 0, pro: 0, carb: 0, fat: 0 },
    );

    const weeklyCalDrift  = weeklyCalBudgetForSwap  > 0 ? Math.abs(weeklySwapTotals.cal  - weeklyCalBudgetForSwap)  / weeklyCalBudgetForSwap  : 0;
    const weeklyProDrift  = weeklyProBudgetForSwap  > 0 ? Math.abs(weeklySwapTotals.pro  - weeklyProBudgetForSwap)  / weeklyProBudgetForSwap  : 0;
    const weeklyCarbDrift = weeklyCarbBudgetForSwap > 0 ? Math.abs(weeklySwapTotals.carb - weeklyCarbBudgetForSwap) / weeklyCarbBudgetForSwap : 0;
    const weeklyFatDrift  = weeklyFatBudgetForSwap  > 0 ? Math.abs(weeklySwapTotals.fat  - weeklyFatBudgetForSwap)  / weeklyFatBudgetForSwap  : 0;

    const weeklyViolations: string[] = [];
    if (weeklyCalDrift  > 0.05) weeklyViolations.push(`calories ${(weeklyCalDrift  * 100).toFixed(1)}% off`);
    if (weeklyProDrift  > 0.05) weeklyViolations.push(`protein ${(weeklyProDrift   * 100).toFixed(1)}% off`);
    if (weeklyCarbDrift > 0.05) weeklyViolations.push(`carbs ${(weeklyCarbDrift    * 100).toFixed(1)}% off`);
    if (weeklyFatDrift  > 0.05) weeklyViolations.push(`fat ${(weeklyFatDrift       * 100).toFixed(1)}% off`);

    if (weeklyViolations.length > 0) {
      res.status(422).json({
        error: `Meal swap would drift the weekly budget out of tolerance (${weeklyViolations.join(", ")}). Try a closer alternative.`,
      });
      return;
    }

    // All invariants passed — commit the swap
    // Delete old ingredients and update slot
    await db.delete(mealIngredientsTable).where(eq(mealIngredientsTable.mealSlotId, mealId));
    const actual = sumIngredientMacros(acceptedMeal.ingredients);

    await db
      .update(mealSlotsTable)
      .set({
        recipeName: acceptedMeal.recipe_name,
        instructions: acceptedMeal.instructions ?? null,
        actualCalories: actual.calories,
        actualProteinG: Math.round(actual.proteinG),
        actualCarbsG: Math.round(actual.carbsG),
        actualFatG: Math.round(actual.fatG),
        updatedAt: new Date(),
      })
      .where(eq(mealSlotsTable.id, mealId));

    for (const ing of acceptedMeal.ingredients) {
      await db.insert(mealIngredientsTable).values({
        mealSlotId: mealId,
        planId,
        userId,
        name: ing.name,
        quantityPerServing: ing.quantity_per_serving,
        unit: ing.unit,
        caloriesPerServing: ing.calories_per_serving,
        proteinG: ing.protein_g,
        carbsG: ing.carbs_g,
        fatG: ing.fat_g,
      });
    }

    // Return the updated slot with its ingredients
    const updatedSlotRows = await db
      .select()
      .from(mealSlotsTable)
      .where(eq(mealSlotsTable.id, mealId));
    const updatedIngredients = await db
      .select()
      .from(mealIngredientsTable)
      .where(eq(mealIngredientsTable.mealSlotId, mealId));

    res.json({ ...updatedSlotRows[0], ingredients: updatedIngredients });
  } catch (err: any) {
    req.log.error({ err }, "meal-plans swap failed");
    res.status(500).json({ error: "Swap failed" });
  }
});

// ── GET /api/meal-plans/:id/prep-list ─────────────────────────────────────────

router.get("/meal-plans/:id/prep-list", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const idParam3 = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const planId = parseInt(idParam3 ?? "", 10);
  if (isNaN(planId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const planRows = await db
      .select()
      .from(mealPlansTable)
      .where(and(eq(mealPlansTable.id, planId), eq(mealPlansTable.userId, userId)));
    const plan = planRows[0];
    if (!plan) { res.status(404).json({ error: "Not found" }); return; }

    const dayTypes = await db
      .select()
      .from(mealPlanDayTypesTable)
      .where(eq(mealPlanDayTypesTable.planId, planId));

    const slots = await db
      .select()
      .from(mealSlotsTable)
      .where(eq(mealSlotsTable.planId, planId));

    const ingredients = await db
      .select()
      .from(mealIngredientsTable)
      .where(eq(mealIngredientsTable.planId, planId));

    const recurrenceByDayType: Record<string, number> = {
      training: plan.trainingDaysPerWeek,
      rest: plan.restDaysPerWeek,
    };

    const mealsForList = slots.map((slot) => {
      const dt = dayTypes.find((d) => d.id === slot.dayTypeId);
      const recurrence = dt ? (recurrenceByDayType[dt.dayType] ?? 1) : 1;
      const slotIngredients = ingredients
        .filter((i) => i.mealSlotId === slot.id)
        .map((i) => ({
          name: i.name,
          quantityPerServing: i.quantityPerServing,
          unit: i.unit,
        }));

      return {
        slotName: slot.slotName,
        prepMode: (slot.prepMode as "prep" | "cook"),
        recurrence,
        ingredients: slotIngredients,
      };
    });

    const items = buildShoppingList(mealsForList);
    res.json({ items });
  } catch (err: any) {
    req.log.error({ err }, "meal-plans prep-list failed");
    res.status(500).json({ error: "Failed to build prep list" });
  }
});

// ── GET /api/user-diet-preferences ───────────────────────────────────────────

router.get("/user-diet-preferences", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  try {
    const rows = await db
      .select()
      .from(userDietPreferencesTable)
      .where(eq(userDietPreferencesTable.userId, userId));
    res.json(rows[0] ?? { userId, allergies: [] });
  } catch (err: any) {
    req.log.error({ err }, "user-diet-preferences GET failed");
    res.status(500).json({ error: "Failed to fetch preferences" });
  }
});

// ── PUT /api/user-diet-preferences ───────────────────────────────────────────

router.put("/user-diet-preferences", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  const body = req.body as {
    macroProfile?: string;
    cuisineStyle?: string;
    allergies?: string[];
    dislikes?: string;
    mealsPerDay?: number;
    trainingDaysPerWeek?: number;
  };

  try {
    const [row] = await db
      .insert(userDietPreferencesTable)
      .values({
        userId,
        macroProfile: body.macroProfile ?? null,
        cuisineStyle: body.cuisineStyle ?? null,
        allergies: body.allergies ?? [],
        dislikes: body.dislikes ?? null,
        mealsPerDay: body.mealsPerDay ?? null,
        trainingDaysPerWeek: body.trainingDaysPerWeek ?? null,
      })
      .onConflictDoUpdate({
        target: userDietPreferencesTable.userId,
        set: {
          macroProfile: body.macroProfile ?? null,
          cuisineStyle: body.cuisineStyle ?? null,
          allergies: body.allergies ?? [],
          dislikes: body.dislikes ?? null,
          mealsPerDay: body.mealsPerDay ?? null,
          trainingDaysPerWeek: body.trainingDaysPerWeek ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    res.json(row);
  } catch (err: any) {
    req.log.error({ err }, "user-diet-preferences PUT failed");
    res.status(500).json({ error: "Failed to save preferences" });
  }
});

export default router;
