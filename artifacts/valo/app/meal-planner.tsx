import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useValoAuth } from "@/contexts/AuthContext";
import { trackEvent } from "@/services/telemetry";

const PLAN_STORAGE_KEY = "valo:meal_plan_v1";

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

// ── Types ────────────────────────────────────────────────────────────────────

interface MealEntry {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  prep_mins: number;
}

interface DayPlan {
  day: number;
  dayName: string;
  meals: {
    breakfast: MealEntry;
    lunch: MealEntry;
    dinner: MealEntry;
    snack: MealEntry;
  };
  totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
}

interface ShoppingCategory {
  category: string;
  items: string[];
}

interface MealPlan {
  days: DayPlan[];
  shoppingList: ShoppingCategory[];
  weeklyMacros: { avg_calories: number; avg_protein_g: number; avg_carbs_g: number; avg_fat_g: number };
  estimatedWeeklyBudget: string;
}

type DietType = "balanced" | "high-protein" | "keto" | "vegetarian" | "vegan" | "mediterranean";
type BudgetType = "low" | "moderate" | "high";
type Tab = "plan" | "groceries";
type MealKey = "breakfast" | "lunch" | "dinner" | "snack";

const DIET_OPTIONS: { key: DietType; label: string }[] = [
  { key: "balanced", label: "Balanced" },
  { key: "high-protein", label: "High Protein" },
  { key: "keto", label: "Keto" },
  { key: "vegetarian", label: "Vegetarian" },
  { key: "vegan", label: "Vegan" },
  { key: "mediterranean", label: "Mediterranean" },
];

const BUDGET_OPTIONS: { key: BudgetType; label: string; sub: string }[] = [
  { key: "low", label: "Budget", sub: "< $50/wk" },
  { key: "moderate", label: "Moderate", sub: "$50–$100/wk" },
  { key: "high", label: "Generous", sub: "$100+/wk" },
];

const ALLERGY_OPTIONS = ["Gluten", "Dairy", "Nuts", "Shellfish", "Eggs", "Soy"];

const MEAL_LABELS: Record<MealKey, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

// ── MealSwapModal ─────────────────────────────────────────────────────────────

interface SwapAlternative {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  prep_mins: number;
  reason: string;
}

interface MealSwapModalProps {
  visible: boolean;
  mealName: string;
  mealType: MealKey;
  dietType: DietType;
  caloriesTarget: number;
  allergies: string[];
  onSwap: (alt: SwapAlternative) => void;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
  getToken: () => Promise<string | null>;
}

