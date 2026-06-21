// Meal calculation engine — all arithmetic lives here, never in the AI prompt.
// Per-serving portion is the single source of truth; larger quantities derive from it.
//
// IMPORTANT: every numeric constant is a named export so it is auditable and not
// improvised per-call.  Callers must not hardcode any of these values.

// ── Activity multipliers (Mifflin–St Jeor standard factors) ──────────────────

export const ACTIVITY_SEDENTARY = 1.2;
export const ACTIVITY_LIGHTLY_ACTIVE = 1.375;
export const ACTIVITY_MODERATELY_ACTIVE = 1.55;
export const ACTIVITY_VERY_ACTIVE = 1.725;
export const ACTIVITY_EXTRA_ACTIVE = 1.9;

export const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: ACTIVITY_SEDENTARY,
  "lightly active": ACTIVITY_LIGHTLY_ACTIVE,
  "moderately active": ACTIVITY_MODERATELY_ACTIVE,
  "very active": ACTIVITY_VERY_ACTIVE,
  "extra active": ACTIVITY_EXTRA_ACTIVE,
};

// ── Goal calorie deltas (kcal/day) ────────────────────────────────────────────

export const GOAL_DELTA_DEFICIT = -500;
export const GOAL_DELTA_MAINTENANCE = 0;
export const GOAL_DELTA_SURPLUS = 300;

export const GOAL_DELTAS: Record<string, number> = {
  deficit: GOAL_DELTA_DEFICIT,
  maintenance: GOAL_DELTA_MAINTENANCE,
  surplus: GOAL_DELTA_SURPLUS,
};

// ── Calorie floors (kcal/day) ─────────────────────────────────────────────────

export const CALORIE_FLOOR_FEMALE = 1200;
export const CALORIE_FLOOR_MALE = 1500;

// ── Protein targets (g/kg body weight) ───────────────────────────────────────

export const PROTEIN_FLOOR_G_PER_KG = 0.8;
export const PROTEIN_TARGET_DEFICIT_G_PER_KG = 1.6;
export const PROTEIN_TARGET_MAINTENANCE_G_PER_KG = 1.8;
export const PROTEIN_TARGET_SURPLUS_G_PER_KG = 2.2;
export const PROTEIN_KETO_CAP_G_PER_KG = 1.2;

export const PROTEIN_TARGETS_BY_GOAL: Record<string, number> = {
  deficit: PROTEIN_TARGET_DEFICIT_G_PER_KG,
  maintenance: PROTEIN_TARGET_MAINTENANCE_G_PER_KG,
  surplus: PROTEIN_TARGET_SURPLUS_G_PER_KG,
};

// ── Macro profile ratio table ─────────────────────────────────────────────────
// Ratios apply to remaining calories after protein is allocated.
// carbs + fat must sum to 1.0 for every profile.
// Cuisine style is a SEPARATE axis — it only flavors AI recipe selection,
// never changes these ratios.

export interface MacroRatio {
  carbs: number;
  fat: number;
}

export const MACRO_PROFILE_RATIOS: Record<string, MacroRatio> = {
  balanced: { carbs: 0.5, fat: 0.5 },
  "high-protein": { carbs: 0.6, fat: 0.4 },
  "low-carb": { carbs: 0.2, fat: 0.8 },
  keto: { carbs: 0.05, fat: 0.95 },
  mediterranean: { carbs: 0.55, fat: 0.45 },
};

// These are the ONLY valid macroProfile values the UI picker should render.
// Any other value will cause deriveMacros to throw.
export const VALID_MACRO_PROFILES = Object.keys(MACRO_PROFILE_RATIOS);

// ── Calorie-per-gram constants ────────────────────────────────────────────────

export const KCAL_PER_G_PROTEIN = 4;
export const KCAL_PER_G_CARB = 4;
export const KCAL_PER_G_FAT = 9;

// ── Macro targets result type ─────────────────────────────────────────────────

export interface MacroTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  clamped: boolean;
  clampExplanation: string;
}

// ── BMR (Mifflin–St Jeor) ─────────────────────────────────────────────────────

/**
 * @param weightKg  body weight in kilograms
 * @param heightCm  standing height in centimetres
 * @param age       age in years
 * @param sex       "male" | "female"
 */
