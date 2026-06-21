/**
 * Deterministic unit tests for the meal calculation engine.
 *
 * These tests cover the pure-function invariants that the rest of the
 * meal-planning pipeline depends on:
 *   - BMR and TDEE arithmetic
 *   - Calorie floor clamps (female 1200, male 1500)
 *   - Keto protein cap
 *   - Weekly budget reconciliation (distributeWeekly assertion)
 *   - splitMeals macro distribution and carb front-loading
 *   - batchQuantity arithmetic
 *   - buildShoppingList cook-vs-prep semantics
 *
 * Run with: pnpm --filter @workspace/api-server run test:mealcalc
 */

import {
  calcBMR,
  calcTDEE,
  applyGoal,
  deriveMacros,
  distributeWeekly,
  splitMeals,
  batchQuantity,
  buildShoppingList,
  CALORIE_FLOOR_FEMALE,
  CALORIE_FLOOR_MALE,
  PROTEIN_KETO_CAP_G_PER_KG,
  KCAL_PER_G_PROTEIN,
  KCAL_PER_G_CARB,
  KCAL_PER_G_FAT,
} from "./mealCalc";

let passed = 0;
let failed = 0;

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    failed++;
    console.error(`FAIL: ${msg}`);
    throw new Error(`ASSERT FAILED: ${msg}`);
  }
  passed++;
  console.log(`PASS: ${msg}`);
}

function assertClose(actual: number, expected: number, tolerance: number, msg: string): void {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    failed++;
    console.error(`FAIL: ${msg} (got ${actual}, expected ${expected} ±${tolerance}, diff=${diff})`);
    throw new Error(`ASSERT CLOSE FAILED: ${msg}`);
  }
  passed++;
  console.log(`PASS: ${msg} (${actual} ≈ ${expected} ±${tolerance})`);
}

function assertThrows(fn: () => unknown, msg: string): void {
  try {
    fn();
    failed++;
    console.error(`FAIL: ${msg} — expected throw but did not`);
    throw new Error(`ASSERT THROWS FAILED: ${msg}`);
  } catch {
    passed++;
    console.log(`PASS: ${msg}`);
  }
}

// ── calcBMR ───────────────────────────────────────────────────────────────────

{
  // Male: 10*70 + 6.25*175 - 5*30 + 5 = 700 + 1093.75 - 150 + 5 = 1648.75
  const bmr = calcBMR(70, 175, 30, "male");
  assertClose(bmr, 1648.75, 0.01, "BMR male 70kg 175cm age 30");
}

{
  // Female: 10*60 + 6.25*165 - 5*25 - 161 = 600 + 1031.25 - 125 - 161 = 1345.25
  const bmr = calcBMR(60, 165, 25, "female");
  assertClose(bmr, 1345.25, 0.01, "BMR female 60kg 165cm age 25");
}

// ── calcTDEE ──────────────────────────────────────────────────────────────────

{
  const tdee = calcTDEE(1600, "moderately active");
  assertClose(tdee, Math.round(1600 * 1.55), 1, "TDEE moderately active");
}

{
  assertThrows(() => calcTDEE(1600, "couch potato"), "calcTDEE throws on unknown activity level");
}

// ── applyGoal + calorie floor clamp ──────────────────────────────────────────

{
  // 2000 - 500 = 1500, exactly the male floor — not clamped (not below the floor)
  const { calories, clamped } = applyGoal(2000, "deficit", "male");
  assertClose(calories, 1500, 0, "deficit male 2000 TDEE → 1500 kcal (at floor, not clamped)");
  assert(!clamped, "2000-500=1500 == male floor but not below it, should not clamp");
}

{
  // 2000 - 500 = 1500 >= 1200 female floor — not clamped
  const { calories, clamped } = applyGoal(2000, "deficit", "female");
  assertClose(calories, 1500, 0, "deficit female 2000 TDEE → 1500 kcal (above floor)");
  assert(!clamped, "2000-500=1500 >= 1200 female floor, should not clamp");
}

{
  // 1500 - 500 = 1000 < 1200 female floor → clamp triggers
  const { calories, clamped, clampExplanation } = applyGoal(1500, "deficit", "female");
  assertClose(calories, CALORIE_FLOOR_FEMALE, 0, "deficit female 1500 TDEE → floor 1200");
  assert(clamped, "1500-500=1000 < 1200 female floor, should clamp");
  assert(clampExplanation.length > 0, "clampExplanation is non-empty when clamped");
}