function MealSwapModal({
  visible, mealName, mealType, dietType, caloriesTarget, allergies,
  onSwap, onClose, colors, getToken,
}: MealSwapModalProps) {
  const [loading, setLoading] = useState(false);
  const [alternatives, setAlternatives] = useState<SwapAlternative[]>([]);

  const fetchAlternatives = useCallback(async () => {
    setLoading(true);
    setAlternatives([]);
    try {
      const token = await getToken();
      const res = await fetch(`${getApiBase()}/api/meal/swap`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ mealName, mealType, dietType, caloriesTarget, allergies }),
      });
      const data = await res.json();
      if (data.alternatives) setAlternatives(data.alternatives);
    } catch {
      Alert.alert("Could not load alternatives. Try again.");
    } finally {
      setLoading(false);
    }
  }, [mealName, mealType, dietType, caloriesTarget, allergies, getToken]);

  React.useEffect(() => {
    if (visible) void fetchAlternatives();
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={swapStyles.header}>
          <Text style={[swapStyles.title, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Swap Meal
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <Text style={[swapStyles.sub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Replacing: {mealName}
        </Text>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingTop: 8 }}>
          {loading ? (
            <View style={{ padding: 40, alignItems: "center" }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[{ color: colors.mutedForeground, marginTop: 12, fontFamily: "Inter_400Regular" }]}>
                Finding alternatives…
              </Text>
            </View>
          ) : (
            alternatives.map((alt, i) => (
              <TouchableOpacity
                key={i}
                activeOpacity={0.8}
                onPress={() => { Haptics.selectionAsync(); onSwap(alt); onClose(); }}
                style={[swapStyles.altCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[swapStyles.altName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                    {alt.name}
                  </Text>
                  <Text style={[swapStyles.altMacros, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    {alt.calories} cal · {alt.protein_g}g protein · {alt.prep_mins}m prep
                  </Text>
                  <Text style={[swapStyles.altReason, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    {alt.reason}
                  </Text>
                </View>
                <Feather name="check" size={18} color={colors.primary} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const swapStyles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, paddingBottom: 4 },
  title: { fontSize: 18 },
  sub: { fontSize: 13, paddingHorizontal: 20, paddingBottom: 8 },
  altCard: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 10, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  altName: { fontSize: 15, marginBottom: 4 },
  altMacros: { fontSize: 12, marginBottom: 4 },
  altReason: { fontSize: 12 },
});

// ── MealPlannerScreen ─────────────────────────────────────────────────────────

export default function MealPlannerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useValoAuth();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [dietType, setDietType] = useState<DietType>("balanced");
  const [calories, setCalories] = useState(2000);
  const [budget, setBudget] = useState<BudgetType>("moderate");
  const [allergies, setAllergies] = useState<string[]>([]);
  const [days] = useState(7);

  // ── Plan state ──────────────────────────────────────────────────────────────
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("plan");
  const [expandedDay, setExpandedDay] = useState<number | null>(0);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // ── Swap state ──────────────────────────────────────────────────────────────
  const [swapVisible, setSwapVisible] = useState(false);
  const [swapTarget, setSwapTarget] = useState<{ dayIdx: number; mealKey: MealKey; mealName: string } | null>(null);

  // ── Load persisted plan on mount ──────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(PLAN_STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as { plan: MealPlan; savedAt: string; prefs: { dietType: DietType; calories: number; budget: BudgetType; allergies: string[] } };
        setPlan(saved.plan);
        setSavedAt(saved.savedAt);
        setDietType(saved.prefs.dietType);
        setCalories(saved.prefs.calories);
        setBudget(saved.prefs.budget);
        setAllergies(saved.prefs.allergies);
        setExpandedDay(0);
      })
      .catch(() => {});
  }, []);

  const savePlan = useCallback(async (newPlan: MealPlan) => {
    const payload = {
      plan: newPlan,
      savedAt: new Date().toISOString(),
      prefs: { dietType, calories, budget, allergies },
    };
    await AsyncStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(payload));
    setSavedAt(payload.savedAt);
  }, [dietType, calories, budget, allergies]);

  const clearPlan = () => {
    Alert.alert("Start over?", "This will clear your current meal plan.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => {
          void AsyncStorage.removeItem(PLAN_STORAGE_KEY);
          setPlan(null);
          setSavedAt(null);
        },
      },
    ]);
  };

  const toggleAllergy = (a: string) => {
    setAllergies((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]);
  };

  const generatePlan = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGenerating(true);
    setPlan(null);
    try {
      const token = await getToken();
      const res = await fetch(`${getApiBase()}/api/meal/plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ dietType, caloriesTarget: calories, budget, allergies, days }),
      });
      const data = await res.json();
      if (data.plan) {
        const newPlan = data.plan as MealPlan;
        setPlan(newPlan);
        setExpandedDay(0);
        setActiveTab("plan");
        void savePlan(newPlan);
        trackEvent("meal_plan_generated", { dietType, calories, budget, days });
      } else {
        Alert.alert("Error", "Could not generate meal plan. Please try again.");
      }
    } catch {
      Alert.alert("Error", "Could not generate meal plan. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleSwapMeal = (dayIdx: number, mealKey: MealKey, mealName: string) => {
    setSwapTarget({ dayIdx, mealKey, mealName });
    setSwapVisible(true);
  };

  const applySwap = (dayIdx: number, mealKey: MealKey, alt: { name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; prep_mins: number }) => {
    if (!plan) return;
    const newDays = plan.days.map((d, i) => {
      if (i !== dayIdx) return d;
      return {
        ...d,
        meals: {
          ...d.meals,
          [mealKey]: { ...alt },
        },
        totals: {
          calories: Object.values({ ...d.meals, [mealKey]: alt }).reduce((s, m) => s + (m as MealEntry).calories, 0),
          protein_g: Object.values({ ...d.meals, [mealKey]: alt }).reduce((s, m) => s + (m as MealEntry).protein_g, 0),
          carbs_g: Object.values({ ...d.meals, [mealKey]: alt }).reduce((s, m) => s + (m as MealEntry).carbs_g, 0),
          fat_g: Object.values({ ...d.meals, [mealKey]: alt }).reduce((s, m) => s + (m as MealEntry).fat_g, 0),
        },
      };
    });
    const updatedPlan = { ...plan, days: newDays };
    setPlan(updatedPlan);
    void savePlan(updatedPlan);
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Meal Planner
          </Text>
          {savedAt && (
            <Text style={[styles.savedLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              saved
            </Text>
          )}
        </View>
        {plan ? (
          <TouchableOpacity onPress={clearPlan} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
            <Text style={[styles.newPlanBtn, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>New</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 30 }} />
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
      >
        {/* ── Form ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            DIET TYPE
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {DIET_OPTIONS.map((d) => (
              <TouchableOpacity
                key={d.key}
                onPress={() => { Haptics.selectionAsync(); setDietType(d.key); }}
                style={[
                  styles.chip,
                  dietType === d.key
                    ? { backgroundColor: colors.primary, borderColor: colors.primary }
                    : { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[
                  styles.chipText,
                  { fontFamily: "Inter_500Medium", color: dietType === d.key ? colors.primaryForeground : colors.foreground },
                ]}>
                  {d.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            DAILY CALORIES
          </Text>
          <View style={[styles.stepperRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => { Haptics.selectionAsync(); setCalories((c) => Math.max(1200, c - 100)); }}
              style={styles.stepperBtn}
            >
              <Feather name="minus" size={18} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.stepperValue, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              {calories.toLocaleString()} cal
            </Text>
            <TouchableOpacity
              onPress={() => { Haptics.selectionAsync(); setCalories((c) => Math.min(4000, c + 100)); }}
              style={styles.stepperBtn}
            >
              <Feather name="plus" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            WEEKLY BUDGET
          </Text>
          <View style={styles.budgetRow}>
            {BUDGET_OPTIONS.map((b) => (
              <TouchableOpacity
                key={b.key}
                onPress={() => { Haptics.selectionAsync(); setBudget(b.key); }}
                style={[
                  styles.budgetCard,
                  budget === b.key
                    ? { backgroundColor: colors.primary, borderColor: colors.primary }
                    : { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[
                  styles.budgetLabel,
                  { fontFamily: "Inter_600SemiBold", color: budget === b.key ? colors.primaryForeground : colors.foreground },
                ]}>
                  {b.label}
                </Text>
                <Text style={[
                  styles.budgetSub,
                  { fontFamily: "Inter_400Regular", color: budget === b.key ? colors.primaryForeground : colors.mutedForeground },
                ]}>
                  {b.sub}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            ALLERGIES / RESTRICTIONS
          </Text>
          <View style={styles.allergyRow}>
            {ALLERGY_OPTIONS.map((a) => (
              <TouchableOpacity
                key={a}
                onPress={() => { Haptics.selectionAsync(); toggleAllergy(a); }}
                style={[
                  styles.chip,
                  allergies.includes(a)
                    ? { backgroundColor: "#FEF3C7", borderColor: "#D97706" }
                    : { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[
                  styles.chipText,
                  { fontFamily: "Inter_500Medium", color: allergies.includes(a) ? "#92400E" : colors.foreground },
                ]}>
                  {a}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          onPress={() => void generatePlan()}
          disabled={generating}
          activeOpacity={0.85}
          style={[
            styles.generateBtn,
            { backgroundColor: generating ? colors.muted : colors.primary },
          ]}
        >
          {generating ? (
            <View style={styles.generateBtnInner}>
              <ActivityIndicator color={colors.primaryForeground} size="small" />
              <Text style={[styles.generateBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                Generating…
              </Text>
            </View>
          ) : (
            <Text style={[styles.generateBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
              {plan ? "Regenerate Plan" : `Generate ${days}-Day Plan`}
            </Text>
          )}
        </TouchableOpacity>

        {/* ── Results ── */}
        {plan && (
          <>
            {/* Tab bar */}
            <View style={[styles.tabBar, { borderColor: colors.border }]}>
              {(["plan", "groceries"] as Tab[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => { Haptics.selectionAsync(); setActiveTab(t); }}
                  style={[
                    styles.tabBtn,
                    activeTab === t && { borderBottomWidth: 2, borderBottomColor: colors.primary },
                  ]}
                >
                  <Text style={[
                    styles.tabLabel,
                    {
                      fontFamily: activeTab === t ? "Inter_600SemiBold" : "Inter_400Regular",
                      color: activeTab === t ? colors.primary : colors.mutedForeground,
                    },
                  ]}>
                    {t === "plan" ? "Meal Plan" : "Grocery List"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {activeTab === "plan" && (
              <View style={styles.section}>
                {/* Weekly summary strip */}
                <View style={[styles.macroStrip, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <MacroCell label="Avg Cal" value={`${Math.round(plan.weeklyMacros.avg_calories)}`} colors={colors} />
                  <MacroCell label="Protein" value={`${Math.round(plan.weeklyMacros.avg_protein_g)}g`} colors={colors} />
                  <MacroCell label="Carbs" value={`${Math.round(plan.weeklyMacros.avg_carbs_g)}g`} colors={colors} />
                  <MacroCell label="Fat" value={`${Math.round(plan.weeklyMacros.avg_fat_g)}g`} colors={colors} />
                </View>

                {plan.days.map((day, dayIdx) => (
                  <View key={dayIdx} style={[styles.dayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <TouchableOpacity
                      onPress={() => { Haptics.selectionAsync(); setExpandedDay((prev) => prev === dayIdx ? null : dayIdx); }}
                      style={styles.dayHeader}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dayName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                        {day.dayName}
                      </Text>
                      <View style={styles.dayHeaderRight}>
                        <Text style={[styles.dayCal, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                          {day.totals.calories} cal
                        </Text>
                        <Feather
                          name={expandedDay === dayIdx ? "chevron-up" : "chevron-down"}
                          size={16}
                          color={colors.mutedForeground}
                        />
                      </View>
                    </TouchableOpacity>

                    {expandedDay === dayIdx && (
                      <View style={[styles.dayMeals, { borderTopColor: colors.border }]}>
                        {(Object.entries(day.meals) as [MealKey, MealEntry][]).map(([mealKey, meal]) => (
                          <View
                            key={mealKey}
                            style={[styles.mealRow, { borderBottomColor: colors.border }]}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.mealTypeLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                                {MEAL_LABELS[mealKey]}
                              </Text>
                              <Text style={[styles.mealName, { color: colors.foreground, fontFamily: "Inter_400Regular" }]} numberOfLines={2}>
                                {meal.name}
                              </Text>
                              <Text style={[styles.mealMacros, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                                {meal.calories} cal · {meal.protein_g}g P · {meal.prep_mins}m
                              </Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => handleSwapMeal(dayIdx, mealKey, meal.name)}
                              style={[styles.swapBtn, { borderColor: colors.border }]}
                            >
                              <Feather name="refresh-cw" size={13} color={colors.mutedForeground} />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {activeTab === "groceries" && (
              <View style={styles.section}>
                <View style={[styles.budgetBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Feather name="shopping-cart" size={16} color={colors.primary} />
                  <Text style={[styles.budgetBannerText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                    Estimated weekly cost: {plan.estimatedWeeklyBudget}
                  </Text>
                </View>
                {plan.shoppingList.map((cat) => (
                  <View key={cat.category} style={[styles.grocerySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.groceryCategory, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                      {cat.category}
                    </Text>
                    {cat.items.map((item, i) => (
                      <View key={i} style={[styles.groceryItem, i < cat.items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                        <View style={[styles.groceryDot, { backgroundColor: colors.primary }]} />
                        <Text style={[styles.groceryItemText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                          {item}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
                <TouchableOpacity
                  style={[styles.instacartBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
                  onPress={() => Alert.alert("Instacart", "Connect Instacart in Profile to send your grocery list directly to your cart.")}
                  activeOpacity={0.8}
                >
                  <Feather name="shopping-bag" size={16} color={colors.mutedForeground} />
                  <Text style={[styles.instacartBtnText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                    Send to Instacart
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Meal swap modal */}
      {swapTarget && (
        <MealSwapModal
          visible={swapVisible}
          mealName={swapTarget.mealName}
          mealType={swapTarget.mealKey}
          dietType={dietType}
          caloriesTarget={Math.round(calories / 4)}
          allergies={allergies}
          onSwap={(alt) => applySwap(swapTarget.dayIdx, swapTarget.mealKey, alt)}
          onClose={() => setSwapVisible(false)}
          colors={colors}
          getToken={getToken as () => Promise<string | null>}
        />
      )}
    </SafeAreaView>
  );
}

// ── MacroCell helper ──────────────────────────────────────────────────────────

function MacroCell({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={{ fontSize: 16, color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 }}>{label}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17 },
  section: { paddingHorizontal: 20, paddingTop: 20 },
  sectionLabel: { fontSize: 11, letterSpacing: 0.6, marginBottom: 10 },
  chipRow: { gap: 8, paddingBottom: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13 },
  allergyRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stepperRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1, borderRadius: 14, overflow: "hidden",
  },
  stepperBtn: { paddingHorizontal: 20, paddingVertical: 14 },
  stepperValue: { fontSize: 18 },
  budgetRow: { flexDirection: "row", gap: 10 },
  budgetCard: {
    flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: 14, borderWidth: 1,
  },
  budgetLabel: { fontSize: 14 },
  budgetSub: { fontSize: 11, marginTop: 2 },
  generateBtn: {
    marginHorizontal: 20, marginTop: 24, height: 54, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },
  generateBtnInner: { flexDirection: "row", alignItems: "center", gap: 10 },
  generateBtnText: { fontSize: 16 },
  tabBar: {
    flexDirection: "row", marginHorizontal: 20, marginTop: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabLabel: { fontSize: 14 },
  macroStrip: {
    flexDirection: "row", borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 12,
  },
  dayCard: {
    borderWidth: 1, borderRadius: 14, marginBottom: 10, overflow: "hidden",
  },
  dayHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  dayName: { fontSize: 15 },
  dayHeaderRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  dayCal: { fontSize: 13 },
  dayMeals: { borderTopWidth: StyleSheet.hairlineWidth },
  mealRow: {
    flexDirection: "row", alignItems: "flex-start", padding: 14, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mealTypeLabel: { fontSize: 10, letterSpacing: 0.5, marginBottom: 4, textTransform: "uppercase" },
  mealName: { fontSize: 14, lineHeight: 20 },
  mealMacros: { fontSize: 12, marginTop: 4 },
  swapBtn: { borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 4 },
  budgetBanner: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 14,
    borderWidth: 1, borderRadius: 14, marginBottom: 12,
  },
  budgetBannerText: { fontSize: 13 },
  grocerySection: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 10 },
  groceryCategory: { fontSize: 14, marginBottom: 10 },
  groceryItem: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 10 },
  groceryDot: { width: 6, height: 6, borderRadius: 3 },
  groceryItemText: { fontSize: 14, flex: 1 },
  instacartBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1, borderRadius: 14, paddingVertical: 14, marginTop: 4, marginBottom: 32,
  },
  instacartBtnText: { fontSize: 14 },
  savedLabel: { fontSize: 10, marginTop: 1 },
  newPlanBtn: { fontSize: 14 },
});
