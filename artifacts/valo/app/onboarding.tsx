import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
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

type StepId = "name" | "priorities" | "goal" | "feelings" | "call" | "welcome";

interface StepConfig {
  id: StepId;
  question: string;
  subtext?: string;
  optional?: boolean;
}

const STEPS: StepConfig[] = [
  {
    id: "name",
    question: "Hi, I'm Valo — your personal AI companion.\n\nWhat's your name?",
  },
  {
    id: "priorities",
    question: "What matters most to you in life right now?",
    subtext: "Health, family, career, creativity — whatever feels most alive.",
  },
  {
    id: "goal",
    question: "What's your biggest goal at the moment?",
    subtext: "Be specific. The more real it is, the better Valo can help.",
  },
  {
    id: "feelings",
    question: "What do you want to feel more of each day?\n\nAnd less of?",
    subtext: "Valo will track this as you grow.",
  },
  {
    id: "call",
    question: "When would you like your daily debrief call?",
    subtext: "Valo will ring you each evening to reflect on the day together.",
    optional: true,
  },
];

const TOTAL_STEPS = STEPS.length;

function ProgressBar({ step, total, colors }: { step: number; total: number; colors: any }) {
  const progress = useRef(new Animated.Value(step / total)).current;

  useEffect(() => {
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

function TimePickerInline({
  value,
  onChange,
  colors,
}: {
  value: string;
  onChange: (v: string) => void;
  colors: any;
}) {
  const parts = value.split(":");
  const hh = parseInt(parts[0] ?? "20", 10);
  const mm = parseInt(parts[1] ?? "0", 10);

  const setHH = (h: number) => {
    const clamped = ((h % 24) + 24) % 24;
    onChange(`${String(clamped).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  };
  const setMM = (m: number) => {
    const clamped = ((m % 60) + 60) % 60;
    onChange(`${String(hh).padStart(2, "0")}:${String(clamped).padStart(2, "0")}`);
  };

  return (
    <View style={styles.timePicker}>
      <View style={styles.timeCol}>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setHH(hh + 1); }}
          style={[styles.timeBtn, { borderColor: colors.border }]}
        >
          <Feather name="chevron-up" size={18} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.timeDigit, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {String(hh).padStart(2, "0")}
        </Text>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setHH(hh - 1); }}
          style={[styles.timeBtn, { borderColor: colors.border }]}
        >
          <Feather name="chevron-down" size={18} color={colors.foreground} />
        </TouchableOpacity>
      </View>
      <Text style={[styles.timeColon, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>:</Text>
      <View style={styles.timeCol}>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMM(mm + 5); }}
          style={[styles.timeBtn, { borderColor: colors.border }]}
        >
          <Feather name="chevron-up" size={18} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.timeDigit, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          {String(mm).padStart(2, "0")}
        </Text>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMM(mm - 5); }}
          style={[styles.timeBtn, { borderColor: colors.border }]}
        >
          <Feather name="chevron-down" size={18} color={colors.foreground} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken, updateName } = useValoAuth();

  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  // Answers
  const [name, setName] = useState("");
  const [priorities, setPriorities] = useState("");
  const [goal, setGoal] = useState("");
  const [feelMore, setFeelMore] = useState("");
  const [feelLess, setFeelLess] = useState("");
  const [callTime, setCallTime] = useState("20:00");
  const [phoneNumber, setPhoneNumber] = useState("");

  // Animation
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const isWelcome = stepIndex === TOTAL_STEPS;
  const currentStep = STEPS[stepIndex];

  const animateTransition = useCallback((next: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -20, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      next();
      slideAnim.setValue(24);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]).start();
    });
  }, [fadeAnim, slideAnim]);

  const canContinue = useCallback((): boolean => {
    if (!currentStep) return true;
    switch (currentStep.id) {
      case "name": return name.trim().length > 0;
      case "priorities": return priorities.trim().length > 0;
      case "goal": return goal.trim().length > 0;
      case "feelings": return feelMore.trim().length > 0 || feelLess.trim().length > 0;
      case "call": return true;
      default: return true;
    }
  }, [currentStep, name, priorities, goal, feelMore, feelLess]);

  const saveAndFinish = useCallback(async () => {
    setSaving(true);
    try {
      const token = await getToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const apiBase = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

      const lifePrioritiesParts: string[] = [];
      if (priorities.trim()) lifePrioritiesParts.push(`Matters most: ${priorities.trim()}`);
      if (feelMore.trim()) lifePrioritiesParts.push(`Feel more of: ${feelMore.trim()}`);
      if (feelLess.trim()) lifePrioritiesParts.push(`Feel less of: ${feelLess.trim()}`);

      await fetch(`${apiBase}/api/settings`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          name: name.trim(),
          lifePriorities: lifePrioritiesParts.join("\n"),
          phoneNumber: phoneNumber.trim() || null,
          preferredCallTime: callTime,
          callTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          callsEnabled: phoneNumber.trim().length > 0,
        }),
      });

      if (goal.trim()) {
        await fetch(`${apiBase}/api/goals`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            title: goal.trim(),
            category: "personal",
            progressPercent: 0,
          }),
        });
      }

      if (name.trim()) updateName(name.trim());
      markOnboardingComplete();
      animateTransition(() => setStepIndex(TOTAL_STEPS));
    } catch {
      // Still complete onboarding even if save fails
      markOnboardingComplete();
      animateTransition(() => setStepIndex(TOTAL_STEPS));
    } finally {
      setSaving(false);
    }
  }, [getToken, updateName, name, priorities, feelMore, feelLess, phoneNumber, callTime, goal, animateTransition]);

  const handleContinue = useCallback(() => {
    if (!canContinue() || saving) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (stepIndex === TOTAL_STEPS - 1) {
      saveAndFinish();
    } else {
      animateTransition(() => setStepIndex((s) => s + 1));
    }
  }, [canContinue, saving, stepIndex, saveAndFinish, animateTransition]);

  const handleBack = useCallback(() => {
    if (stepIndex === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateTransition(() => setStepIndex((s) => s - 1));
  }, [stepIndex, animateTransition]);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = insets.bottom;

  // Welcome screen
  if (isWelcome) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad, paddingBottom: bottomPad + 24 }]}>
        <Animated.View style={[styles.welcomeContent, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={[styles.welcomeOrb, { backgroundColor: colors.primary + "22" }]}>
            <View style={[styles.welcomeOrbInner, { backgroundColor: colors.primary + "44" }]}>
              <Feather name="sun" size={28} color={colors.primary} />
            </View>
          </View>

          <Text style={[styles.welcomeTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Valo is ready.
          </Text>
          <Text style={[styles.welcomeSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Good to meet you, {name.trim() || "you"}. Here's what comes next.
          </Text>

          <View style={{ gap: 12, width: "100%", marginTop: 8 }}>
            {[
              { icon: "sun", text: "Each evening, Valo will debrief your day" },
              { icon: "trending-up", text: "Your habits, goals, and mood will be tracked" },
              { icon: "phone", text: phoneNumber.trim() ? `Daily call set for ${callTime}` : "Set up your daily call anytime in Settings" },
            ].map((item, i) => (
              <View key={i} style={[styles.welcomeBullet, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name={item.icon as any} size={16} color={colors.primary} />
                <Text style={[styles.welcomeBulletText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                  {item.text}
                </Text>
              </View>
            ))}
          </View>
        </Animated.View>

        <TouchableOpacity
          style={[styles.continueBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.replace("/(tabs)/today");
          }}
        >
          <Text style={[styles.continueBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
            Begin
          </Text>
          <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
        </TouchableOpacity>
      </View>
    );
  }

  const step = STEPS[stepIndex]!;
  const questionLabel = `${stepIndex + 1} of ${TOTAL_STEPS}`;

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
          style={[styles.backBtn, { opacity: stepIndex === 0 ? 0 : 1 }]}
          disabled={stepIndex === 0}
        >
          <Feather name="arrow-left" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
        <ProgressBar step={stepIndex + 1} total={TOTAL_STEPS} colors={colors} />
        <Text style={[styles.stepLabel, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {questionLabel}
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Valo question bubble */}
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
            Valo
          </Text>
          <Text style={[styles.question, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            {step.question}
          </Text>
          {step.subtext ? (
            <Text style={[styles.subtext, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {step.subtext}
            </Text>
          ) : null}
        </Animated.View>

        {/* Input area */}
        <Animated.View style={[styles.inputArea, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          {step.id === "name" && (
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your first name"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleContinue}
              style={[styles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
            />
          )}

          {step.id === "priorities" && (
            <TextInput
              value={priorities}
              onChangeText={setPriorities}
              placeholder="Family, career, health, creativity..."
              placeholderTextColor={colors.mutedForeground}
              autoFocus
              multiline
              numberOfLines={3}
              style={[styles.textInputMulti, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
            />
          )}

          {step.id === "goal" && (
            <TextInput
              value={goal}
              onChangeText={setGoal}
              placeholder="Run a marathon, launch my business, write my book..."
              placeholderTextColor={colors.mutedForeground}
              autoFocus
              multiline
              numberOfLines={3}
              style={[styles.textInputMulti, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
            />
          )}

          {step.id === "feelings" && (
            <View style={{ gap: 14 }}>
              <View>
                <Text style={[styles.dualLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                  MORE OF
                </Text>
                <TextInput
                  value={feelMore}
                  onChangeText={setFeelMore}
                  placeholder="Joy, focus, presence, connection..."
                  placeholderTextColor={colors.mutedForeground}
                  autoFocus
                  multiline
                  numberOfLines={2}
                  style={[styles.textInputMulti, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
                />
              </View>
              <View>
                <Text style={[styles.dualLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                  LESS OF
                </Text>
                <TextInput
                  value={feelLess}
                  onChangeText={setFeelLess}
                  placeholder="Stress, distraction, overthinking..."
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  numberOfLines={2}
                  style={[styles.textInputMulti, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
                />
              </View>
            </View>
          )}

          {step.id === "call" && (
            <View style={{ gap: 20 }}>
              <View style={[styles.callCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.callCardLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                  CALL TIME
                </Text>
                <TimePickerInline value={callTime} onChange={setCallTime} colors={colors} />
              </View>
              <View>
                <Text style={[styles.dualLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                  PHONE NUMBER
                </Text>
                <TextInput
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  placeholder="+1 555 000 0000"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="phone-pad"
                  style={[styles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
                />
                <Text style={[styles.callHint, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  Include country code. You can change this anytime in Settings.
                </Text>
              </View>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* Bottom actions */}
      <View style={[styles.bottomActions, { paddingBottom: bottomPad + 16 }]}>
        {step.optional && (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              saveAndFinish();
            }}
            style={styles.skipBtn}
          >
            <Text style={[styles.skipText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Skip for now
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            styles.continueBtn,
            {
              backgroundColor: canContinue() ? colors.primary : colors.muted,
              opacity: saving ? 0.8 : 1,
            },
          ]}
          onPress={handleContinue}
          disabled={!canContinue() || saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <>
              <Text style={[styles.continueBtnText, { color: canContinue() ? colors.primaryForeground : colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
                {stepIndex === TOTAL_STEPS - 1 ? "Finish" : "Continue"}
              </Text>
              <Feather name="arrow-right" size={18} color={canContinue() ? colors.primaryForeground : colors.mutedForeground} />
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

  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 32,
  },

  valoLabel: { fontSize: 13, letterSpacing: 0.5, marginBottom: 12 },
  question: { fontSize: 26, lineHeight: 34, marginBottom: 10 },
  subtext: { fontSize: 15, lineHeight: 22 },

  inputArea: { gap: 0 },
  dualLabel: { fontSize: 11, letterSpacing: 0.8, marginBottom: 8 },

  textInput: {
    height: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  textInputMulti: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    lineHeight: 24,
    textAlignVertical: "top",
  },

  callCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  callCardLabel: { fontSize: 11, letterSpacing: 0.8 },
  callHint: { fontSize: 12, marginTop: 8 },

  timePicker: { flexDirection: "row", alignItems: "center", gap: 10 },
  timeCol: { alignItems: "center", gap: 6 },
  timeBtn: {
    width: 48,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  timeDigit: { fontSize: 34, lineHeight: 42 },
  timeColon: { fontSize: 34, marginBottom: 4 },

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

  // Welcome
  welcomeContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    alignItems: "center",
    gap: 16,
  },
  welcomeOrb: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  welcomeOrbInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: "center",
    alignItems: "center",
  },
  welcomeTitle: { fontSize: 32, textAlign: "center" },
  welcomeSub: { fontSize: 16, textAlign: "center", lineHeight: 24, marginBottom: 8 },
  welcomeBullet: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  welcomeBulletText: { flex: 1, fontSize: 14, lineHeight: 20 },
});