export function calcBMR(
  weightKg: number,
  heightCm: number,
  age: number,
  sex: "male" | "female",
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

// ── TDEE ──────────────────────────────────────────────────────────────────────

/**
 * Multiply BMR by the activity multiplier.
 * Throws if activity level is not in ACTIVITY_MULTIPLIERS.
 */
export function calcTDEE(bmr: number, activityLevel: string): number {
  const mult = ACTIVITY_MULTIPLIERS[activityLevel.toLowerCase()];
  if (mult == null) {
    throw new Error(
      `Unknown activity level "${activityLevel}". Valid values: ${Object.keys(ACTIVITY_MULTIPLIERS).join(", ")}`,
    );
  }
  return Math.round(bmr * mult);
}

// ── Goal adjustment + floor clamp ────────────────────────────────────────────

/**
 * Applies the goal delta to TDEE and clamps to the sex-appropriate floor.
 * Returns both the target and an explanation if clamping occurred.
 */
export function applyGoal(
  tdee: number,
  goal: string,
  sex: "male" | "female",
): { calories: number; clamped: boolean; clampExplanation: string } {
  const delta = GOAL_DELTAS[goal.toLowerCase()];
  if (delta == null) {
    throw new Error(
      `Unknown goal "${goal}". Valid values: ${Object.keys(GOAL_DELTAS).join(", ")}`,
    );
  }
  const raw = tdee + delta;
  const floor = sex === "female" ? CALORIE_FLOOR_FEMALE : CALORIE_FLOOR_MALE;
  if (raw < floor) {
    return {
      calories: floor,
      clamped: true,
      clampExplanation: `Target of ${raw} kcal/day is below the ${floor} kcal/day safety floor for ${sex}s. Clamped to ${floor} kcal/day.`,
    };
  }
  return { calories: raw, clamped: false, clampExplanation: "" };
}

// ── deriveMacros ──────────────────────────────────────────────────────────────

/**
 * Given total daily calories, body weight, goal, and macroProfile, returns
 * the full macro breakdown.
 *
 * Algorithm:
 *   1. Determine protein target (g/kg), apply keto cap if macroProfile="keto"
 *   2. Subtract protein calories from total to get remaining calories
 *   3. Split remaining by the profile ratio table for carbs and fat
 *
 * Throws on unknown macroProfile so the caller never gets undefined silently.
 */
export function deriveMacros(
  totalCalories: number,
  weightKg: number,
  goal: string,
  macroProfile: string,
  sex: "male" | "female",
): MacroTargets {
  const profile = macroProfile.toLowerCase();
  const ratio = MACRO_PROFILE_RATIOS[profile];
  if (ratio == null) {
    throw new Error(
      `Unknown macroProfile "${macroProfile}". Valid profiles: ${VALID_MACRO_PROFILES.join(", ")}`,
    );
  }

  const goalKey = goal.toLowerCase();
  let proteinGPerKg = PROTEIN_TARGETS_BY_GOAL[goalKey] ?? PROTEIN_TARGET_MAINTENANCE_G_PER_KG;

  // Keto protein cap: strict keto keeps protein moderate to preserve ketosis
  if (profile === "keto") {
    proteinGPerKg = Math.min(proteinGPerKg, PROTEIN_KETO_CAP_G_PER_KG);
  }

  // Ensure protein never falls below the floor
  proteinGPerKg = Math.max(proteinGPerKg, PROTEIN_FLOOR_G_PER_KG);

  const proteinG = Math.round(weightKg * proteinGPerKg);
  const proteinCalories = proteinG * KCAL_PER_G_PROTEIN;

  const floor = sex === "female" ? CALORIE_FLOOR_FEMALE : CALORIE_FLOOR_MALE;
  const safeCalories = Math.max(totalCalories, floor);
  const clamped = safeCalories !== totalCalories;

  const remainingCalories = Math.max(safeCalories - proteinCalories, 0);
  const carbsG = Math.round((remainingCalories * ratio.carbs) / KCAL_PER_G_CARB);
  const fatG = Math.round((remainingCalories * ratio.fat) / KCAL_PER_G_FAT);

  return {
    calories: safeCalories,
    proteinG,
    carbsG,
    fatG,
    clamped,
    clampExplanation: clamped
      ? `Calories clamped to ${floor} kcal/day floor for ${sex}s.`
      : "",
  };
}

// ── distributeWeekly ──────────────────────────────────────────────────────────

export interface DayTypeMacros {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface WeeklyDistribution {
  training: DayTypeMacros;
  rest: DayTypeMacros;
}

/**
 * Distributes daily baseline macros into training-day and rest-day targets.
 *
 * Invariant: trainingDays * training.calories + restDays * rest.calories
 *             ≈ 7 * daily.calories  (within ±1 kcal rounding)
 *
 * Strategy: protein is held constant on both day types. On training days,
 * carbs are increased by ~15% of non-protein calories; fat fills the
 * remainder. Rest days absorb the reciprocal shift.
 */
export function distributeWeekly(
  daily: DayTypeMacros,
  trainingDays: number,
  restDays: number,
): WeeklyDistribution {
  if (trainingDays + restDays !== 7) {
    throw new Error("trainingDays + restDays must equal 7");
  }
  if (trainingDays < 0 || restDays < 0) {
    throw new Error("Day counts must be non-negative");
  }

  // When only one day type exists there is nothing to redistribute.
  // Return the baseline macros unchanged for both slots so the weekly
  // budget trivially holds.
  if (trainingDays === 0 || restDays === 0) {
    return {
      training: { calories: daily.calories, proteinG: daily.proteinG, carbsG: daily.carbsG, fatG: daily.fatG },
      rest: { calories: daily.calories, proteinG: daily.proteinG, carbsG: daily.carbsG, fatG: daily.fatG },
    };
  }

  const weeklyCalories = 7 * daily.calories;
  const proteinG = daily.proteinG;
  const proteinCalories = proteinG * KCAL_PER_G_PROTEIN;
  const nonProteinDaily = daily.calories - proteinCalories;

  // Training days get +15% of non-protein calories
  const trainingNonProtein = Math.round(nonProteinDaily * 1.15);

  // Rest days absorb the deficit so the weekly budget is balanced
  const restNonProtein = Math.round(
    (weeklyCalories - trainingDays * (proteinCalories + trainingNonProtein) - restDays * proteinCalories) / restDays,
  );

  // Training days: more carbs (70% of non-protein remaining → carbs)
  const trainingCarbsG = Math.round((trainingNonProtein * 0.65) / KCAL_PER_G_CARB);
  const trainingFatG = Math.round((trainingNonProtein * 0.35) / KCAL_PER_G_FAT);
  const trainingCalories = proteinCalories + trainingNonProtein;

  // Rest days: fewer carbs (35% of non-protein → carbs)
  const restCarbsG = Math.round((restNonProtein * 0.4) / KCAL_PER_G_CARB);
  const restFatG = Math.round((restNonProtein * 0.6) / KCAL_PER_G_FAT);
  const restCalories = proteinCalories + restNonProtein;

  // Budget assertion: total weekly calories must balance within ±7 kcal
  // (one kcal/day of rounding tolerance per day).
  const computedWeekly =
    trainingDays * trainingCalories + restDays * restCalories;
  const budgetDrift = Math.abs(computedWeekly - weeklyCalories);
  if (budgetDrift > 7) {
    throw new Error(
      `distributeWeekly: weekly budget drift of ${budgetDrift} kcal exceeds tolerance. ` +
        `Expected ${weeklyCalories} kcal, computed ${computedWeekly} kcal.`,
    );
  }

  return {
    training: { calories: trainingCalories, proteinG, carbsG: trainingCarbsG, fatG: trainingFatG },
    rest: { calories: restCalories, proteinG, carbsG: restCarbsG, fatG: restFatG },
  };
}

// ── splitMeals ────────────────────────────────────────────────────────────────

export interface MealTarget {
  slotIndex: number;
  slotName: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/**
 * Splits day-type macro totals into per-meal targets.
 * Protein is split evenly. Carbs are front-loaded (earlier meals get more).
 * Fat fills the remainder for each slot.
 *
 * @param dayMacros  total macros for the day type
 * @param mealsPerDay  1, 2, or 3
 * @param isTrainingDay  if true, carbs are weighted slightly more to earlier slots
 */
export function splitMeals(
  dayMacros: DayTypeMacros,
  mealsPerDay: number,
): MealTarget[] {
  if (mealsPerDay < 1 || mealsPerDay > 4) {
    throw new Error("mealsPerDay must be between 1 and 4");
  }

  const slotNames = ["Breakfast", "Lunch", "Dinner", "Snack"].slice(0, mealsPerDay);

  // Carb weights: front-loaded (breakfast and lunch get more carbs than dinner)
  const carbWeights: Record<number, number[]> = {
    1: [1.0],
    2: [0.55, 0.45],
    3: [0.4, 0.35, 0.25],
    4: [0.35, 0.3, 0.25, 0.1],
  };

  // Calorie weights: broadly even but breakfast and lunch slightly higher
  const calWeights: Record<number, number[]> = {
    1: [1.0],
    2: [0.5, 0.5],
    3: [0.33, 0.37, 0.3],
    4: [0.25, 0.3, 0.28, 0.17],
  };

  const cw = carbWeights[mealsPerDay]!;
  const wt = calWeights[mealsPerDay]!;
  const proteinPerMeal = Math.floor(dayMacros.proteinG / mealsPerDay);
  const proteinRemainder = dayMacros.proteinG - proteinPerMeal * mealsPerDay;

  const meals: MealTarget[] = slotNames.map((slotName, i) => {
    const carbsG = Math.round(dayMacros.carbsG * cw[i]!);
    const calories = Math.round(dayMacros.calories * wt[i]!);
    const proteinG = i === 0 ? proteinPerMeal + proteinRemainder : proteinPerMeal;
    const proteinCal = proteinG * KCAL_PER_G_PROTEIN;
    const carbsCal = carbsG * KCAL_PER_G_CARB;
    const remainingForFat = Math.max(calories - proteinCal - carbsCal, 0);
    const fatG = Math.round(remainingForFat / KCAL_PER_G_FAT);
    return { slotIndex: i, slotName, calories, proteinG, carbsG, fatG };
  });

  return meals;
}

// ── batchQuantity ─────────────────────────────────────────────────────────────

/**
 * For prepped meals: total quantity needed for the week.
 * recurrence = how many times this day type appears in the week.
 */
export function batchQuantity(perServingAmount: number, recurrence: number): number {
  return perServingAmount * recurrence;
}

// ── buildShoppingList ─────────────────────────────────────────────────────────

export interface ShoppingItem {
  name: string;
  quantity: number;
  unit: string;
  forMeal: string;
  // prepMode distinguishes batch-cooked items (multiplied by weekly recurrence)
  // from cook-to-order items (quantity is per single occurrence).
  prepMode: "prep" | "cook";
}

/**
 * Aggregates ingredients from all meals into a shopping / prep list.
 *
 * prep meals — quantity multiplied by the week's recurrence (batch-cook once).
 * cook meals — quantity is per single occurrence; listed at face value so the
 *              user knows what to buy/use each time they cook that meal.
 *
 * Items with identical name+unit across different slots are aggregated only
 * when they share the same prepMode; otherwise they remain separate entries so
 * the batch-prep and cook-to-order sections stay logically distinct.
 *
 * @param dayTypeMeals  array of { slotName, prepMode, recurrence, ingredients }
 */
export function buildShoppingList(
  dayTypeMeals: Array<{
    slotName: string;
    prepMode: "prep" | "cook";
    recurrence: number;
    ingredients: Array<{ name: string; quantityPerServing: number; unit: string }>;
  }>,
): ShoppingItem[] {
  const aggregated = new Map<string, ShoppingItem>();

  for (const meal of dayTypeMeals) {
    for (const ing of meal.ingredients) {
      // prep: multiply by recurrence (batch total for the week)
      // cook: per-occurrence quantity (do NOT multiply)
      const qty =
        meal.prepMode === "prep"
          ? batchQuantity(ing.quantityPerServing, meal.recurrence)
          : ing.quantityPerServing;

      // Include prepMode in the aggregation key so prep and cook entries
      // never collapse into each other.
      const key = `${ing.name.toLowerCase()}__${ing.unit.toLowerCase()}__${meal.prepMode}`;
      const existing = aggregated.get(key);
      if (existing) {
        existing.quantity += qty;
      } else {
        aggregated.set(key, {
          name: ing.name,
          quantity: qty,
          unit: ing.unit,
          forMeal: meal.slotName,
          prepMode: meal.prepMode,
        });
      }
    }
  }

  return Array.from(aggregated.values()).map((item) => ({
    ...item,
    quantity: Math.round(item.quantity * 100) / 100,
  }));
}
