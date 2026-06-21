// Review screen for a generated meal plan.
// Navigated to from meal-planner.tsx after a successful POST /api/meal-plans.
// Shows training-day and rest-day templates side by side (tab), per-meal recipe
// cards with per-serving ingredients, macros, instructions, and a swap button.
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import {
  useGetMealPlan,
  getGetMealPlanQueryKey,
  useSwapMealSlot,
  useGetMealPlanPrepList,
  getGetMealPlanPrepListQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

// ── Types (mirror generated schema shapes) ───────────────────────────────────

interface Ingredient {
  id: number;
  name: string;
  quantityPerServing: number;
  unit: string;
  caloriesPerServing: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface MealSlotFull {
  id: number;
  slotIndex: number;
  slotName: string;
  recipeName: string;
  instructions?: string | null;
  prepMode: string;
  targetCalories: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
  actualCalories: number;
  actualProteinG: number;
  actualCarbsG: number;
  actualFatG: number;
  ingredients: Ingredient[];
}

interface DayTypeFull {
  id: number;
  dayType: string;
  targetCalories: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatG: number;
  meals: MealSlotFull[];
}

interface MealPlanFull {
  id: number;
  macroProfile: string;
  cuisineStyle?: string | null;
  allergies: string[];
  mealsPerDay: number;
  trainingDaysPerWeek: number;
  restDaysPerWeek: number;
  dailyBaselineCalories: number;
  dailyProteinG: number;
  dailyCarbsG: number;
  dailyFatG: number;
  dayTypes: DayTypeFull[];
  createdAt: string;
}

// ── SwapModal — handles both full-meal and ingredient-level swaps ─────────────
// When ingredientId/ingredientName are provided, it swaps a single ingredient.
// Otherwise it generates a full replacement recipe for the slot.

function SwapModal({
  visible,
  planId,
  mealSlot,
  ingredientId,
  ingredientName,
  onDone,
  onClose,
  colors,
}: {
  visible: boolean;
  planId: number;
  mealSlot: MealSlotFull | null;
  ingredientId?: number;
  ingredientName?: string;
  onDone: () => void;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const { mutateAsync: swapMeal, isPending: swapping } = useSwapMealSlot();
  const isIngredientSwap = ingredientId !== undefined;

  const handleSwap = async () => {
    if (!mealSlot) return;
    try {
      await swapMeal({
        id: planId,
        mealId: mealSlot.id,
        data: isIngredientSwap ? { ingredientId } : {},
      });
      onDone();
      onClose();
    } catch (err: any) {
      const message = err?.response?.data?.error ?? err?.message ?? "Please try again.";
      Alert.alert("Swap failed", message);
    }
  };

  const title = isIngredientSwap ? "Swap Ingredient" : "Swap Meal";
  const replacingLabel = isIngredientSwap ? ingredientName ?? "this ingredient" : mealSlot?.recipeName ?? "";
  const infoText = isIngredientSwap
    ? "A substitute ingredient will be validated to hit the same per-serving macros within ±5% tolerance. Allergen exclusions are always enforced."
    : "The new recipe will be validated to hit the same macro target within ±5% tolerance. Allergen exclusions are always enforced.";
  const btnLabel = isIngredientSwap ? "Find substitute" : "Swap this meal";

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[swapStyles.header, Platform.OS === "web" ? { paddingTop: 67 } : null]}>
          <Text style={[swapStyles.title, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            {title}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {mealSlot && (
          <ScrollView contentContainerStyle={{ padding: 24 }}>
            <Text style={[swapStyles.currentLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Replacing
            </Text>
            <Text style={[swapStyles.currentName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              {replacingLabel}
            </Text>
            {!isIngredientSwap && (
              <Text style={[swapStyles.targetLine, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Target: {mealSlot.targetCalories} kcal · {mealSlot.targetProteinG}g protein
              </Text>
            )}

            <View style={[swapStyles.infoBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Text style={[swapStyles.infoText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                {infoText}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => void handleSwap()}
              disabled={swapping}
              activeOpacity={0.85}
              style={[swapStyles.swapBtn, { backgroundColor: swapping ? colors.muted : colors.primary }]}
            >
              {swapping ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                  <Text style={[swapStyles.swapBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                    Finding alternative…
                  </Text>
                </View>
              ) : (
                <Text style={[swapStyles.swapBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                  {btnLabel}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const swapStyles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20 },
  title: { fontSize: 18 },
  currentLabel: { fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 },
  currentName: { fontSize: 20, marginBottom: 4 },
  targetLine: { fontSize: 13, marginBottom: 20 },
  infoBox: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 24 },
  infoText: { fontSize: 13, lineHeight: 20 },
  swapBtn: { height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  swapBtnText: { fontSize: 16 },
});

// ── PrepListSection ───────────────────────────────────────────────────────────

function PrepListSection({ planId, colors }: { planId: number; colors: ReturnType<typeof useColors> }) {
  const [revealed, setRevealed] = useState(false);
  const { data, isLoading, isError, refetch } = useGetMealPlanPrepList(
    planId,
    { query: { enabled: revealed, queryKey: getGetMealPlanPrepListQueryKey(planId) } },
  );

  const items = data?.items ?? [];

  if (!revealed) {
    return (
      <View style={{ marginTop: 8 }}>
        <TouchableOpacity
          onPress={() => setRevealed(true)}
          activeOpacity={0.8}
          style={[prepStyles.loadBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
        >
          <Feather name="shopping-cart" size={16} color={colors.primary} />
          <Text style={[prepStyles.loadBtnText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
            Show weekly prep list
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isLoading) {
    return <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />;
  }

  if (isError) {
    return (
      <TouchableOpacity onPress={() => void refetch()} style={{ marginTop: 8 }}>
        <Text style={{ color: colors.primary, fontFamily: "Inter_500Medium", fontSize: 14 }}>
          Could not load prep list. Tap to retry.
        </Text>
      </TouchableOpacity>
    );
  }

  const prepItems = items.filter((i) => i.prepMode === "prep");
  const cookItems = items.filter((i) => i.prepMode === "cook");

  return (
    <View style={{ marginTop: 8 }}>
      {prepItems.length > 0 && (
        <>
          <Text style={[prepStyles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Batch-prep ingredients
          </Text>
          {prepItems.map((item, i) => (
            <View key={i} style={[prepStyles.item, { borderBottomColor: colors.border }]}>
              <View style={[prepStyles.dot, { backgroundColor: colors.primary }]} />
              <Text style={[prepStyles.itemText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                {item.name} — {item.quantity} {item.unit}
              </Text>
            </View>
          ))}
        </>
      )}
      {cookItems.length > 0 && (
        <>
          <Text style={[prepStyles.sectionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold", marginTop: 16 }]}>
            Cook-to-order (per occurrence)
          </Text>
          {cookItems.map((item, i) => (
            <View key={i} style={[prepStyles.item, { borderBottomColor: colors.border }]}>
              <View style={[prepStyles.dot, { backgroundColor: colors.mutedForeground }]} />
              <Text style={[prepStyles.itemText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                {item.name} — {item.quantity} {item.unit}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const prepStyles = StyleSheet.create({
  loadBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, borderWidth: 1, padding: 14 },
  loadBtnText: { fontSize: 14 },
  sectionTitle: { fontSize: 14, marginBottom: 8 },
  item: { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  itemText: { fontSize: 14, flex: 1 },
});

// ── MealCard ──────────────────────────────────────────────────────────────────

function MealCard({
  slot,
  onSwap,
  onSwapIngredient,
  colors,
}: {
  slot: MealSlotFull;
  onSwap: () => void;
  onSwapIngredient: (ingredientId: number, ingredientName: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Header row */}
      <TouchableOpacity
        onPress={() => { Haptics.selectionAsync(); setExpanded((e) => !e); }}
        activeOpacity={0.8}
        style={cardStyles.cardHeader}
      >
        <View style={{ flex: 1 }}>
          <Text style={[cardStyles.slotName, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            {slot.slotName.toUpperCase()}
          </Text>
          <Text style={[cardStyles.recipeName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]} numberOfLines={expanded ? undefined : 2}>
            {slot.recipeName}
          </Text>
          <Text style={[cardStyles.macros, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {slot.actualCalories} kcal · {slot.actualProteinG}g P · {slot.actualCarbsG}g C · {slot.actualFatG}g F
          </Text>
        </View>
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
      </TouchableOpacity>

      {expanded && (
        <View style={[cardStyles.body, { borderTopColor: colors.border }]}>
          {/* Ingredients — each row is tappable for ingredient-level swap */}
          <Text style={[cardStyles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            INGREDIENTS (tap to swap)
          </Text>
          {slot.ingredients.map((ing) => (
            <TouchableOpacity
              key={ing.id}
              onPress={() => { Haptics.selectionAsync(); onSwapIngredient(ing.id, ing.name); }}
              activeOpacity={0.7}
              style={cardStyles.ingRow}
            >
              <View style={[cardStyles.ingDot, { backgroundColor: colors.primary }]} />
              <Text style={[cardStyles.ingText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                {ing.quantityPerServing} {ing.unit} {ing.name}
              </Text>
              <Text style={[cardStyles.ingCal, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {ing.caloriesPerServing} kcal
              </Text>
              <Feather name="refresh-cw" size={12} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          ))}

          {/* Instructions */}
          {!!slot.instructions && (
            <>
              <Text style={[cardStyles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 16 }]}>
                INSTRUCTIONS
              </Text>
              <Text style={[cardStyles.instructions, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                {slot.instructions}
              </Text>
            </>
          )}

          {/* Swap button */}
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); onSwap(); }}
            activeOpacity={0.8}
            style={[cardStyles.swapBtn, { borderColor: colors.border }]}
          >
            <Feather name="refresh-cw" size={14} color={colors.primary} />
            <Text style={[cardStyles.swapBtnText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
              Swap this meal
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, marginBottom: 12, overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", padding: 16, gap: 12 },
  slotName: { fontSize: 10, letterSpacing: 0.8, marginBottom: 4 },
  recipeName: { fontSize: 16, lineHeight: 22, marginBottom: 4 },
  macros: { fontSize: 12 },
  body: { borderTopWidth: StyleSheet.hairlineWidth, padding: 16, paddingTop: 14 },
  sectionLabel: { fontSize: 10, letterSpacing: 0.8, marginBottom: 10 },
  ingRow: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 10 },
  ingDot: { width: 6, height: 6, borderRadius: 3 },
  ingText: { fontSize: 14, flex: 1 },
  ingCal: { fontSize: 12 },
  instructions: { fontSize: 14, lineHeight: 22 },
  swapBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, marginTop: 16, alignSelf: "flex-start" },
  swapBtnText: { fontSize: 13 },
});

// ── Main review screen ────────────────────────────────────────────────────────

export default function MealPlanReviewScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ planId: string }>();
  const planId = parseInt(params.planId ?? "", 10);

  const [activeTab, setActiveTab] = useState<"training" | "rest">("training");
  const [swapModal, setSwapModal] = useState<{
    slot: MealSlotFull;
    ingredientId?: number;
    ingredientName?: string;
  } | null>(null);

  const validPlanId = !isNaN(planId);
  const { data: plan, isLoading: loading, isError, refetch } = useGetMealPlan(
    planId,
    { query: { enabled: validPlanId, queryKey: getGetMealPlanQueryKey(planId) } },
  );

  const headerPaddingTop = (Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top) + 12;

  if (!validPlanId) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: headerPaddingTop }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Your Plan</Text>
          <View style={{ width: 30 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
          <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 16, textAlign: "center" }}>
            Invalid plan ID.
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: headerPaddingTop }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Your Plan</Text>
          <View style={{ width: 30 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={{ color: colors.mutedForeground, marginTop: 16, fontFamily: "Inter_400Regular", fontSize: 14 }}>
            Loading your meal plan…
          </Text>
        </View>
      </View>
    );
  }

  if (isError || !plan) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: headerPaddingTop }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>Your Plan</Text>
          <View style={{ width: 30 }} />
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
          <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 16, textAlign: "center" }}>
            Could not load plan.
          </Text>
          <TouchableOpacity onPress={() => void refetch()} style={{ marginTop: 20 }}>
            <Text style={{ color: colors.primary, fontFamily: "Inter_500Medium", fontSize: 14 }}>Try again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const trainingDayType = plan.dayTypes.find((d) => d.dayType === "training");
  const restDayType = plan.dayTypes.find((d) => d.dayType === "rest");
  const activeDayType = activeTab === "training" ? trainingDayType : restDayType;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: headerPaddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Your Plan
        </Text>
        <View style={{ width: 30 }} />
      </View>

      {/* Plan summary chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Chip label={plan.macroProfile} colors={colors} />
        <Chip label={`${plan.trainingDaysPerWeek}T / ${plan.restDaysPerWeek}R`} colors={colors} />
        <Chip label={`${plan.dailyBaselineCalories} kcal/day`} colors={colors} />
        <Chip label={`${plan.mealsPerDay} meals/day`} colors={colors} />
      </ScrollView>

      {/* Day type tabs */}
      <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
        {(["training", "rest"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => { Haptics.selectionAsync(); setActiveTab(tab); }}
            style={[styles.tabBtn, activeTab === tab && { borderBottomWidth: 2, borderBottomColor: colors.primary }]}
          >
            <Text style={[styles.tabLabel, {
              fontFamily: activeTab === tab ? "Inter_600SemiBold" : "Inter_400Regular",
              color: activeTab === tab ? colors.primary : colors.mutedForeground,
            }]}>
              {tab === "training" ? `Training Day (×${plan.trainingDaysPerWeek})` : `Rest Day (×${plan.restDaysPerWeek})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
        {activeDayType ? (
          <>
            {/* Day totals banner */}
            <View style={[styles.totalsBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MacroCell label="Calories" value={String(activeDayType.targetCalories)} colors={colors} />
              <MacroCell label="Protein" value={`${activeDayType.targetProteinG}g`} colors={colors} />
              <MacroCell label="Carbs" value={`${activeDayType.targetCarbsG}g`} colors={colors} />
              <MacroCell label="Fat" value={`${activeDayType.targetFatG}g`} colors={colors} />
            </View>

            {/* Meal cards */}
            {activeDayType.meals.map((slot) => (
              <MealCard
                key={slot.id}
                slot={slot}
                onSwap={() => setSwapModal({ slot })}
                onSwapIngredient={(ingredientId, ingredientName) =>
                  setSwapModal({ slot, ingredientId, ingredientName })
                }
                colors={colors}
              />
            ))}

            {/* Prep / shopping list */}
            <View style={[styles.prepSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.prepTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                Weekly Prep & Shopping List
              </Text>
              <PrepListSection planId={plan.id} colors={colors} />
            </View>
          </>
        ) : (
          <Text style={[{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 40 }]}>
            No {activeTab}-day template found.
          </Text>
        )}
      </ScrollView>

      {/* Swap modal — full-meal or ingredient-level depending on swapModal state */}
      <SwapModal
        visible={!!swapModal}
        planId={plan.id}
        mealSlot={swapModal?.slot ?? null}
        ingredientId={swapModal?.ingredientId}
        ingredientName={swapModal?.ingredientName}
        onDone={() => void queryClient.invalidateQueries({ queryKey: getGetMealPlanQueryKey(planId) })}
        onClose={() => setSwapModal(null)}
        colors={colors}
      />
    </View>
  );
}

function Chip({ label, colors }: { label: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.chip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
      <Text style={[styles.chipText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>{label}</Text>
    </View>
  );
}

function MacroCell({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={{ fontSize: 16, color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17 },
  chipRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 12 },
  tabRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabLabel: { fontSize: 13 },
  totalsBanner: { flexDirection: "row", borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16 },
  prepSection: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 8 },
  prepTitle: { fontSize: 15, marginBottom: 12 },
});