{
  // 1700 - 500 = 1200 < 1500 male floor → clamp triggers
  const { calories, clamped } = applyGoal(1700, "deficit", "male");
  assertClose(calories, CALORIE_FLOOR_MALE, 0, "deficit male 1700 TDEE → floor 1500");
  assert(clamped, "1700-500=1200 < 1500 male floor, should clamp");
}

{
  assertThrows(() => applyGoal(2000, "bulk", "male"), "applyGoal throws on unknown goal");
}

// ── deriveMacros: keto protein cap ───────────────────────────────────────────

{
  // Keto should cap protein at PROTEIN_KETO_CAP_G_PER_KG * weightKg
  const macros = deriveMacros(2000, 80, "surplus", "keto", "male");
  const expectedProteinCap = Math.round(80 * PROTEIN_KETO_CAP_G_PER_KG);
  assertClose(macros.proteinG, expectedProteinCap, 2, "keto protein cap applied for surplus");
}

{
  // Non-keto surplus should use 2.2 g/kg (not capped)
  const macros = deriveMacros(2500, 80, "surplus", "balanced", "male");
  const expectedProtein = Math.round(80 * 2.2);
  assertClose(macros.proteinG, expectedProtein, 2, "balanced surplus protein 2.2g/kg");
}

{
  // Macros should satisfy: proteinCal + carbsCal + fatCal ≈ totalCal (within ±20 due to rounding)
  const macros = deriveMacros(2200, 75, "maintenance", "high-protein", "female");
  const reconstructed = macros.proteinG * KCAL_PER_G_PROTEIN + macros.carbsG * KCAL_PER_G_CARB + macros.fatG * KCAL_PER_G_FAT;
  assertClose(reconstructed, macros.calories, 20, "macro calories reconstruct to total within 20 kcal");
}

{
  assertThrows(() => deriveMacros(2000, 75, "maintenance", "paleo", "male"), "deriveMacros throws on unknown profile");
}

// ── distributeWeekly: budget reconciliation ───────────────────────────────────

{
  const daily = { calories: 2200, proteinG: 160, carbsG: 200, fatG: 78 };
  const dist = distributeWeekly(daily, 4, 3);

  const weeklyBudget = 7 * daily.calories;
  const computed = 4 * dist.training.calories + 3 * dist.rest.calories;
  assert(Math.abs(computed - weeklyBudget) <= 7, "distributeWeekly 4T/3R weekly budget within ±7 kcal");

  assert(dist.training.calories > dist.rest.calories, "training days have more calories than rest days");
  assert(dist.training.proteinG === dist.rest.proteinG, "protein is identical on training and rest days");
  assert(dist.training.carbsG > dist.rest.carbsG, "training days have more carbs than rest days");
}

{
  // Edge case: all training days (0 rest) — no redistribution possible, daily macros pass through unchanged
  const daily = { calories: 2000, proteinG: 140, carbsG: 180, fatG: 70 };
  const dist = distributeWeekly(daily, 7, 0);
  assertClose(dist.training.calories, daily.calories, 0, "distributeWeekly 7T/0R training calories == daily (no redistribution)");
  assertClose(dist.rest.calories, daily.calories, 0, "distributeWeekly 7T/0R rest calories == daily (no redistribution)");
  const weeklyBudget = 7 * daily.calories;
  const computed = 7 * dist.training.calories;
  assert(Math.abs(computed - weeklyBudget) <= 7, "distributeWeekly 7T/0R weekly budget balanced");
}

{
  assertThrows(() => distributeWeekly({ calories: 2000, proteinG: 140, carbsG: 180, fatG: 70 }, 3, 3), "distributeWeekly throws when training+rest != 7");
}

// ── splitMeals ────────────────────────────────────────────────────────────────

