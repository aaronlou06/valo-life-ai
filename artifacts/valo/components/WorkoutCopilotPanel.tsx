import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/contexts/ThemeContext";
import { useValoAuth } from "@/contexts/AuthContext";
import { useWorkoutCopilot } from "@/contexts/WorkoutCopilotContext";

// The co-pilot bar floats just above the bottom tab bar.
const TAB_BAR_HEIGHT = 64;
const BAR_GAP = 8;

type MenuOption = {
  icon: keyof typeof Feather.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  route: string;
};

const MENU_OPTIONS: MenuOption[] = [
  {
    icon: "play",
    iconBg: "#F5DDD8",
    iconColor: "#A06050",
    title: "Start a workout",
    subtitle: "Begin a fresh session now",
    route: "/copilot-start",
  },
  {
    icon: "plus-square",
    iconBg: "#D8EBE3",
    iconColor: "#4A7D68",
    title: "Create or upload a workout",
    subtitle: "Build one from scratch or upload a file",
    route: "/copilot-create",
  },
  {
    icon: "edit-2",
    iconBg: "#E0D8CC",
    iconColor: "#7A6A5A",
    title: "Edit a workout",
    subtitle: "Adjust an existing saved workout",
    route: "/copilot-edit",
  },
  {
    icon: "calendar",
    iconBg: "#EDE8F8",
    iconColor: "#6A5A9A",
    title: "Build or upload a workout plan",
    subtitle: "Lay out a multi-week program",
    route: "/copilot-plan",
  },
  {
    icon: "download",
    iconBg: "#E7E0D2",
    iconColor: "#8A6D3A",
    title: "Import a workout",
    subtitle: "Pull in a workout from another source",
    route: "/copilot-import",
  },
];

