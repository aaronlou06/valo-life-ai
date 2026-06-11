import React, { useState } from "react";
import {
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

const BG = "#F7F5F2";
const CARD = "#FFFFFF";
const BORDER = "#E8E4DE";
const SLATE = "#1A1814";
const MUTED = "#8B8780";
const TERRA = "#C17B3F";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEAL_SLOTS = ["Breakfast", "Lunch", "Dinner"];
const CATEGORIES = ["All", "High-Protein", "Quick", "Vegetarian"];

type Meal = { name: string; kcal: number };
type DayPlan = { Breakfast?: Meal; Lunch?: Meal; Dinner?: Meal };

const SEED_PLANS: Record<string, DayPlan> = {
  Tue: {
    Breakfast: { name: "Greek Yogurt & Berries", kcal: 320 },
    Lunch: { name: "Grilled Chicken Salad", kcal: 480 },
  },
};

type Recipe = {
  id: string;
  title: string;
  time: string;
  kcal: number;
  category: string;
  color: string;
  ingredients: string[];
  steps: string[];
};

const RECIPES: Recipe[] = [
  { id: "1", title: "Lemon Herb Salmon", time: "25 min", kcal: 520, category: "High-Protein", color: "#FDDCB5", ingredients: ["2 salmon fillets", "2 tbsp olive oil", "1 lemon", "Herbs (dill, parsley)", "Salt & pepper"], steps: ["Preheat oven to 400°F.", "Season salmon with oil, lemon, herbs.", "Bake 15–18 min until flaky.", "Serve with greens."] },
  { id: "2", title: "Quinoa Buddha Bowl", time: "20 min", kcal: 440, category: "Vegetarian", color: "#C5E8C5", ingredients: ["1 cup quinoa", "Roasted veggies", "Chickpeas", "Tahini dressing", "Greens"], steps: ["Cook quinoa per package.", "Roast veggies at 425°F for 20 min.", "Assemble bowl, drizzle tahini."] },
  { id: "3", title: "15-Min Egg Fried Rice", time: "15 min", kcal: 390, category: "Quick", ingredients: ["2 cups cooked rice", "3 eggs", "Soy sauce", "Sesame oil", "Scallions"], color: "#FFF3CD", steps: ["Heat sesame oil in wok.", "Scramble eggs, add rice.", "Season with soy sauce, top with scallions."] },
  { id: "4", title: "Chicken & Veggie Stir-Fry", time: "20 min", kcal: 460, category: "High-Protein", color: "#D5EAF5", ingredients: ["300g chicken breast", "Bell peppers", "Broccoli", "Garlic", "Soy + oyster sauce"], steps: ["Slice chicken, marinate in soy.", "Stir-fry garlic, add chicken.", "Add veggies, sauce, cook 5 min."] },
  { id: "5", title: "Avocado Toast", time: "5 min", kcal: 310, category: "Quick", color: "#E8F5E9", ingredients: ["2 slices sourdough", "1 ripe avocado", "Lemon juice", "Red pepper flakes", "Everything bagel seasoning"], steps: ["Toast bread.", "Mash avocado with lemon.", "Spread on toast, season to taste."] },
  { id: "6", title: "Black Bean Tacos", time: "15 min", kcal: 380, category: "Vegetarian", color: "#F5E6CC", ingredients: ["1 can black beans", "Corn tortillas", "Cabbage slaw", "Salsa", "Lime + cilantro"], steps: ["Warm beans with cumin.", "Heat tortillas.", "Fill with beans, slaw, salsa."] },
];

const WEEKLY_KCAL: Record<string, number> = {
  Mon: 1850, Tue: 1920, Wed: 2100, Thu: 1780, Fri: 2040, Sat: 1650, Sun: 1900,
};

export default function MealPlanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tab, setTab] = useState<"Plan" | "Recipes">("Plan");
  const [selectedDay, setSelectedDay] = useState("Tue");
  const [plans, setPlans] = useState<Record<string, DayPlan>>(SEED_PLANS);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);

  const filteredRecipes = RECIPES.filter((r) => {
    const matchCat = category === "All" || r.category === category;
    const matchSearch = r.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  function addToPlan(recipe: Recipe) {
    const day = plans[selectedDay] || {};
    const slot = !day.Breakfast ? "Breakfast" : !day.Lunch ? "Lunch" : "Dinner";
    setPlans({ ...plans, [selectedDay]: { ...day, [slot]: { name: recipe.title, kcal: recipe.kcal } } });
    setSelectedRecipe(null);
  }

  async function shareRecipe(recipe: Recipe) {
    try {
      await Share.share({ message: `${recipe.title} — ${recipe.time}, ${recipe.kcal} kcal. Try it with Valo: https://valo.app/recipes/${recipe.id}` });
    } catch {}
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: BORDER }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={TERRA} />
        </TouchableOpacity>
        <Text style={[styles.title, { fontFamily: "Inter_600SemiBold" }]}>Meal Planner</Text>
        <View style={styles.iconBtn} />
      </View>

      <View style={styles.tabBar}>
        {(["Plan", "Recipes"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            activeOpacity={0.7}
            style={[styles.tabItem, { borderBottomColor: tab === t ? TERRA : "transparent", borderBottomWidth: 2 }]}
          >
            <Text style={[styles.tabText, { color: tab === t ? TERRA : MUTED, fontFamily: tab === t ? "Inter_600SemiBold" : "Inter_400Regular" }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "Plan" ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayStrip}>
            {DAYS.map((d) => (
              <TouchableOpacity key={d} onPress={() => setSelectedDay(d)} activeOpacity={0.7}
                style={[styles.dayPill, { backgroundColor: selectedDay === d ? TERRA : CARD, borderColor: selectedDay === d ? TERRA : BORDER }]}>
                <Text style={[styles.dayText, { color: selectedDay === d ? "#FFFFFF" : MUTED, fontFamily: "Inter_600SemiBold" }]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={[styles.card]}>
            {MEAL_SLOTS.map((slot, i) => {
              const meal = (plans[selectedDay] as Record<string, Meal | undefined> | undefined)?.[slot];
              return (
                <View key={slot} style={[styles.mealRow, { borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: BORDER }]}>
                  <Text style={[styles.slotLabel, { fontFamily: "Inter_600SemiBold" }]}>{slot}</Text>
                  {meal ? (
                    <View style={styles.mealRight}>
                      <Text style={[styles.mealName, { fontFamily: "Inter_400Regular" }]}>{meal.name}</Text>
                      <View style={[styles.kcalBadge, { backgroundColor: `${TERRA}18` }]}>
                        <Text style={[styles.kcalText, { color: TERRA, fontFamily: "Inter_600SemiBold" }]}>{meal.kcal} kcal</Text>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={() => setTab("Recipes")} activeOpacity={0.7} style={styles.addMealBtn}>
                      <Feather name="plus" size={14} color={MUTED} />
                      <Text style={[styles.addMealText, { fontFamily: "Inter_400Regular" }]}>Add meal</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>

          <Text style={[styles.sectionLabel, { fontFamily: "Inter_600SemiBold" }]}>Weekly Summary</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
            {DAYS.map((d) => (
              <View key={d} style={[styles.kcalPill, { backgroundColor: d === selectedDay ? `${TERRA}18` : CARD, borderColor: BORDER }]}>
                <Text style={[styles.kcalPillDay, { fontFamily: "Inter_600SemiBold", color: MUTED }]}>{d}</Text>
                <Text style={[styles.kcalPillVal, { fontFamily: "Inter_700Bold", color: TERRA }]}>{WEEKLY_KCAL[d]}</Text>
              </View>
            ))}
          </ScrollView>
        </ScrollView>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
          <View style={[styles.searchBar, { borderColor: BORDER }]}>
            <Feather name="search" size={16} color={MUTED} />
            <TextInput
              placeholder="Search recipes..."
              placeholderTextColor={MUTED}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={[styles.searchInput, { fontFamily: "Inter_400Regular" }]}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catStrip}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity key={c} onPress={() => setCategory(c)} activeOpacity={0.7}
                style={[styles.catChip, { backgroundColor: category === c ? TERRA : CARD, borderColor: category === c ? TERRA : BORDER }]}>
                <Text style={[styles.catText, { color: category === c ? "#FFFFFF" : MUTED, fontFamily: "Inter_500Medium" }]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.recipeGrid}>
            {filteredRecipes.map((r) => (
              <TouchableOpacity key={r.id} onPress={() => setSelectedRecipe(r)} activeOpacity={0.8} style={[styles.recipeCard, { borderColor: BORDER }]}>
                <View style={[styles.recipeThumb, { backgroundColor: r.color }]} />
                <View style={{ padding: 10 }}>
                  <Text style={[styles.recipeTitle, { fontFamily: "Inter_600SemiBold" }]}>{r.title}</Text>
                  <View style={styles.recipeMeta}>
                    <View style={[styles.badge, { backgroundColor: `${MUTED}18` }]}>
                      <Text style={[styles.badgeText, { fontFamily: "Inter_400Regular" }]}>{r.time}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: `${TERRA}18` }]}>
                      <Text style={[styles.badgeText, { color: TERRA, fontFamily: "Inter_400Regular" }]}>{r.kcal} kcal</Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      <Modal visible={!!selectedRecipe} animationType="slide" presentationStyle="pageSheet">
        {selectedRecipe && (
          <View style={{ flex: 1, backgroundColor: BG }}>
            <View style={[styles.modalHeader, { paddingTop: 20, borderBottomColor: BORDER }]}>
              <TouchableOpacity onPress={() => setSelectedRecipe(null)} activeOpacity={0.7} style={styles.iconBtn}>
                <Feather name="x" size={22} color={SLATE} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>{selectedRecipe.title}</Text>
              <TouchableOpacity onPress={() => shareRecipe(selectedRecipe)} activeOpacity={0.7} style={styles.iconBtn}>
                <Feather name="share-2" size={20} color={TERRA} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              <View style={[styles.recipeHero, { backgroundColor: selectedRecipe.color }]} />
              <View style={{ padding: 16 }}>
                <View style={styles.recipeMeta}>
                  <View style={[styles.badge, { backgroundColor: `${MUTED}18` }]}>
                    <Text style={[styles.badgeText, { fontFamily: "Inter_400Regular" }]}>{selectedRecipe.time}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: `${TERRA}18` }]}>
                    <Text style={[styles.badgeText, { color: TERRA, fontFamily: "Inter_400Regular" }]}>{selectedRecipe.kcal} kcal</Text>
                  </View>
                </View>

                <Text style={[styles.detailSection, { fontFamily: "Inter_600SemiBold" }]}>Ingredients</Text>
                {selectedRecipe.ingredients.map((ing, i) => (
                  <Text key={i} style={[styles.detailItem, { fontFamily: "Inter_400Regular" }]}>· {ing}</Text>
                ))}

                <Text style={[styles.detailSection, { fontFamily: "Inter_600SemiBold" }]}>Steps</Text>
                {selectedRecipe.steps.map((step, i) => (
                  <Text key={i} style={[styles.detailItem, { fontFamily: "Inter_400Regular" }]}>{i + 1}. {step}</Text>
                ))}

                <View style={styles.videoPlaceholder}>
                  <Feather name="play-circle" size={40} color={MUTED} />
                  <Text style={[styles.videoText, { fontFamily: "Inter_400Regular" }]}>Video coming soon</Text>
                  {/* TODO: embed recipe video */}
                </View>

                <TouchableOpacity onPress={() => addToPlan(selectedRecipe)} activeOpacity={0.8} style={styles.addToPlanBtn}>
                  <Text style={[styles.addToPlanText, { fontFamily: "Inter_600SemiBold" }]}>
                    Add to {selectedDay}'s plan
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: BG,
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, color: SLATE },
  tabBar: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER, backgroundColor: CARD },
  tabItem: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabText: { fontSize: 14 },
  dayStrip: { flexGrow: 0, marginBottom: 16 },
  dayPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  dayText: { fontSize: 13 },
  card: {
    backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
    marginBottom: 20,
  },
  mealRow: { flexDirection: "row", alignItems: "center", padding: 14, justifyContent: "space-between" },
  slotLabel: { fontSize: 13, color: SLATE, width: 80 },
  mealRight: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  mealName: { fontSize: 13, color: SLATE, flex: 1 },
  kcalBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  kcalText: { fontSize: 11 },
  addMealBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  addMealText: { fontSize: 13, color: MUTED },
  sectionLabel: { fontSize: 13, color: SLATE, marginBottom: 12 },
  kcalPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, marginRight: 8, alignItems: "center" },
  kcalPillDay: { fontSize: 11 },
  kcalPillVal: { fontSize: 14 },
  searchBar: { flexDirection: "row", alignItems: "center", backgroundColor: CARD, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, marginBottom: 12, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: SLATE, paddingVertical: 10 },
  catStrip: { flexGrow: 0, marginBottom: 16 },
  catChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  catText: { fontSize: 13 },
  recipeGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 12 },
  recipeCard: {
    width: "48%", backgroundColor: CARD, borderRadius: 12, borderWidth: 1, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  recipeThumb: { width: "100%", height: 90 },
  recipeTitle: { fontSize: 13, color: SLATE, marginBottom: 6 },
  recipeMeta: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginBottom: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, color: MUTED },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: BG,
  },
  modalTitle: { fontSize: 16, color: SLATE, flex: 1, textAlign: "center" },
  recipeHero: { width: "100%", height: 200 },
  detailSection: { fontSize: 14, color: SLATE, marginTop: 20, marginBottom: 8 },
  detailItem: { fontSize: 13, color: SLATE, lineHeight: 22 },
  videoPlaceholder: {
    marginTop: 24,
    height: 160,
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  videoText: { fontSize: 13, color: MUTED },
  addToPlanBtn: { marginTop: 24, backgroundColor: TERRA, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  addToPlanText: { color: "#FFFFFF", fontSize: 15 },
});