{
  const dayMacros = { calories: 2200, proteinG: 160, carbsG: 200, fatG: 80 };
  const meals = splitMeals(dayMacros, 3);

  assert(meals.length === 3, "splitMeals 3 meals returns 3 slots");
  assert(meals[0]!.slotName === "Breakfast", "first slot is Breakfast");
  assert(meals[2]!.slotName === "Dinner", "last slot is Dinner");

  // Calories should sum to within ±10 kcal of day total
  const calSum = meals.reduce((s, m) => s + m.calories, 0);
  assertClose(calSum, dayMacros.calories, 10, "splitMeals 3 calorie sum matches day total");

  // Protein should sum to within ±mealsPerDay of day total (floor rounding)
  const protSum = meals.reduce((s, m) => s + m.proteinG, 0);
  assertClose(protSum, dayMacros.proteinG, 3, "splitMeals 3 protein sum matches day total");

  // Carbs front-loading: breakfast carbs >= dinner carbs
  assert(meals[0]!.carbsG >= meals[2]!.carbsG, "breakfast carbs >= dinner carbs (front-loaded)");
}

{
  assertThrows(() => splitMeals({ calories: 2000, proteinG: 140, carbsG: 180, fatG: 70 }, 5), "splitMeals throws for mealsPerDay > 4");
}

// ── batchQuantity ─────────────────────────────────────────────────────────────

{
  assertClose(batchQuantity(200, 4), 800, 0, "batchQuantity 200g × 4 = 800g");
  assertClose(batchQuantity(1.5, 7), 10.5, 0.001, "batchQuantity 1.5 cups × 7 = 10.5 cups");
}

// ── buildShoppingList: prep vs cook semantics ─────────────────────────────────

{
  const input = [
    {
      slotName: "Breakfast",
      prepMode: "prep" as const,
      recurrence: 4,
      ingredients: [{ name: "Oats", quantityPerServing: 80, unit: "g" }],
    },
    {
      slotName: "Dinner",
      prepMode: "cook" as const,
      recurrence: 4,
      ingredients: [{ name: "Chicken Breast", quantityPerServing: 200, unit: "g" }],
    },
  ];
  const list = buildShoppingList(input);

  const oats = list.find((i) => i.name === "Oats");
  const chicken = list.find((i) => i.name === "Chicken Breast");

  assert(oats !== undefined, "Oats appears in shopping list");
  assert(chicken !== undefined, "Chicken Breast appears in shopping list");

  // Prep: 80 × 4 = 320g (batch total)
  assertClose(oats!.quantity, 320, 0.01, "prep Oats quantity is batched (80×4=320g)");
  assert(oats!.prepMode === "prep", "Oats prepMode is 'prep'");

  // Cook: 200g per occurrence (NOT multiplied by recurrence)
  assertClose(chicken!.quantity, 200, 0.01, "cook Chicken Breast quantity is per-occurrence (200g)");
  assert(chicken!.prepMode === "cook", "Chicken Breast prepMode is 'cook'");
}

{
  // Same ingredient appears in two prep meals — quantities should aggregate
  const input = [
    {
      slotName: "Breakfast",
      prepMode: "prep" as const,
      recurrence: 3,
      ingredients: [{ name: "Brown Rice", quantityPerServing: 100, unit: "g" }],
    },
    {
      slotName: "Lunch",
      prepMode: "prep" as const,
      recurrence: 3,
      ingredients: [{ name: "Brown Rice", quantityPerServing: 150, unit: "g" }],
    },
  ];
  const list = buildShoppingList(input);
  const rice = list.find((i) => i.name === "Brown Rice");
  // 100×3 + 150×3 = 750g
  assertClose(rice!.quantity, 750, 0.01, "same ingredient in two prep meals aggregates correctly (750g)");
}

{
  // Same ingredient as both prep and cook — must produce TWO separate entries
  const input = [
    {
      slotName: "Breakfast",
      prepMode: "prep" as const,
      recurrence: 3,
      ingredients: [{ name: "Eggs", quantityPerServing: 2, unit: "whole" }],
    },
    {
      slotName: "Dinner",
      prepMode: "cook" as const,
      recurrence: 3,
      ingredients: [{ name: "Eggs", quantityPerServing: 2, unit: "whole" }],
    },
  ];
  const list = buildShoppingList(input);
  const eggEntries = list.filter((i) => i.name === "Eggs");
  assert(eggEntries.length === 2, "same ingredient in prep and cook yields two separate list entries");
  const prepEgg = eggEntries.find((i) => i.prepMode === "prep");
  const cookEgg = eggEntries.find((i) => i.prepMode === "cook");
  assertClose(prepEgg!.quantity, 6, 0.01, "prep Eggs quantity is batched (2×3=6)");
  assertClose(cookEgg!.quantity, 2, 0.01, "cook Eggs quantity is per-occurrence (2)");
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
