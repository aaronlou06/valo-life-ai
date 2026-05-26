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
  | "connect";

// Steps counted in the progress bar (welcome is a full-screen gate, excluded)
const VOICE_SEQUENCE: StepName[] = [
  "language", "identity", "birthday", "mic_permission", "voice", "connect",
];
const TEXT_SEQUENCE: StepName[] = [
  "language", "identity", "birthday", "mic_permission", "voice",
  "priorities", "wants", "motivation", "connect",
];

function getProgress(
  step: StepName,
  voiceCallCompleted: boolean,
): { current: number; total: number } {
  if (step === "welcome") return { current: 0, total: 1 };
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
  const [allData, setAllData] = useState<Record<string, any>>({});

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

  const handleStepChange = useCallback((data: Record<string, any>, valid: boolean) => {
    currentDataRef.current = { data, valid };
    setCurrentValid(valid);
  }, []);

  const finishOnboarding = useCallback(async () => {
    try {
      await patchOnboarding({ onboardingCompleted: true });
    } catch {
      // proceed even if network fails
    }
    await AsyncStorage.setItem("@valo/onboarding-complete", "true");
    markOnboardingComplete();
    router.replace("/(tabs)/today");
  }, [patchOnboarding, router]);

  // ── Welcome → Language ────────────────────────────────────────────────────
  const handleWelcomeBegin = useCallback(() => {
    animateTransition(() => {
      setStep("language");
      setCurrentValid(false);
    });
  }, [animateTransition]);

  // ── Language → Identity ───────────────────────────────────────────────────
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

  // ── Identity Continue button (outer) → Birthday ────────────────────────────
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

  // ── Birthday → Mic Permission ──────────────────────────────────────────────
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

  // ── Mic Permission → Voice ─────────────────────────────────────────────────
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

  // ── Voice call completed → Connect ─────────────────────────────────────────
  const handleVoiceCallComplete = useCallback(() => {
    setVoiceCallCompleted(true);
    animateTransition(() => {
      setStep("connect");
      setCurrentValid(false);
    });
  }, [animateTransition]);

  // ── Voice call skipped → Priorities ───────────────────────────────────────
  const handleSkipVoiceCall = useCallback(() => {
    animateTransition(() => {
      setStep("priorities");
      setCurrentValid(false);
    });
  }, [animateTransition]);

  // ── Text step continue ─────────────────────────────────────────────────────
  const handleTextStepContinue = useCallback(
    (data: Record<string, any>, nextStep: StepName) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      void patchOnboarding(data).catch(() => {});
      setAllData((prev) => ({ ...prev, ...data }));
      animateTransition(() => setStep(nextStep));
    },
    [patchOnboarding, animateTransition],
  );

  const handleTextStepSkip = useCallback(
    (nextStep: StepName) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      animateTransition(() => setStep(nextStep));
    },
    [animateTransition],
  );

  // ── Back navigation ────────────────────────────────────────────────────────
  const handleBack = useCallback(() => {
    if (saving) return;
    const backMap: Partial<Record<StepName, StepName>> = {
      identity: "language",
      birthday: "identity",
      mic_permission: "birthday",
      wants: "priorities",
      motivation: "wants",
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

  const showHeader = step !== "voice" && step !== "welcome";
  const showContinueBtn = step === "identity";
  const backAllowedSteps: StepName[] = ["identity", "birthday", "mic_permission", "wants", "motivation"];
  const backDisabled = !backAllowedSteps.includes(step);
  const { current: progressCurrent, total: progressTotal } = getProgress(step, voiceCallCompleted);

  // Welcome screen is rendered outside the scroll/header layout
  if (step === "welcome") {
    return (
      <StepValoIntro
        name={allData.name}
        onBegin={handleWelcomeBegin}
      />
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
              onContinue={(data) => handleTextStepContinue(data, "connect")}
              onSkip={() => handleTextStepSkip("connect")}
            />
          )}

          {step === "connect" && (
            <StepConnect
              name={allData.name ?? ""}
              onComplete={finishOnboarding}
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
