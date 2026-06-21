// Canonical entry point for the Meal Planning feature.
// tools.tsx links to /meal-planner (this file).
// (tools)/meal-plan.tsx is the Upload/Find coming-soon placeholder.
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useValoAuth } from "@/contexts/AuthContext";

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

// ── Constants ─────────────────────────────────────────────────────────────────

// These are the ONLY valid macro profiles (matching the server-side ratio table).
const MACRO_PROFILES = [
  { key: "balanced", label: "Balanced", description: "50% carbs, 50% fat" },
  { key: "high-protein", label: "High Protein", description: "60% carbs, 40% fat" },
  { key: "low-carb", label: "Low Carb", description: "20% carbs, 80% fat" },
  { key: "keto", label: "Keto", description: "5% carbs, 95% fat" },
  { key: "mediterranean", label: "Mediterranean", description: "55% carbs, 45% fat" },
] as const;

type MacroProfile = (typeof MACRO_PROFILES)[number]["key"];

const ACTIVITY_LEVELS = [
  { key: "sedentary", label: "Sedentary", description: "Little or no exercise" },
  { key: "lightly active", label: "Lightly Active", description: "1–3 days/week" },
  { key: "moderately active", label: "Moderately Active", description: "3–5 days/week" },
  { key: "very active", label: "Very Active", description: "6–7 days/week" },
  { key: "extra active", label: "Extra Active", description: "Physical job + daily training" },
] as const;

type ActivityLevel = (typeof ACTIVITY_LEVELS)[number]["key"];

const GOALS = [
  { key: "deficit", label: "Lose fat", description: "−500 kcal/day" },
  { key: "maintenance", label: "Maintain", description: "Keep current weight" },
  { key: "surplus", label: "Build muscle", description: "+300 kcal/day" },
] as const;

type Goal = (typeof GOALS)[number]["key"];

// 8 major allergens shown with their key derivatives so users know what gets excluded.
const ALLERGEN_OPTIONS = [
  { key: "peanut", label: "Peanut", derivatives: "peanut butter, groundnut, arachis oil" },
  { key: "tree nut", label: "Tree Nut", derivatives: "almond, cashew, walnut, pistachio, hazelnut" },
  { key: "milk", label: "Dairy", derivatives: "whey, casein, butter, ghee, cream, cheese, yoghurt" },
  { key: "egg", label: "Egg", derivatives: "albumin, mayonnaise, meringue" },
  { key: "soy", label: "Soy", derivatives: "tofu, tempeh, edamame, miso, tamari" },
  { key: "wheat", label: "Wheat / Gluten", derivatives: "flour, bread, pasta, spelt, farro" },
  { key: "shellfish", label: "Shellfish", derivatives: "shrimp, crab, lobster, scallop, mussel" },
  { key: "fish", label: "Fish", derivatives: "anchovy, tuna, salmon, fish sauce" },
];

// ── Wizard state types ────────────────────────────────────────────────────────

type WizardStep = 0 | 1 | 2 | 3 | 4 | 5;

interface WizardState {
  macrosKnown: boolean | null;
  // Manual macros path
  knownCalories: string;
  knownProteinG: string;
  knownCarbsG: string;
  knownFatG: string;
  // BMR calculator path
  sex: "male" | "female" | null;
  age: string;
  weightKg: string;
  heightCm: string;
  activityLevel: ActivityLevel | null;
  goal: Goal | null;
  // Step 1: training/rest days
  trainingDays: number;
  // Step 2: macro profile
  macroProfile: MacroProfile | null;
  // Step 3: allergies + cuisine + dislikes
  allergies: string[];
  cuisineStyle: string;
  dislikes: string;
  // Step 4: meals per day
  mealsPerDay: number;
  // Step 5: prep vs cook per slot
  prepPerSlot: Record<string, "prep" | "cook">;
}

const DEFAULT_WIZARD: WizardState = {
  macrosKnown: null,
  knownCalories: "",
  knownProteinG: "",
  knownCarbsG: "",
  knownFatG: "",
  sex: null,
  age: "",
  weightKg: "",
  heightCm: "",
  activityLevel: null,
  goal: null,
  trainingDays: 3,
  macroProfile: null,
  allergies: [],
  cuisineStyle: "",
  dislikes: "",
  mealsPerDay: 3,
  prepPerSlot: {},
};

