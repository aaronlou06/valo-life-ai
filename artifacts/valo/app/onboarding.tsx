import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { getLocales, getCalendars } from "expo-localization";
import { useValoAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { markOnboardingComplete } from "@/hooks/onboardingState";

import StepValoIntro from "@/components/onboarding/StepValoIntro";
import Step1Identity from "@/components/onboarding/Step1Identity";
import StepLifeAreas from "@/components/onboarding/StepLifeAreas";
import StepCheckinSetup from "@/components/onboarding/StepCheckinSetup";
import StepConnect from "@/components/onboarding/StepConnect";
import StepComplete from "@/components/onboarding/StepComplete";

// ── Step types ────────────────────────────────────────────────────────────────

type StepName = "welcome" | "identity" | "life_areas" | "checkin_setup" | "connect" | "complete";

// Steps shown in the progress bar (excludes welcome & complete screens)
const SEQUENCE: StepName[] = ["identity", "life_areas", "checkin_setup", "connect"];

const BACK_MAP: Partial<Record<StepName, StepName>> = {
  life_areas: "identity",
  checkin_setup: "life_areas",
  connect: "checkin_setup",
};

function getProgress(step: StepName): { current: number; total: number } {
  const idx = SEQUENCE.indexOf(step);
  if (idx === -1) return { current: 0, total: SEQUENCE.length };
  return { current: idx + 1, total: SEQUENCE.length };
}

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

// ── ProgressBar ───────────────────────────────────────────────────────────────

function ProgressBar({
  current,
  total,
  colors,
}: {
  current: number;
  total: number;
  colors: ReturnType<typeof useColors>;
}) {
  const progress = useRef(new Animated.Value(current / total)).current;

  React.useEffect(() => {
    Animated.timing(progress, {
      toValue: current / total,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [current, total]);

  return (
    <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
      <Animated.View
        style={[
          styles.progressFill,
          {
            backgroundColor: colors.primary,
            width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
          },
        ]}
      />
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken, updateName } = useValoAuth();

  const [step, setStep] = useState<StepName>("welcome");
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [allData, setAllData] = useState<Record<string, unknown>>({});
  // false until the mount status-check resolves; prevents welcome-screen flash on resume
  const [resumeChecked, setResumeChecked] = useState(false);

  // identity step uses an external Continue button; other steps handle Continue internally
  const currentDataRef = useRef<{ data: Record<string, unknown>; valid: boolean }>({ data: {}, valid: false });
  const [currentValid, setCurrentValid] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // ── Resume-from-last-step on mount ──────────────────────────────────────────

  useEffect(() => {
    void (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${getApiBase()}/api/onboarding/status`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const status = (await res.json()) as {
            onboardingCompleted: boolean;
            lastStep: string | null;
            onboardingProgress?: {
              answersSOFar?: Record<string, unknown>;
            } | null;
          };

          if (!status.onboardingCompleted) {
            const lastStep = status.lastStep as StepName | null;
            const answers = status.onboardingProgress?.answersSOFar ?? {};

            if (lastStep && SEQUENCE.includes(lastStep)) {
              // Restore any previously-saved answers so subsequent screens have context
              if (Object.keys(answers).length > 0) {
                setAllData(answers);
                if (answers.name) updateName(answers.name as string);
              }
              // Jump directly to the last incomplete step (no animation — instant)
              setStep(lastStep);
            }
          }
        }
      } catch {
        // Non-critical — start from welcome if status check fails
      } finally {
        setResumeChecked(true);
      }
    })();
    // Run once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Animation ───────────────────────────────────────────────────────────────

  const animateTransition = useCallback(
    (next: () => void) => {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: -20, duration: 180, useNativeDriver: true }),
      ]).start(() => {
        next();
        scrollRef.current?.scrollTo({ y: 0, animated: false });
        slideAnim.setValue(24);
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.timing(slideAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
        ]).start();
      });
    },
    [fadeAnim, slideAnim],
  );

  // ── API helpers ─────────────────────────────────────────────────────────────

  const patchOnboarding = useCallback(
    async (data: Record<string, unknown>) => {
      const token = await getToken();
      const res = await fetch(`${getApiBase()}/api/onboarding/save`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Save failed");
    },
    [getToken],
  );

  const saveProgress = useCallback(
    async (lastStep: string, answers: Record<string, unknown>) => {
      try {
        const token = await getToken();
        await fetch(`${getApiBase()}/api/onboarding/progress`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ lastStep, answersSOFar: answers }),
        });
      } catch {
        // Non-critical — progress save failing never blocks the user
      }
    },
    [getToken],
  );

  const completeOnboarding = useCallback(
    async (data: Record<string, unknown>) => {
      setCompleting(true);
      try {
        const token = await getToken();
        await fetch(`${getApiBase()}/api/onboarding/complete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          // Chip-selected data was already saved per-step via /onboarding/save.
          // We pass name so Claude can reference it, but there are no open-text
          // answers in this flow — the route handles the empty-answers case.
          body: JSON.stringify({ answers: { name: data.name } }),
        });
      } catch {
        // Fail silently — the user still reaches Home
      } finally {
        setCompleting(false);
      }
    },
    [getToken],
  );

  // ── Navigation ──────────────────────────────────────────────────────────────

  const navigateToApp = useCallback(
    async (goToVoice?: boolean) => {
      await AsyncStorage.setItem("@valo/onboarding-complete", "true");
      markOnboardingComplete();
      router.replace(goToVoice ? "/voice" : "/(tabs)");
    },
    [router],
  );

  // ── Step handlers ────────────────────────────────────────────────────────────

  // Screen 1 (Welcome): detect device locale + timezone, save silently, advance immediately
  const handleWelcomeBegin = useCallback(() => {
    void (async () => {
      try {
        const locales = getLocales();
        const calendars = getCalendars();
        const preferredLanguage = locales[0]?.languageCode ?? "en";
        const callTimezone = calendars[0]?.timeZone ?? null;
        void patchOnboarding({
          preferredLanguage,
          ...(callTimezone ? { callTimezone } : {}),
        }).catch(() => {});
      } catch {
        // Non-critical — proceed regardless of locale detection errors
      }
    })();
    // Transition immediately; locale save fires in the background
    animateTransition(() => {
      setStep("identity");
      setCurrentValid(false);
    });
  }, [patchOnboarding, animateTransition]);

  // Screen 2 (identity): Step1Identity reports via onChange; external button calls this
  const handleStepChange = useCallback((data: Record<string, unknown>, valid: boolean) => {
    currentDataRef.current = { data, valid };
    setCurrentValid(valid);
  }, []);

  const handleIdentityContinue = useCallback(async () => {
    if (!currentValid || saving) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSaving(true);
    const { data } = currentDataRef.current;
    const merged = { ...allData, ...data };
    try {
      await patchOnboarding(data);
      if (data.name) updateName(data.name as string);
    } catch {
      // Save failed — still advance and update name optimistically
      if (data.name) updateName(data.name as string);
    } finally {
      setSaving(false);
    }
    setAllData(merged);
    void saveProgress("life_areas", merged);
    animateTransition(() => {
      setStep("life_areas");
      setCurrentValid(false);
    });
  }, [currentValid, saving, allData, patchOnboarding, updateName, saveProgress, animateTransition]);

  // Screen 3 (life_areas): StepLifeAreas calls back here on its internal Continue
  const handleLifeAreasContinue = useCallback(
    (data: Record<string, unknown>) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      void patchOnboarding(data).catch(() => {});
      const merged = { ...allData, ...data };
      setAllData(merged);
      void saveProgress("checkin_setup", merged);
      animateTransition(() => {
        setStep("checkin_setup");
        setCurrentValid(false);
      });
    },
    [allData, patchOnboarding, saveProgress, animateTransition],
  );

  // Screen 4 (checkin_setup): StepCheckinSetup calls back here on its internal Continue
  const handleCheckinSetupContinue = useCallback(
    (data: Record<string, unknown>) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      void patchOnboarding(data).catch(() => {});
      const merged = { ...allData, ...data };
      setAllData(merged);
      void saveProgress("connect", merged);
      animateTransition(() => {
        setStep("connect");
        setCurrentValid(false);
      });
    },
    [allData, patchOnboarding, saveProgress, animateTransition],
  );

  // Screen 5 (connect): fires /onboarding/complete then transitions to final screen
  const handleConnectComplete = useCallback(async () => {
    const data = allData;
    animateTransition(() => setStep("complete"));
    await completeOnboarding(data);
  }, [allData, animateTransition, completeOnboarding]);

  const handleBack = useCallback(() => {
    if (saving) return;
    const target = BACK_MAP[step];
    if (!target) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateTransition(() => {
      setStep(target);
      setCurrentValid(false);
    });
  }, [step, saving, animateTransition]);

  // ── Layout helpers ───────────────────────────────────────────────────────────

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = insets.bottom;

  const showHeader = step !== "welcome" && step !== "complete";
  const showContinueBtn = step === "identity";
  const backDisabled = !(step in BACK_MAP);
  const { current: progressCurrent, total: progressTotal } = getProgress(step);

  // ── Render ──────────────────────────────────────────────────────────────────

  // Show blank background while resume check is in-flight — prevents welcome
  // screen from flashing before jumping to the resumed step for returning users.
  if (!resumeChecked) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  if (step === "welcome") {
    return <StepValoIntro onBegin={handleWelcomeBegin} />;
  }

  if (step === "complete") {
    return (
      <View
        style={[
          styles.completeContainer,
          {
            backgroundColor: colors.background,
            paddingTop: topPad + 24,
            paddingBottom: bottomPad + 24,
            paddingHorizontal: 24,
          },
        ]}
      >
        <StepComplete
          name={allData.name as string | undefined}
          callTime={allData.preferredCallTime as string | undefined}
          loading={completing}
          onGo={() => void navigateToApp(false)}
          onFirstCheckin={() => void navigateToApp(true)}
        />
      </View>
    );
  }

  const stepProps = { initialValue: allData, onChange: handleStepChange };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      {showHeader && (
        <View style={[styles.header, { paddingTop: topPad + 8 }]}>
          <TouchableOpacity
            onPress={handleBack}
            style={[styles.backBtn, { opacity: backDisabled ? 0 : 1 }]}
            disabled={backDisabled}
          >
            <Feather name="arrow-left" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
          <ProgressBar current={progressCurrent} total={progressTotal} colors={colors} />
          <Text style={[styles.stepLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {progressCurrent} of {progressTotal}
          </Text>
        </View>
      )}

      {!showHeader && <View style={{ height: topPad + 8 }} />}

      <Animated.View style={[styles.animated, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === "identity" && <Step1Identity {...stepProps} />}

          {step === "life_areas" && (
            <StepLifeAreas onContinue={handleLifeAreasContinue} initialValue={allData} />
          )}

          {step === "checkin_setup" && (
            <StepCheckinSetup onContinue={handleCheckinSetupContinue} initialValue={allData} />
          )}

          {step === "connect" && (
            <StepConnect
              name={(allData.name as string) ?? ""}
              onComplete={() => void handleConnectComplete()}
            />
          )}
        </ScrollView>
      </Animated.View>

      {showContinueBtn && (
        <View style={[styles.bottomActions, { paddingBottom: bottomPad + 16 }]}>
          <TouchableOpacity
            style={[
              styles.continueBtn,
              {
                backgroundColor: currentValid ? colors.primary : colors.muted,
                opacity: saving ? 0.8 : 1,
              },
            ]}
            onPress={() => void handleIdentityContinue()}
            disabled={!currentValid || saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <Text
                style={[
                  styles.continueBtnText,
                  {
                    color: currentValid ? colors.primaryForeground : colors.mutedForeground,
                    fontFamily: "Inter_600SemiBold",
                  },
                ]}
              >
                Continue
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  backBtn: { padding: 6 },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },
  stepLabel: { fontSize: 12, minWidth: 36, textAlign: "right" },
  animated: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 32 },
  completeContainer: { flex: 1 },
  bottomActions: { paddingHorizontal: 24, paddingTop: 12 },
  continueBtn: { height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  continueBtnText: { fontSize: 16 },
});
