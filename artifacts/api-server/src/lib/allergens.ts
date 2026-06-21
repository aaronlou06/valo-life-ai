// ALLERGEN_DERIVATIVES: canonical map of 8 major allergens to their common
// derivatives. Used in:
//   1. Generation prompt — listed verbatim so the model cannot propose a derivative
//   2. Validation — ingredient names are lowercased and checked against all terms
//
// Rule: allergen exclusion is ABSOLUTE. Any match (allergen or derivative) must
// reject the ingredient and re-prompt, never silently accept.

export const ALLERGEN_DERIVATIVES: Record<string, string[]> = {
  peanut: ["peanut oil", "peanut butter", "groundnut", "arachis oil"],
  "tree nut": [
    "almond", "cashew", "walnut", "pecan", "pistachio", "hazelnut",
    "macadamia", "brazil nut", "nut oil", "marzipan",
  ],
  "milk": [
    "whey", "casein", "lactose", "butter", "ghee", "cream", "cheese",
    "yoghurt", "yogurt", "lactalbumin",
  ],
  egg: ["albumin", "mayonnaise", "meringue", "lecithin"],
  soy: [
    "tofu", "tempeh", "edamame", "miso", "tamari",
    "textured vegetable protein", "tvp", "soya",
  ],
  wheat: [
    "flour", "bread", "pasta", "semolina", "spelt", "farro",
    "durum", "bulgur", "couscous", "gluten",
  ],
  shellfish: [
    "shrimp", "prawn", "crab", "lobster", "crayfish",
    "scallop", "oyster", "clam", "mussel", "squid",
  ],
  fish: [
    "anchovy", "sardine", "tuna", "salmon", "cod", "tilapia",
    "fish sauce", "worcestershire sauce",
  ],
};

// Returns the full set of forbidden terms for a given list of active allergen keys.
export function buildAllergenTerms(activeAllergens: string[]): string[] {
  const terms: string[] = [];
  for (const allergen of activeAllergens) {
    const key = allergen.toLowerCase();
    terms.push(key);
    const derivatives = ALLERGEN_DERIVATIVES[key];
    if (derivatives) terms.push(...derivatives);
  }
  return terms;
}

// Returns true if the ingredient name contains any allergen term.
export function ingredientContainsAllergen(
  ingredientName: string,
  allergenTerms: string[],
): boolean {
  const lower = ingredientName.toLowerCase();
  return allergenTerms.some((term) => lower.includes(term));
}

// Builds the allergen restriction block for the generation prompt.
export function buildAllergenPromptBlock(activeAllergens: string[]): string {
  if (activeAllergens.length === 0) return "None";
  return activeAllergens
    .map((a) => {
      const key = a.toLowerCase();
      const derivs = ALLERGEN_DERIVATIVES[key];
      if (derivs && derivs.length > 0) {
        return `${a} (and derivatives: ${derivs.join(", ")})`;
      }
      return a;
    })
    .join("\n");
}
