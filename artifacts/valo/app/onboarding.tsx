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
import { markOnboardingComplete } from "@/hooks/onboardingState";

import Step1Identity from "@/components/onboarding/Step1Identity";
import Step2Priorities from "@/components/onboarding/Step2Priorities";
import Step3Feelings from "@/components/onboarding/Step3Feelings";
import Step4Motivation from "@/components/onboarding/Step4Motivation";
import Step5Bio from "@/components/onboarding/Step5Bio";
import Step6Fitness from "@/components/onboarding/Step6Fitness";
import Step7Diet from "@/components/onboarding/Step7Diet";
import Step8Rhythm from "@/components/onboarding/Step8Rhythm";
import Step9Call from "@/components/onboarding/Step9Call";
import WelcomeScreen from "@/components/onboarding/WelcomeScreen";

const TOTAL_STEPS = 9;

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

function ProgressBar({ step, total, colors }: { step: number; total: number; colors: any }) {
  const progress = useRef(new Animated.Value(step / total)).current;

  React.useEffect(() => {
    Animated.timing(progress, {
      toValue: step / total,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [step, total]);

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

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
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
    [fadeAnim, slideAnim]
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
    [getToken]
  );

  const handleStepChange = useCallback((data: Record<string, any>, valid: boolean) => {
    currentDataRef.current = { data, valid };
    setCurrentValid(valid);
  }, []);

  const finishOnboarding = useCallback(
    async (extraData?: Record<string, any>) => {
      const srcData = extraData ?? currentDataRef.current.data;
      const patchData: Record<string, any> = { ...srcData, onboardingCompleted: true };
      try {
        await patchOnboarding(patchData);
      } catch {
        // proceed even if network fails
      }
      if (srcData.name) updateName(srcData.name as string);
      markOnboardingComplete();
      setAllData((prev) => ({ ...prev, ...srcData }));
      animateTransition(() => setCompleted(true));
    },
    [patchOnboarding, updateName, animateTransition]
  );

  const handleNext = useCallback(async () => {
    if (!currentValid || saving) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSaving(true);

    const { data } = currentDataRef.current;
    const isLast = step === TOTAL_STEPS;

    try {
      if (isLast) {
        await finishOnboarding(data);
      } else {
        await patchOnboarding(data);
        if (data.name) updateName(data.name);
        setAllData((prev) => ({ ...prev, ...data }));
        animateTransition(() => {
          setStep((s) => s + 1);
          setCurrentValid(false);
        });
      }
    } catch {
      if (isLast) {
        if (data.name) updateName(data.name);
        markOnboardingComplete();
        setAllData((prev) => ({ ...prev, ...data }));
        animateTransition(() => setCompleted(true));
      } else {
        if (data.name) updateName(data.name);
        setAllData((prev) => ({ ...prev, ...data }));
        animateTransition(() => {
          setStep((s) => s + 1);
          setCurrentValid(false);
        });
      }
    } finally {
      setSaving(false);
    }
  }, [currentValid, saving, step, patchOnboarding, finishOnboarding, animateTransition, updateName]);

  const handleBack = useCallback(() => {
    if (step === 1 || saving) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateTransition(() => {
      setStep((s) => s - 1);
      setCurrentValid(false);
    });
  }, [step, saving, animateTransition]);

  const handleSkip = useCallback(async () => {
    if (saving) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSaving(true);
    try {
      await patchOnboarding({ onboardingCompleted: true });
      markOnboardingComplete();
      animateTransition(() => setCompleted(true));
    } catch {
      markOnboardingComplete();
      animateTransition(() => setCompleted(true));
    } finally {
      setSaving(false);
    }
  }, [saving, patchOnboarding, animateTransition]);

  if (completed) {
    return (
      <WelcomeScreen
        allData={allData}
        onBegin={() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.replace("/(tabs)/today");
        }}
      />
    );
  }

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = insets.bottom;
  const stepProps = { initialValue: allData, onChange: handleStepChange };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity
          onPress={handleBack}
          style={[styles.backBtn, { opacity: step === 1 ? 0 : 1 }]}
          disabled={step === 1}
        >
          <Feather name="arrow-left" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
        <ProgressBar step={step} total={TOTAL_STEPS} colors={colors} />
        <Text style={[styles.stepLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {step} of {TOTAL_STEPS}
        </Text>
      </View>

      {/* Animated step content */}
      <Animated.View style={[styles.animated, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 1 && <Step1Identity {...stepProps} />}
          {step === 2 && <Step2Priorities {...stepProps} />}
          {step === 3 && <Step3Feelings {...stepProps} />}
          {step === 4 && <Step4Motivation {...stepProps} />}
          {step === 5 && <Step5Bio {...stepProps} />}
          {step === 6 && <Step6Fitness {...stepProps} />}
          {step === 7 && <Step7Diet {...stepProps} />}
          {step === 8 && <Step8Rhythm {...stepProps} />}
          {step === 9 && <Step9Call {...stepProps} />}
        </ScrollView>
      </Animated.View>

      {/* Bottom actions */}
      <View style={[styles.bottomActions, { paddingBottom: bottomPad + 16 }]}>
        {step === TOTAL_STEPS && (
          <TouchableOpacity onPress={handleSkip} style={styles.skipBtn} disabled={saving}>
            <Text style={[styles.skipText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Skip for now
            </Text>
          </TouchableOpacity>
        )}
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
                {step === TOTAL_STEPS ? "Finish" : "Continue"}
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
  skipBtn: { alignItems: "center", paddingVertical: 4 },
  skipText: { fontSize: 14 },
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