function formatElapsed(startedAt: string, now: number): string {
  const start = new Date(startedAt).getTime();
  const totalSec = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Persistent, minimizable Workout Co-Pilot panel mounted at the app root so it
 * stays available across every tab. The minimized state is a slim bar; the
 * expanded state is a bottom sheet showing the action menu (and any active
 * session). Open/closed preference and the active session live in
 * WorkoutCopilotContext and are restored after a restart.
 */
export function WorkoutCopilotPanel() {
  const colors = useColors();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useTheme();
  const { isSignedIn } = useValoAuth();
  const isDark = colorScheme === "dark";

  const { hydrated, panelState, expand, minimize, activeSession, endSession } =
    useWorkoutCopilot();

  const slideAnim = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [modalVisible, setModalVisible] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const expanded = panelState === "expanded";

  // Tick once a second while a session is active so the elapsed time stays live.
  useEffect(() => {
    if (!activeSession) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    setNow(Date.now());
    return () => clearInterval(id);
  }, [activeSession]);

  // Drive the expand/collapse sheet animation off the shared panel state.
  useEffect(() => {
    if (expanded) {
      setModalVisible(true);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 600,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setModalVisible(false);
      });
    }
  }, [expanded, slideAnim, backdropOpacity]);

  // Hide on auth, onboarding, and inside the co-pilot's own flow screens (so the
  // bar doesn't float over the very screen it launched). The launcher hub
  // (copilot-modules) is intentionally NOT hidden.
  const isFlowRoute = MENU_OPTIONS.some((o) => pathname.startsWith(o.route));
  const isWorkoutRoute =
    pathname.startsWith("/copilot-workout") || pathname.startsWith("/copilot-summary");
  const hideOnRoute =
    pathname.startsWith("/onboarding") ||
    isFlowRoute ||
    isWorkoutRoute ||
    pathname.includes("sign-in") ||
    pathname.includes("sign-up");

  if (!hydrated || !isSignedIn || hideOnRoute) return null;

  function handleExpand() {
    Haptics.selectionAsync().catch(() => {});
    expand();
  }

  function go(route: string) {
    minimize();
    router.push(route as never);
  }

  const barBottom = insets.bottom + TAB_BAR_HEIGHT + BAR_GAP;
  const sheetBg = isDark ? "#242018" : "#FCFBF9";

  const barTitle = activeSession ? activeSession.name : "Workout Co-Pilot";
  const barSubtitle = activeSession
    ? formatElapsed(activeSession.startedAt, now)
    : "Tap to start a workout";

  return (
    <>
      {/* Minimized slim bar — always present above the tab bar */}
      <View style={[styles.barWrapper, { bottom: barBottom }]} pointerEvents="box-none">
        <Pressable
          onPress={handleExpand}
          style={({ pressed }) => [
            styles.bar,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: pressed ? 0.92 : 1,
            },
          ]}
        >
          <View
            style={[
              styles.barIcon,
              { backgroundColor: activeSession ? "#F5DDD8" : colors.secondary },
            ]}
          >
            <Feather
              name="activity"
              size={18}
              color={activeSession ? "#A06050" : colors.primary}
            />
          </View>
          <View style={styles.barText}>
            <Text
              numberOfLines={1}
              style={[styles.barTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}
            >
              {barTitle}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.barSubtitle,
                { color: activeSession ? colors.primary : colors.mutedForeground, fontFamily: "Inter_500Medium" },
              ]}
            >
              {barSubtitle}
            </Text>
          </View>
          {activeSession ? (
            <View style={[styles.liveDot, { backgroundColor: "#A06050" }]} />
          ) : null}
          <Feather name="chevron-up" size={20} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* Expanded sheet */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        onRequestClose={minimize}
        statusBarTranslucent
      >
        <View style={styles.modalRoot}>
          <TouchableWithoutFeedback onPress={minimize}>
            <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
          </TouchableWithoutFeedback>

          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: sheetBg,
                paddingBottom: insets.bottom + 16,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            <View style={styles.sheetHeader}>
              <Text
                style={[styles.sheetTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}
              >
                Workout Co-Pilot
              </Text>
              <TouchableOpacity
                onPress={minimize}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="chevron-down" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 10 }}
              style={styles.scroll}
            >
              {activeSession ? (
                <View style={[styles.activeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.activeTop}>
                    <View style={[styles.barIcon, { backgroundColor: "#F5DDD8" }]}>
                      <Feather name="activity" size={18} color="#A06050" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        numberOfLines={1}
                        style={[styles.activeName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}
                      >
                        {activeSession.name}
                      </Text>
                      <Text style={[styles.activeMeta, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
                        In progress · {formatElapsed(activeSession.startedAt, now)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.activeActions}>
                    <TouchableOpacity
                      onPress={() => {
                        minimize();
                        router.push({
                          pathname: "/copilot-workout" as never,
                          params: activeSession?.sessionId
                            ? { sessionId: String(activeSession.sessionId) }
                            : undefined,
                        });
                      }}
                      activeOpacity={0.85}
                      style={[styles.activeBtn, { backgroundColor: colors.primary }]}
                    >
                      <Text style={[styles.activeBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                        Resume
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={endSession}
                      activeOpacity={0.85}
                      style={[styles.activeBtn, { backgroundColor: colors.secondary }]}
                    >
                      <Text style={[styles.activeBtnText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                        End
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {MENU_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.route}
                  activeOpacity={0.7}
                  onPress={() => go(opt.route)}
                  style={[styles.option, { backgroundColor: colors.muted }]}
                >
                  <View style={[styles.optionIcon, { backgroundColor: opt.iconBg }]}>
                    <Feather name={opt.icon} size={20} color={opt.iconColor} />
                  </View>
                  <View style={styles.optionText}>
                    <Text
                      style={[styles.optionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}
                    >
                      {opt.title}
                    </Text>
                    <Text
                      style={[styles.optionSubtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
                    >
                      {opt.subtitle}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  barWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  barIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  barText: { flex: 1 },
  barTitle: { fontSize: 14 },
  barSubtitle: { fontSize: 12, marginTop: 1 },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 10,
    maxHeight: "82%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 10,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  sheetTitle: { fontSize: 19 },
  scroll: { flexGrow: 0 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 16,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  optionText: { flex: 1 },
  optionTitle: { fontSize: 15 },
  optionSubtitle: { fontSize: 13, marginTop: 2 },
  activeCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 14,
    marginBottom: 4,
  },
  activeTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  activeName: { fontSize: 15 },
  activeMeta: { fontSize: 13, marginTop: 2 },
  activeActions: { flexDirection: "row", gap: 10 },
  activeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  activeBtnText: { fontSize: 14 },
});
