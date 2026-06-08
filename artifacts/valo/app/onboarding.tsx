import React, { useState, useRef, useCallback } from "react";
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
import { useValoAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { markOnboardingComplete } from "@/hooks/onboardingState";

import StepValoIntro from "@/components/onboarding/StepValoIntro";
import StepLanguage from "@/components/onboarding/StepLanguage";
import Step1Identity from "@/components/onboarding/Step1Identity";
import StepBirthday from "@/components/onboarding/StepBirthday";
import StepMicPermission from "@/components/onboarding/StepMicPermission";
import StepVoiceCall from "@/components/onboarding/StepVoiceCall";
import StepConnect from "@/components/onboarding/StepConnect";
import StepPriorities from "@/components/onboarding/StepPriorities";
import StepWants from "@/components/onboarding/StepWants";
import StepMotivation from "@/components/onboarding/StepMotivation";
import StepOpenText from "@/components/onboarding/StepOpenText";
import StepCallTime from "@/components/onboarding/StepCallTime";
import StepComplete from "@/components/onboarding/StepComplete";

type StepName =
  | "welcome"
  | "language"
  | "identity"
  | "birthday"
  | "mic_permission"
  | "voice"
  | "priorities"
  | "wants"
  | "motivation"
  | "ideal_day"
  | "struggling"
  | "people"
  | "goal_90"
  | "weighing"
  | "call_time"
  | "remember_this"
  | "connect"
  | "complete";

// Voice path skips the text-only deep-profile questions (Valo collects those verbally)
const VOICE_SEQUENCE: StepName[] = [
  "language", "identity", "birthday", "mic_permission", "voice", "connect",
];
const TEXT_SEQUENCE: StepName[] = [
  "language", "identity", "birthday", "mic_permission", "voice",
  "priorities", "wants", "motivation",
  "ideal_day", "struggling", "people", "goal_90", "weighing", "call_time", "remember_this",
  "connect",
];

function getProgress(
  step: StepName,
  voiceCallCompleted: boolean,
): { current: number; total: number } {
  if (step === "welcome" || step === "complete") return { current: 0, total: 1 };
  const seq = voiceCallCompleted ? VOICE_SEQUENCE : TEXT_SEQUENCE;
  const idx = seq.indexOf(step);
  return { current: idx === -1 ? 1 : idx + 1, total: seq.length };
}

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

function ProgressBar({
  current,
  total,
  colors,
}: {
  current: number;
  total: number;
  colors: any;
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

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken, updateName } = useValoAuth();

  const [step, setStep] = useState<StepName>("welcome");
  const [voiceCallCompleted, setVoiceCallCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [allData, setAllData] = useState<Record<string, any>>({});
  const [completedProfile, setCompletedProfile] = useState<any>(null);

  const currentDataRef = useRef<{ data: Record<string, any>; valid: boolean }>({
    data: {},
    valid: false,
  });
  const [currentValid, setCurrentValid] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

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

  const patchOnboarding = useCallback(
    async (data: Record<string, any>) => {
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
    async (currentStep: number, answers: Record<string, any>) => {
      try {
        const token = await getToken();
        await fetch(`${getApiBase()}/api/onboarding/progress`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ lastQuestion: currentStep, answersSOFar: answers }),
        });
      } catch {
        // Non-critical — don't block the user
      }
    },
    [getToken],
  );

  const handleStepChange = useCallback((data: Record<string, any>, valid: boolean) => {
    currentDataRef.current = { data, valid };
    setCurrentValid(valid);
  }, []);

  // ── Complete onboarding — calls Claude endpoint ──────────────────────────
  const completeOnboarding = useCallback(
    async (data: Record<string, any>) => {
      setCompleting(true);
      const answers = {
        name: data.name,
        area_to_improve: data.lifePriorities,
        ideal_day: data.idealDay,
        change_struggling_with: data.changeStruggling,
        important_people: data.importantPeople,
        motivation: data.userMotivation,
        success_90_days: data.goal90Days,
        weighing_on_you: data.weighingOn,
        call_time: data.preferredCallTime,
        remember_this: data.rememberThis,
      };

      try {
        const token = await getToken();
        const res = await fetch(`${getApiBase()}/api/onboarding/complete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ answers }),
        });
        if (res.ok) {
          const result = await res.json() as { success: boolean; profile: any };
          setCompletedProfile(result.profile);
        }
      } catch {
        // Fail silently — we still transition to complete screen
      } finally {
        setCompleting(false);
      }
    },
    [getToken],
  );

  const navigateToApp = useCallback(async () => {
    await AsyncStorage.setItem("@valo/onboarding-complete", "true");
    markOnboardingComplete();
    router.replace("/(tabs)/checkin");
  }, [router]);

  // ── Step handlers ─────────────────────────────────────────────────────────

  const handleWelcomeBegin = useCallback(() => {
    animateTransition(() => {
      setStep("language");
      setCurrentValid(false);
    });
  }, [animateTransition]);

  const handleLanguageContinue = useCallback(
    (data: Record<string, any>) => {
      void patchOnboarding(data).catch(() => {});
      setAllData((prev) => ({ ...prev, ...data }));
      animateTransition(() => {
        setStep("identity");
        setCurrentValid(false);
      });
    },
    [patchOnboarding, animateTransition],
  );

  const handleNext = useCallback(async () => {
    if (!currentValid || saving) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSaving(true);
    const { data } = currentDataRef.current;
    try {
      await patchOnboarding(data);
      if (data.name) updateName(data.name);
      setAllData((prev) => ({ ...prev, ...data }));
      animateTransition(() => {
        setStep("birthday");
        setCurrentValid(false);
      });
    } catch {
      if (data.name) updateName(data.name);
      setAllData((prev) => ({ ...prev, ...data }));
      animateTransition(() => {
        setStep("birthday");
        setCurrentValid(false);
      });
    } finally {
      setSaving(false);
    }
  }, [currentValid, saving, patchOnboarding, animateTransition, updateName]);

  const handleBirthdayContinue = useCallback(
    (data: Record<string, any>) => {
      void patchOnboarding(data).catch(() => {});
      setAllData((prev) => ({ ...prev, ...data }));
      animateTransition(() => setStep("mic_permission"));
    },
    [patchOnboarding, animateTransition],
  );

  const handleBirthdaySkip = useCallback(() => {
    animateTransition(() => setStep("mic_permission"));
  }, [animateTransition]);

  const handleMicGranted = useCallback(
    (micPermission: boolean) => {
      void patchOnboarding({ microphonePermission: micPermission }).catch(() => {});
      setAllData((prev) => ({ ...prev, microphonePermission: micPermission }));
      animateTransition(() => {
        setStep("voice");
        setCurrentValid(false);
      });
    },
    [patchOnboarding, animateTransition],
  );

  const handleVoiceCallComplete = useCallback(() => {
    setVoiceCallCompleted(true);
    animateTransition(() => {
      setStep("connect");
      setCurrentValid(false);
    });
  }, [animateTransition]);

  const handleSkipVoiceCall = useCallback(() => {
    animateTransition(() => {
      setStep("priorities");
      setCurrentValid(false);
    });
  }, [animateTransition]);

  // Generic text step continue — saves data and moves to next step
  const handleTextStepContinue = useCallback(
    (data: Record<string, any>, nextStep: StepName) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      void patchOnboarding(data).catch(() => {});
      const merged = { ...allData, ...data };
      setAllData(merged);
      void saveProgress(TEXT_SEQUENCE.indexOf(nextStep), merged);
      animateTransition(() => setStep(nextStep));
    },
    [patchOnboarding, animateTransition, allData, saveProgress],
  );

  const handleTextStepSkip = useCallback(
    (nextStep: StepName) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      animateTransition(() => setStep(nextStep));
    },
    [animateTransition],
  );

  // Open-text step continue — stores locally and moves forward
  const handleOpenTextContinue = useCallback(
    (data: Record<string, any>, nextStep: StepName) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const merged = { ...allData, ...data };
      setAllData(merged);
      void saveProgress(TEXT_SEQUENCE.indexOf(nextStep), merged);
      animateTransition(() => setStep(nextStep));
    },
    [animateTransition, allData, saveProgress],
  );

  const handleOpenTextSkip = useCallback(
    (nextStep: StepName) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      animateTransition(() => setStep(nextStep));
    },
    [animateTransition],
  );

  // StepConnect completion → Claude processing → complete screen
  const handleConnectComplete = useCallback(async () => {
    const data = allData;
    animateTransition(() => setStep("complete"));
    await completeOnboarding(data);
  }, [allData, animateTransition, completeOnboarding]);

  const handleBack = useCallback(() => {
    if (saving) return;
    const backMap: Partial<Record<StepName, StepName>> = {
      identity: "language",
      birthday: "identity",
      mic_permission: "birthday",
      wants: "priorities",
      motivation: "wants",
      ideal_day: "motivation",
      struggling: "ideal_day",
      people: "struggling",
      goal_90: "people",
      weighing: "goal_90",
      call_time: "weighing",
      remember_this: "call_time",
    };
    const target = backMap[step];
    if (!target) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateTransition(() => {
      setStep(target);
      setCurrentValid(false);
    });
  }, [step, saving, animateTransition]);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = insets.bottom;

  const showHeader = step !== "voice" && step !== "welcome" && step !== "complete";
  const showContinueBtn = step === "identity";
  const backAllowedSteps: StepName[] = [
    "identity", "birthday", "mic_permission", "wants", "motivation",
    "ideal_day", "struggling", "people", "goal_90", "weighing", "call_time", "remember_this",
  ];
  const backDisabled = !backAllowedSteps.includes(step);
  const { current: progressCurrent, total: progressTotal } = getProgress(step, voiceCallCompleted);

  if (step === "welcome") {
    return (
      <StepValoIntro
        name={allData.name}
        onBegin={handleWelcomeBegin}
      />
    );
  }

  if (step === "complete") {
    return (
      <View style={[styles.completeContainer, { backgroundColor: colors.background, paddingTop: topPad + 24, paddingBottom: bottomPad + 24, paddingHorizontal: 24 }]}>
        <StepComplete
          name={allData.name ?? completedProfile?.name}
          callTime={completedProfile?.user_call_time ?? allData.preferredCallTime}
          loading={completing}
          onGo={navigateToApp}
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

      {!showHeader && (
        <View style={{ height: topPad + 8 }} />
      )}

      <Animated.View style={[styles.animated, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === "language" && (
            <StepLanguage onContinue={handleLanguageContinue} />
          )}

          {step === "identity" && <Step1Identity {...stepProps} />}

          {step === "birthday" && (
            <StepBirthday
              onContinue={handleBirthdayContinue}
              onSkip={handleBirthdaySkip}
            />
          )}

          {step === "mic_permission" && (
            <StepMicPermission onGranted={handleMicGranted} />
          )}

          {step === "voice" && (
            <StepVoiceCall
              {...stepProps}
              onAdvance={handleVoiceCallComplete}
              onSkip={handleSkipVoiceCall}
            />
          )}

          {step === "priorities" && (
            <StepPriorities
              onContinue={(data) => handleTextStepContinue(data, "wants")}
              onSkip={() => handleTextStepSkip("wants")}
            />
          )}

          {step === "wants" && (
            <StepWants
              onContinue={(data) => handleTextStepContinue(data, "motivation")}
              onSkip={() => handleTextStepSkip("motivation")}
            />
          )}

          {step === "motivation" && (
            <StepMotivation
              onContinue={(data) => handleTextStepContinue(data, "ideal_day")}
              onSkip={() => handleTextStepSkip("ideal_day")}
            />
          )}

          {step === "ideal_day" && (
            <StepOpenText
              question="What does your ideal day look like — what would make you feel like you really lived it?"
              field="idealDay"
              onContinue={(data) => handleOpenTextContinue(data, "struggling")}
              onSkip={() => handleOpenTextSkip("struggling")}
            />
          )}

          {step === "struggling" && (
            <StepOpenText
              question="What's something you keep trying to change about yourself but haven't cracked yet?"
              field="changeStruggling"
              onContinue={(data) => handleOpenTextContinue(data, "people")}
              onSkip={() => handleOpenTextSkip("people")}
            />
          )}

          {step === "people" && (
            <StepOpenText
              question="Who are the most important people in your life right now?"
              placeholder="Family, partner, friends, colleagues..."
              field="importantPeople"
              onContinue={(data) => handleOpenTextContinue(data, "goal_90")}
              onSkip={() => handleOpenTextSkip("goal_90")}
            />
          )}

          {step === "goal_90" && (
            <StepOpenText
              question="What does success look like for you in the next 90 days?"
              placeholder="Be specific — what would feel like a real win?"
              field="goal90Days"
              onContinue={(data) => handleOpenTextContinue(data, "weighing")}
              onSkip={() => handleOpenTextSkip("weighing")}
            />
          )}

          {step === "weighing" && (
            <StepOpenText
              question="Is there anything you're dealing with right now that's been weighing on you?"
              placeholder="No pressure — share only what feels right."
              field="weighingOn"
              onContinue={(data) => handleOpenTextContinue(data, "call_time")}
              onSkip={() => handleOpenTextSkip("call_time")}
            />
          )}

          {step === "call_time" && (
            <StepCallTime
              onContinue={(data) => handleOpenTextContinue(data, "remember_this")}
              onSkip={() => handleOpenTextSkip("remember_this")}
            />
          )}

          {step === "remember_this" && (
            <StepOpenText
              question="What's one thing you want me to always remember about you?"
              placeholder="Anything that defines who you are..."
              field="rememberThis"
              onContinue={(data) => handleOpenTextContinue(data, "connect")}
              onSkip={() => handleOpenTextSkip("connect")}
            />
          )}

          {step === "connect" && (
            <StepConnect
              name={allData.name ?? ""}
              onComplete={handleConnectComplete}
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
            onPress={handleNext}
            disabled={!currentValid || saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <>
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
                <Feather
                  name="arrow-right"
                  size={18}
                  color={currentValid ? colors.primaryForeground : colors.mutedForeground}
                />
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  completeContainer: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: { width: 28, height: 28, justifyContent: "center", alignItems: "center" },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 3, borderRadius: 2 },
  stepLabel: { fontSize: 12, minWidth: 36, textAlign: "right" },
  animated: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  bottomActions: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
  },
  continueBtn: {
    height: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  continueBtnText: { fontSize: 16 },
});