const SLOT_NAMES = ["Breakfast", "Lunch", "Dinner", "Snack"];

// ── AddPlanSheet ──────────────────────────────────────────────────────────────

function AddPlanSheet({
  visible,
  onClose,
  onCreate,
  onUpload,
  onFind,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: () => void;
  onUpload: () => void;
  onFind: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const options = [
    { icon: "plus-circle" as const, label: "Create a plan", sub: "Build from your goals and macros", onPress: onCreate },
    { icon: "upload" as const, label: "Upload existing plan", sub: "Coming soon", onPress: onUpload, soon: true },
    { icon: "search" as const, label: "Find a plan", sub: "Coming soon", onPress: onFind, soon: true },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[sheetStyles.header, Platform.OS === "web" ? { paddingTop: 67 } : null]}>
          <Text style={[sheetStyles.title, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            New Meal Plan
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
        <View style={{ padding: 20, gap: 12 }}>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.label}
              onPress={() => { if (!opt.soon) Haptics.selectionAsync(); opt.onPress(); }}
              activeOpacity={0.8}
              style={[sheetStyles.optCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[sheetStyles.iconWrap, { backgroundColor: colors.secondary }]}>
                <Feather name={opt.icon} size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[sheetStyles.optLabel, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                  {opt.label}
                </Text>
                <Text style={[sheetStyles.optSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {opt.sub}
                </Text>
              </View>
              {!opt.soon && <Feather name="chevron-right" size={18} color={colors.mutedForeground} />}
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, paddingBottom: 8 },
  title: { fontSize: 18 },
  optCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 16, borderWidth: 1 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  optLabel: { fontSize: 15, marginBottom: 2 },
  optSub: { fontSize: 12 },
});

// ── Wizard ────────────────────────────────────────────────────────────────────

function OptionCard({
  selected,
  onPress,
  colors,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  children: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      activeOpacity={0.8}
      style={[
        wizStyles.optCard,
        selected
          ? { backgroundColor: colors.secondary, borderColor: colors.primary }
          : { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      {children}
    </TouchableOpacity>
  );
}

const wizStyles = StyleSheet.create({
  optCard: { borderWidth: 1.5, borderRadius: 14, padding: 16, marginBottom: 10 },
});

// ── MealPlannerScreen ─────────────────────────────────────────────────────────

export default function MealPlannerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useValoAuth();

  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(0);
  const [wizard, setWizard] = useState<WizardState>(DEFAULT_WIZARD);
  const [generating, setGenerating] = useState(false);

  // Pre-fill from saved preferences on mount
  useEffect(() => {
    void (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${getApiBase()}/api/user-diet-preferences`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        if (!res.ok) return;
        const prefs = await res.json() as {
          macroProfile?: string;
          allergies?: string[];
          dislikes?: string;
          mealsPerDay?: number;
          trainingDaysPerWeek?: number;
        };
        setWizard((prev) => ({
          ...prev,
          macroProfile: (prefs.macroProfile as MacroProfile) ?? prev.macroProfile,
          allergies: prefs.allergies ?? prev.allergies,
          dislikes: prefs.dislikes ?? prev.dislikes,
          mealsPerDay: prefs.mealsPerDay ?? prev.mealsPerDay,
          trainingDays: prefs.trainingDaysPerWeek ?? prev.trainingDays,
        }));
      } catch { /* ignore */ }
    })();
  }, []);

  const updateWizard = useCallback(<K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setWizard((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleAllergy = (key: string) => {
    setWizard((prev) => ({
      ...prev,
      allergies: prev.allergies.includes(key)
        ? prev.allergies.filter((a) => a !== key)
        : [...prev.allergies, key],
    }));
  };

  // Step validation
  const canProceedStep0 = wizard.macrosKnown !== null && (
    wizard.macrosKnown
      ? !!wizard.knownCalories && parseInt(wizard.knownCalories) > 0
      : !!wizard.sex && !!wizard.age && !!wizard.weightKg && !!wizard.heightCm && !!wizard.activityLevel && !!wizard.goal
  );
  const canProceedStep1 = wizard.trainingDays >= 0 && wizard.trainingDays <= 7;
  const canProceedStep2 = !!wizard.macroProfile;
  const canProceedStep3 = true; // allergies are optional
  const canProceedStep4 = wizard.mealsPerDay >= 1 && wizard.mealsPerDay <= 3;
  const canProceedStep5 = true; // prep mode has defaults

  const canProceed = [canProceedStep0, canProceedStep1, canProceedStep2, canProceedStep3, canProceedStep4, canProceedStep5];

  const handleGenerate = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGenerating(true);
    try {
      const token = await getToken();
      const restDays = 7 - wizard.trainingDays;

      const body: Record<string, unknown> = {
        macroProfile: wizard.macroProfile,
        cuisineStyle: wizard.cuisineStyle || null,
        allergies: wizard.allergies,
        dislikes: wizard.dislikes || null,
        mealsPerDay: wizard.mealsPerDay,
        trainingDaysPerWeek: wizard.trainingDays,
        restDaysPerWeek: restDays,
        prepPerSlot: wizard.prepPerSlot,
      };

      if (wizard.macrosKnown) {
        body.macrosKnown = true;
        body.knownCalories = parseInt(wizard.knownCalories);
        if (wizard.knownProteinG) body.knownProteinG = parseInt(wizard.knownProteinG);
        if (wizard.knownCarbsG) body.knownCarbsG = parseInt(wizard.knownCarbsG);
        if (wizard.knownFatG) body.knownFatG = parseInt(wizard.knownFatG);
      } else {
        body.macrosKnown = false;
        body.sex = wizard.sex;
        body.age = parseInt(wizard.age);
        body.weightKg = parseFloat(wizard.weightKg);
        body.heightCm = parseFloat(wizard.heightCm);
        body.activityLevel = wizard.activityLevel;
        body.goal = wizard.goal;
      }

      const res = await fetch(`${getApiBase()}/api/meal-plans`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      // POST /api/meal-plans returns MealPlanFull directly (id at the root).
      const data = await res.json() as { id?: number; error?: string };
      if (!res.ok || !data.id) {
        Alert.alert("Error", data.error ?? "Could not generate meal plan. Please try again.");
        return;
      }

      setShowWizard(false);
      router.push(`/meal-plan-review?planId=${data.id}` as never);
    } catch {
      Alert.alert("Error", "Could not generate meal plan. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const stepTitles = [
    "Your Macros",
    "Training Schedule",
    "Macro Profile",
    "Restrictions",
    "Meals Per Day",
    "Prep Preference",
  ];

  const headerPaddingTop =
    (Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top) + 12;

  // ── Wizard modal ──────────────────────────────────────────────────────────

  function renderWizardStep() {
    switch (wizardStep) {
      case 0: return <StepMacros wizard={wizard} updateWizard={updateWizard} colors={colors} />;
      case 1: return <StepTrainingDays wizard={wizard} updateWizard={updateWizard} colors={colors} />;
      case 2: return <StepMacroProfile wizard={wizard} updateWizard={updateWizard} colors={colors} />;
      case 3: return <StepRestrictions wizard={wizard} updateWizard={updateWizard} toggleAllergy={toggleAllergy} colors={colors} />;
      case 4: return <StepMealsPerDay wizard={wizard} updateWizard={updateWizard} colors={colors} />;
      case 5: return <StepPrepMode wizard={wizard} updateWizard={updateWizard} colors={colors} />;
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: headerPaddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Meal Planner
        </Text>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowAddSheet(true); }}
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
        >
          <Feather name="plus" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Empty state */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.emptyContainer}
      >
        <View style={[styles.emptyIconWrap, { backgroundColor: colors.secondary }]}>
          <Feather name="coffee" size={32} color={colors.primary} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Your meal plan lives here
        </Text>
        <Text style={[styles.emptyBody, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Build a training-aware plan that matches your macros, schedule, and lifestyle. Tap the + button to get started.
        </Text>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowAddSheet(true); }}
          activeOpacity={0.85}
          style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.emptyBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
            Create a plan
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Add sheet */}
      <AddPlanSheet
        visible={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        onCreate={() => { setShowAddSheet(false); setWizardStep(0); setShowWizard(true); }}
        onUpload={() => { setShowAddSheet(false); router.push("/(tools)/meal-plan" as never); }}
        onFind={() => { setShowAddSheet(false); router.push("/(tools)/meal-plan" as never); }}
        colors={colors}
      />

      {/* Wizard modal */}
      <Modal visible={showWizard} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowWizard(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Wizard header */}
          <View style={[wizardHeaderStyles.header, Platform.OS === "web" ? { paddingTop: 67 } : null]}>
            <TouchableOpacity
              onPress={() => {
                if (wizardStep === 0) { setShowWizard(false); }
                else { setWizardStep((s) => (s - 1) as WizardStep); }
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name={wizardStep === 0 ? "x" : "arrow-left"} size={22} color={colors.foreground} />
            </TouchableOpacity>
            <View style={{ alignItems: "center" }}>
              <Text style={[wizardHeaderStyles.title, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                {stepTitles[wizardStep]}
              </Text>
              <Text style={[wizardHeaderStyles.step, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Step {wizardStep + 1} of 6
              </Text>
            </View>
            <View style={{ width: 30 }} />
          </View>

          {/* Progress bar */}
          <View style={[wizardHeaderStyles.progressTrack, { backgroundColor: colors.border }]}>
            <View style={[wizardHeaderStyles.progressFill, { backgroundColor: colors.primary, width: `${((wizardStep + 1) / 6) * 100}%` }]} />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 24, paddingBottom: 120 }}
          >
            {renderWizardStep()}
          </ScrollView>

          {/* Footer: Next / Generate */}
          <View style={[wizardHeaderStyles.footer, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: insets.bottom + 12 }]}>
            {wizardStep < 5 ? (
              <TouchableOpacity
                onPress={() => { if (canProceed[wizardStep]) setWizardStep((s) => (s + 1) as WizardStep); }}
                disabled={!canProceed[wizardStep]}
                activeOpacity={0.85}
                style={[wizardHeaderStyles.nextBtn, { backgroundColor: canProceed[wizardStep] ? colors.primary : colors.muted }]}
              >
                <Text style={[wizardHeaderStyles.nextBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                  Continue
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => void handleGenerate()}
                disabled={generating}
                activeOpacity={0.85}
                style={[wizardHeaderStyles.nextBtn, { backgroundColor: generating ? colors.muted : colors.primary }]}
              >
                {generating ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <ActivityIndicator color={colors.primaryForeground} size="small" />
                    <Text style={[wizardHeaderStyles.nextBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                      Generating your plan…
                    </Text>
                  </View>
                ) : (
                  <Text style={[wizardHeaderStyles.nextBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                    Generate Plan
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

// ── Step 0: Macros ────────────────────────────────────────────────────────────

function StepMacros({ wizard, updateWizard, colors }: { wizard: WizardState; updateWizard: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void; colors: ReturnType<typeof useColors> }) {
  return (
    <View>
      <Text style={[stepStyles.heading, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
        Do you know your daily calorie target?
      </Text>
      <Text style={[stepStyles.sub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        If not, we will calculate it from your body stats.
      </Text>

      <View style={{ gap: 10, marginTop: 20 }}>
        <OptionCard selected={wizard.macrosKnown === true} onPress={() => updateWizard("macrosKnown", true)} colors={colors}>
          <Text style={[stepStyles.optTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Yes, I know my targets
          </Text>
          <Text style={[stepStyles.optSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Enter calories and optional macros directly
          </Text>
        </OptionCard>

        <OptionCard selected={wizard.macrosKnown === false} onPress={() => updateWizard("macrosKnown", false)} colors={colors}>
          <Text style={[stepStyles.optTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Calculate for me
          </Text>
          <Text style={[stepStyles.optSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Uses Mifflin–St Jeor with your body stats
          </Text>
        </OptionCard>
      </View>

      {wizard.macrosKnown === true && (
        <View style={{ marginTop: 20, gap: 12 }}>
          <LabeledInput label="Daily calories *" value={wizard.knownCalories} onChangeText={(t) => updateWizard("knownCalories", t)} keyboardType="numeric" placeholder="e.g. 2000" colors={colors} />
          <LabeledInput label="Protein (g)" value={wizard.knownProteinG} onChangeText={(t) => updateWizard("knownProteinG", t)} keyboardType="numeric" placeholder="e.g. 160" colors={colors} />
          <LabeledInput label="Carbs (g)" value={wizard.knownCarbsG} onChangeText={(t) => updateWizard("knownCarbsG", t)} keyboardType="numeric" placeholder="e.g. 200" colors={colors} />
          <LabeledInput label="Fat (g)" value={wizard.knownFatG} onChangeText={(t) => updateWizard("knownFatG", t)} keyboardType="numeric" placeholder="e.g. 70" colors={colors} />
        </View>
      )}

      {wizard.macrosKnown === false && (
        <View style={{ marginTop: 20, gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {(["male", "female"] as const).map((s) => (
              <OptionCard key={s} selected={wizard.sex === s} onPress={() => updateWizard("sex", s)} colors={colors}>
                <Text style={[stepStyles.optTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold", textAlign: "center" }]}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
              </OptionCard>
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Age" value={wizard.age} onChangeText={(t) => updateWizard("age", t)} keyboardType="numeric" placeholder="e.g. 30" colors={colors} />
            </View>
            <View style={{ flex: 1 }}>
              <LabeledInput label="Weight (kg)" value={wizard.weightKg} onChangeText={(t) => updateWizard("weightKg", t)} keyboardType="numeric" placeholder="e.g. 75" colors={colors} />
            </View>
          </View>
          <LabeledInput label="Height (cm)" value={wizard.heightCm} onChangeText={(t) => updateWizard("heightCm", t)} keyboardType="numeric" placeholder="e.g. 175" colors={colors} />

          <Text style={[stepStyles.label, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>Activity level</Text>
          <View style={{ gap: 8 }}>
            {ACTIVITY_LEVELS.map((al) => (
              <OptionCard key={al.key} selected={wizard.activityLevel === al.key} onPress={() => updateWizard("activityLevel", al.key)} colors={colors}>
                <Text style={[stepStyles.optTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{al.label}</Text>
                <Text style={[stepStyles.optSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{al.description}</Text>
              </OptionCard>
            ))}
          </View>

          <Text style={[stepStyles.label, { color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 8 }]}>Goal</Text>
          <View style={{ gap: 8 }}>
            {GOALS.map((g) => (
              <OptionCard key={g.key} selected={wizard.goal === g.key} onPress={() => updateWizard("goal", g.key)} colors={colors}>
                <Text style={[stepStyles.optTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{g.label}</Text>
                <Text style={[stepStyles.optSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{g.description}</Text>
              </OptionCard>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ── Step 1: Training days ─────────────────────────────────────────────────────

function StepTrainingDays({ wizard, updateWizard, colors }: { wizard: WizardState; updateWizard: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void; colors: ReturnType<typeof useColors> }) {
  const restDays = 7 - wizard.trainingDays;
  return (
    <View>
      <Text style={[stepStyles.heading, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
        How many days per week do you train?
      </Text>
      <Text style={[stepStyles.sub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        Training days get more carbs. Rest days shift to higher fat. Both still hit your weekly calorie budget.
      </Text>

      <View style={[stepStyles.stepperBox, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 24 }]}>
        <TouchableOpacity onPress={() => { Haptics.selectionAsync(); updateWizard("trainingDays", Math.max(0, wizard.trainingDays - 1)); }} style={stepStyles.stepBtn}>
          <Feather name="minus" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <Text style={[stepStyles.stepVal, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {wizard.trainingDays}
          </Text>
          <Text style={[stepStyles.stepLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            training days
          </Text>
        </View>
        <TouchableOpacity onPress={() => { Haptics.selectionAsync(); updateWizard("trainingDays", Math.min(7, wizard.trainingDays + 1)); }} style={stepStyles.stepBtn}>
          <Feather name="plus" size={20} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <View style={[stepStyles.infoRow, { backgroundColor: colors.secondary, borderColor: colors.border, marginTop: 12 }]}>
        <Feather name="info" size={14} color={colors.mutedForeground} />
        <Text style={[stepStyles.infoText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {restDays} rest day{restDays !== 1 ? "s" : ""} per week (training + rest = 7)
        </Text>
      </View>
    </View>
  );
}

// ── Step 2: Macro profile ─────────────────────────────────────────────────────

function StepMacroProfile({ wizard, updateWizard, colors }: { wizard: WizardState; updateWizard: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void; colors: ReturnType<typeof useColors> }) {
  return (
    <View>
      <Text style={[stepStyles.heading, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
        Choose a macro profile
      </Text>
      <Text style={[stepStyles.sub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        This controls how your non-protein calories are split between carbs and fat.
      </Text>

      <View style={{ marginTop: 20, gap: 10 }}>
        {MACRO_PROFILES.map((p) => (
          <OptionCard key={p.key} selected={wizard.macroProfile === p.key} onPress={() => updateWizard("macroProfile", p.key)} colors={colors}>
            <Text style={[stepStyles.optTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{p.label}</Text>
            <Text style={[stepStyles.optSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{p.description}</Text>
          </OptionCard>
        ))}
      </View>

      <View style={{ marginTop: 20 }}>
        <Text style={[stepStyles.label, { color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginBottom: 8 }]}>
          Cuisine style (optional)
        </Text>
        <TextInput
          value={wizard.cuisineStyle}
          onChangeText={(t) => updateWizard("cuisineStyle", t)}
          placeholder="e.g. Asian, Mediterranean, variety"
          placeholderTextColor={colors.mutedForeground}
          style={[stepStyles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
        />
      </View>
    </View>
  );
}

// ── Step 3: Restrictions ──────────────────────────────────────────────────────

function StepRestrictions({ wizard, updateWizard, toggleAllergy, colors }: { wizard: WizardState; updateWizard: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void; toggleAllergy: (k: string) => void; colors: ReturnType<typeof useColors> }) {
  return (
    <View>
      <Text style={[stepStyles.heading, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
        Allergies and dislikes
      </Text>
      <Text style={[stepStyles.sub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        Selected allergens and all their derivatives are excluded from every meal — including after swaps.
      </Text>

      <View style={{ marginTop: 20, gap: 10 }}>
        {ALLERGEN_OPTIONS.map((a) => {
          const active = wizard.allergies.includes(a.key);
          return (
            <TouchableOpacity
              key={a.key}
              onPress={() => { Haptics.selectionAsync(); toggleAllergy(a.key); }}
              activeOpacity={0.8}
              style={[
                stepStyles.allergenCard,
                active
                  ? { backgroundColor: colors.secondary, borderColor: colors.primary }
                  : { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[stepStyles.optTitle, { color: active ? colors.primary : colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                  {a.label}
                </Text>
                <Text style={[stepStyles.optSub, { color: active ? colors.primary : colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  Also excludes: {a.derivatives}
                </Text>
              </View>
              {active && <Feather name="check" size={16} color={colors.primary} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ marginTop: 20 }}>
        <Text style={[stepStyles.label, { color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginBottom: 8 }]}>
          Other dislikes or avoid (optional)
        </Text>
        <TextInput
          value={wizard.dislikes}
          onChangeText={(t) => updateWizard("dislikes", t)}
          placeholder="e.g. cilantro, Brussels sprouts"
          placeholderTextColor={colors.mutedForeground}
          multiline
          style={[stepStyles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular", minHeight: 80 }]}
        />
      </View>
    </View>
  );
}

// ── Step 4: Meals per day ─────────────────────────────────────────────────────

function StepMealsPerDay({ wizard, updateWizard, colors }: { wizard: WizardState; updateWizard: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void; colors: ReturnType<typeof useColors> }) {
  const options = [
    { n: 1, label: "1 meal", sub: "One main meal per day" },
    { n: 2, label: "2 meals", sub: "Breakfast and dinner" },
    { n: 3, label: "3 meals", sub: "Breakfast, lunch, and dinner" },
  ];

  return (
    <View>
      <Text style={[stepStyles.heading, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
        How many meals per day?
      </Text>
      <Text style={[stepStyles.sub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        Macros are distributed evenly across all slots, with carbs front-loaded earlier in the day.
      </Text>

      <View style={{ marginTop: 20, gap: 10 }}>
        {options.map((o) => (
          <OptionCard key={o.n} selected={wizard.mealsPerDay === o.n} onPress={() => updateWizard("mealsPerDay", o.n)} colors={colors}>
            <Text style={[stepStyles.optTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>{o.label}</Text>
            <Text style={[stepStyles.optSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{o.sub}</Text>
          </OptionCard>
        ))}
      </View>
    </View>
  );
}

// ── Step 5: Prep mode ─────────────────────────────────────────────────────────

function StepPrepMode({ wizard, updateWizard, colors }: { wizard: WizardState; updateWizard: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void; colors: ReturnType<typeof useColors> }) {
  const slots = SLOT_NAMES.slice(0, wizard.mealsPerDay);

  const toggle = (slotName: string, mode: "prep" | "cook") => {
    Haptics.selectionAsync();
    updateWizard("prepPerSlot", { ...wizard.prepPerSlot, [slotName.toLowerCase()]: mode });
  };

  return (
    <View>
      <Text style={[stepStyles.heading, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
        Prep or cook each meal?
      </Text>
      <Text style={[stepStyles.sub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        Prepped meals are batch-cooked once. Cook meals are made fresh each time.
      </Text>

      <View style={{ marginTop: 20, gap: 14 }}>
        {slots.map((slot) => {
          const current = wizard.prepPerSlot[slot.toLowerCase()] ?? "cook";
          return (
            <View key={slot} style={[stepStyles.prepRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[stepStyles.prepSlotName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                {slot}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["prep", "cook"] as const).map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    onPress={() => toggle(slot, mode)}
                    activeOpacity={0.8}
                    style={[
                      stepStyles.modeBtn,
                      current === mode
                        ? { backgroundColor: colors.primary }
                        : { backgroundColor: colors.secondary, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[stepStyles.modeBtnText, {
                      fontFamily: "Inter_500Medium",
                      color: current === mode ? colors.primaryForeground : colors.mutedForeground,
                    }]}>
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function LabeledInput({
  label, value, onChangeText, keyboardType, placeholder, colors,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: "numeric" | "default";
  placeholder?: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View>
      <Text style={[stepStyles.label, { color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginBottom: 6 }]}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? "default"}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        style={[stepStyles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17 },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  emptyTitle: { fontSize: 20, textAlign: "center", marginBottom: 12 },
  emptyBody: { fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 28 },
  emptyBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  emptyBtnText: { fontSize: 15 },
});

const wizardHeaderStyles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, paddingBottom: 12 },
  title: { fontSize: 17 },
  step: { fontSize: 12, marginTop: 2 },
  progressTrack: { height: 3, width: "100%", marginBottom: 4 },
  progressFill: { height: 3, borderRadius: 2 },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 20, borderTopWidth: StyleSheet.hairlineWidth },
  nextBtn: { height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  nextBtnText: { fontSize: 16 },
});

const stepStyles = StyleSheet.create({
  heading: { fontSize: 20, marginBottom: 8 },
  sub: { fontSize: 14, lineHeight: 22 },
  label: { fontSize: 12, letterSpacing: 0.5 },
  optTitle: { fontSize: 15, marginBottom: 2 },
  optSub: { fontSize: 12, lineHeight: 18 },
  allergenCard: { flexDirection: "row", alignItems: "flex-start", borderWidth: 1.5, borderRadius: 14, padding: 14, gap: 10 },
  textInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  stepperBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 16 },
  stepBtn: { padding: 20 },
  stepVal: { fontSize: 40 },
  stepLabel: { fontSize: 14, marginTop: 2 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  infoText: { fontSize: 13, flex: 1 },
  prepRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 14, padding: 16 },
  prepSlotName: { fontSize: 15 },
  modeBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  modeBtnText: { fontSize: 13 },
});
