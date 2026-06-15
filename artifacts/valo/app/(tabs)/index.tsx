import React, {
  useRef,
  useState,
  useMemo,
  useEffect,
  useCallback,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  Animated,
  TouchableWithoutFeedback,
  Linking,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { SymbolView } from "expo-symbols";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useValoAuth } from "@/contexts/AuthContext";
import { CheckInSheet } from "@/components/CheckInSheet";
import { triggerVoiceStart } from "@/lib/voiceTrigger";
import { customFetch } from "@workspace/api-client-react";

const isIOS = Platform.OS === "ios";
const BUG_EMAIL = "support@govalo.app";
const BUG_SUBJECT = "Bug report";

// ── Helpers ────────────────────────────────────────────────────────────────────

function getGreeting(tod: "morning" | "afternoon" | "evening"): string {
  if (tod === "morning") return "Good morning";
  if (tod === "afternoon") return "Good afternoon";
  return "Good evening";
}

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

// ── Types ──────────────────────────────────────────────────────────────────────

type CardAccent =
  | "sage"
  | "amber"
  | "rose"
  | "terracotta"
  | "good"
  | "fair"
  | "low"
  | "muted";

type CardType =
  | "event"
  | "readiness"
  | "habits"
  | "countdown"
  | "connect_calendar"
  | "add_habits";

interface BriefingCard {
  type: CardType;
  title: string;
  subtitle: string;
  accent: CardAccent;
  action: string;
}

interface FromValo {
  kind: string;
  text: string;
  cta_label?: string;
  cta_action?: string;
}

interface Briefing {
  time_of_day: "morning" | "afternoon" | "evening";
  greeting_name: string;
  from_valo: FromValo | null;
  cards: BriefingCard[];
  states: {
    calendar_connected: boolean;
    wearable_connected: boolean;
    has_intelligence: boolean;
  };
}

// ── Accent tokens ──────────────────────────────────────────────────────────────

function accentColors(accent: CardAccent): { text: string; bg: string; icon: string } {
  switch (accent) {
    case "sage":
    case "good":
      return { text: "#4A7D68", bg: "#D8EBE3", icon: "#4A7D68" };
    case "amber":
    case "fair":
      return { text: "#8A6030", bg: "#FAEEDA", icon: "#8A6030" };
    case "rose":
    case "low":
      return { text: "#A04040", bg: "#F5DDD8", icon: "#A04040" };
    case "terracotta":
      return { text: "#C17B3F", bg: "#F5EBE0", icon: "#C17B3F" };
    default:
      return { text: "#8B8780", bg: "#F0EDE8", icon: "#8B8780" };
  }
}

function cardFeatherIcon(type: CardType): keyof typeof Feather.glyphMap {
  switch (type) {
    case "event": return "calendar";
    case "readiness": return "activity";
    case "habits": return "check-circle";
    case "countdown": return "clock";
    case "connect_calendar": return "calendar";
    case "add_habits": return "plus-circle";
  }
}

function CardSymbol({
  type,
  color,
  size,
}: {
  type: CardType;
  color: string;
  size: number;
}) {
  if (!isIOS) {
    return (
      <Feather name={cardFeatherIcon(type)} size={size} color={color} />
    );
  }
  switch (type) {
    case "event":
      return <SymbolView name="calendar" tintColor={color} size={size} />;
    case "readiness":
      return <SymbolView name="heart.fill" tintColor={color} size={size} />;
    case "habits":
      return <SymbolView name="checkmark.circle" tintColor={color} size={size} />;
    case "countdown":
      return <SymbolView name="timer" tintColor={color} size={size} />;
    case "connect_calendar":
      return <SymbolView name="calendar" tintColor={color} size={size} />;
    case "add_habits":
      return <SymbolView name="plus.circle" tintColor={color} size={size} />;
  }
}

// ── AvatarDropdown ─────────────────────────────────────────────────────────────

type DropdownItem = {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
};

function AvatarDropdown({
  name,
  colors,
}: {
  name: string | null;
  colors: ReturnType<typeof useColors>;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const initial = name ? name[0]!.toUpperCase() : "V";

  function openMenu() {
    setOpen(true);
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 50,
        bounciness: 6,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start();
  }

  function closeMenu() {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => setOpen(false));
  }

  function navigate(path: string) {
    closeMenu();
    setTimeout(() => router.push(path as never), 120);
  }

  async function handleReportBug() {
    closeMenu();
    const body = `Device: ${Platform.OS}\nOS Version: ${Platform.Version}\n\n--- Describe the bug ---\n\n`;
    const mailto = `mailto:${BUG_EMAIL}?subject=${encodeURIComponent(BUG_SUBJECT)}&body=${encodeURIComponent(body)}`;
    const canOpen = await Linking.canOpenURL(mailto).catch(() => false);
    if (canOpen) {
      await Linking.openURL(mailto).catch(() => {});
    } else {
      Alert.alert("Cannot open mail app", `Please email us at ${BUG_EMAIL}`);
    }
  }

  const items: DropdownItem[] = [
    {
      label: "Profile",
      icon: "user",
      onPress: () => navigate("/(tabs)/profile"),
    },
    {
      label: "Help",
      icon: "help-circle",
      onPress: () => navigate("/help"),
    },
    {
      label: "Report Bug",
      icon: "alert-circle",
      onPress: () => {
        void handleReportBug();
      },
    },
    {
      label: "Accountability Buddy",
      icon: "users",
      onPress: () => navigate("/accountability-buddy"),
    },
  ];

  return (
    <>
      <TouchableOpacity
        onPress={openMenu}
        activeOpacity={0.75}
        style={[
          styles.avatar,
          {
            backgroundColor: colors.secondary,
            borderColor: colors.border,
          },
        ]}
      >
        <Text
          style={[
            styles.avatarText,
            { color: colors.primary, fontFamily: "Inter_600SemiBold" },
          ]}
        >
          {initial}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={closeMenu}
        statusBarTranslucent
      >
        <TouchableWithoutFeedback onPress={closeMenu}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <Animated.View
                style={[
                  styles.dropdown,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    top:
                      (Platform.OS === "web"
                        ? Math.max(insets.top, 67)
                        : insets.top) + 64,
                    opacity: opacityAnim,
                    transform: [
                      {
                        scale: scaleAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.85, 1],
                        }),
                      },
                    ],
                  },
                ]}
              >
                {items.map((item, i) => (
                  <TouchableOpacity
                    key={item.label}
                    onPress={item.onPress}
                    activeOpacity={0.7}
                    style={[
                      styles.dropdownItem,
                      i < items.length - 1 && {
                        borderBottomColor: colors.border,
                        borderBottomWidth: StyleSheet.hairlineWidth,
                      },
                    ]}
                  >
                    <Feather
                      name={item.icon}
                      size={16}
                      color={colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.dropdownLabel,
                        {
                          color: colors.foreground,
                          fontFamily: "Inter_500Medium",
                        },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </Animated.View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

// ── AppsSheet ──────────────────────────────────────────────────────────────────

function AppsSheet({
  visible,
  onClose,
  colors,
  router,
}: {
  visible: boolean;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
  router: ReturnType<typeof useRouter>;
}) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          speed: 50,
          bounciness: 6,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 140,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, scaleAnim, opacityAnim]);

  function navigate(path: string) {
    onClose();
    setTimeout(() => router.push(path as never), 120);
  }

  const apps = [
    { label: "Tools", icon: "grid" as const, path: "/tools" },
    { label: "Copilot Modules", icon: "cpu" as const, path: "/copilot-modules" },
    { label: "Accountability Buddies", icon: "users" as const, path: "/(tools)/accountability" },
  ];

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <Animated.View
              style={[
                styles.appsSheet,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: opacityAnim,
                  transform: [
                    {
                      scale: scaleAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.85, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text
                style={[
                  styles.appsLabel,
                  {
                    color: colors.mutedForeground,
                    fontFamily: "Inter_600SemiBold",
                  },
                ]}
              >
                Apps
              </Text>
              <View style={styles.appsGrid}>
                {apps.map((app) => (
                  <TouchableOpacity
                    key={app.label}
                    onPress={() => navigate(app.path)}
                    activeOpacity={0.7}
                    style={[
                      styles.appTile,
                      {
                        backgroundColor: colors.secondary,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Feather
                      name={app.icon}
                      size={20}
                      color={colors.primary}
                    />
                    <Text
                      style={[
                        styles.appTileLabel,
                        {
                          color: colors.foreground,
                          fontFamily: "Inter_500Medium",
                        },
                      ]}
                    >
                      {app.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ── FromValoCard ───────────────────────────────────────────────────────────────

function FromValoCard({
  fromValo,
  hasIntelligence,
  colors,
  onPlan,
  onStartVoice,
}: {
  fromValo: FromValo | null;
  hasIntelligence: boolean;
  colors: ReturnType<typeof useColors>;
  onPlan: () => void;
  onStartVoice: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!fromValo && !hasIntelligence) {
    return (
      <TouchableOpacity
        onPress={onStartVoice}
        activeOpacity={0.85}
        style={[
          styles.valoCard,
          {
            backgroundColor: colors.secondary,
            borderColor: colors.border,
            borderLeftColor: colors.primary,
          },
        ]}
      >
        <Text
          style={[
            styles.valoLabel,
            { color: colors.primary, fontFamily: "Inter_600SemiBold" },
          ]}
        >
          From Valo
        </Text>
        <Text
          style={[
            styles.valoText,
            { color: colors.foreground, fontFamily: "Inter_400Regular" },
          ]}
        >
          Let's do your first check-in. Valo learns what matters to you and
          keeps track of your momentum.
        </Text>
        <View
          style={[
            styles.valoCta,
            { backgroundColor: colors.primary },
          ]}
        >
          <Feather name="mic" size={13} color={colors.primaryForeground} />
          <Text
            style={[
              styles.valoCtaText,
              { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" },
            ]}
          >
            Start your first check-in
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (!fromValo) return null;

  function handleCta() {
    if (fromValo?.cta_action === "open_plan") onPlan();
    else onStartVoice();
  }

  return (
    <View
      style={[
        styles.valoCard,
        {
          backgroundColor: "#FDF6F0",
          borderColor: "#E8D9CC",
          borderLeftColor: colors.primary,
        },
      ]}
    >
      <Text
        style={[
          styles.valoLabel,
          { color: colors.primary, fontFamily: "Inter_600SemiBold" },
        ]}
      >
        From Valo
      </Text>
      <Text
        style={[
          styles.valoText,
          { color: "#1A1814", fontFamily: "Inter_400Regular" },
        ]}
        numberOfLines={expanded ? undefined : 2}
      >
        {fromValo.text}
      </Text>
      <TouchableOpacity
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
        hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
      >
        <Text
          style={[
            styles.valoToggle,
            { color: colors.primary, fontFamily: "Inter_500Medium" },
          ]}
        >
          {expanded ? "Show less" : "Show more"}
        </Text>
      </TouchableOpacity>
      {fromValo.cta_label && (
        <TouchableOpacity
          onPress={handleCta}
          activeOpacity={0.75}
          style={[styles.valoCta, { backgroundColor: colors.primary }]}
        >
          <Feather name="mic" size={13} color={colors.primaryForeground} />
          <Text
            style={[
              styles.valoCtaText,
              {
                color: colors.primaryForeground,
                fontFamily: "Inter_600SemiBold",
              },
            ]}
          >
            {fromValo.cta_label}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── GlanceCard ─────────────────────────────────────────────────────────────────

function GlanceCard({
  card,
  colors,
  onCheckIn,
  router,
}: {
  card: BriefingCard;
  colors: ReturnType<typeof useColors>;
  onCheckIn: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const { type, title, subtitle, accent, action } = card;
  const ac = accentColors(accent);

  function handlePress() {
    switch (action) {
      case "open_plan":
        router.navigate("/(tabs)/plan");
        break;
      case "open_health":
        router.navigate("/(tabs)/health");
        break;
      case "open_checkin":
        onCheckIn();
        break;
      case "connect_calendar":
        router.navigate("/(tabs)/profile");
        break;
      case "open_progress":
        router.navigate("/(tabs)/progress");
        break;
      default:
        break;
    }
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.78}
      style={[
        styles.glanceCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={[styles.glanceIconWrap, { backgroundColor: ac.bg }]}>
        <CardSymbol type={type} color={ac.icon} size={17} />
      </View>

      <View style={styles.glanceContent}>
        <Text
          style={[
            styles.glanceTitle,
            { color: colors.foreground, fontFamily: "Inter_600SemiBold" },
          ]}
          numberOfLines={2}
        >
          {title}
        </Text>
        <Text
          style={[
            styles.glanceSub,
            { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
          ]}
          numberOfLines={2}
        >
          {subtitle}
        </Text>
      </View>

      <Feather
        name="chevron-right"
        size={15}
        color={colors.mutedForeground}
        style={{ opacity: 0.5 }}
      />
    </TouchableOpacity>
  );
}

// ── QuickCheckIn ───────────────────────────────────────────────────────────────

function QuickCheckIn({
  tod,
  colors,
  onPress,
}: {
  tod: "morning" | "afternoon" | "evening";
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  const label =
    tod === "evening"
      ? "Ready for today's check-in?"
      : "What's on your mind?";
  const sub =
    tod === "evening"
      ? "Reflect on the day with Valo."
      : "Talk it through with Valo.";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.quickCheckin, { backgroundColor: colors.primary }]}
    >
      <View
        style={[
          styles.quickCheckinIcon,
          { backgroundColor: "rgba(255,255,255,0.18)" },
        ]}
      >
        <Feather name="mic" size={18} color={colors.primaryForeground} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.quickCheckinTitle,
            {
              color: colors.primaryForeground,
              fontFamily: "Inter_600SemiBold",
            },
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.quickCheckinSub,
            {
              color: `${colors.primaryForeground}CC`,
              fontFamily: "Inter_400Regular",
            },
          ]}
        >
          {sub}
        </Text>
      </View>
      <Feather
        name="chevron-right"
        size={18}
        color={`${colors.primaryForeground}88`}
      />
    </TouchableOpacity>
  );
}

// ── WorkoutSnapshot ────────────────────────────────────────────────────────────

type SnapPR = {
  exerciseName: string | null;
  weightKg: number | null;
  reps: number | null;
  achievedAt: string | null;
};

function WorkoutSnapshot({
  colors,
  router,
}: {
  colors: ReturnType<typeof useColors>;
  router: ReturnType<typeof useRouter>;
}) {
  const [pr, setPr] = useState<SnapPR | null>(null);
  const [weekSessions, setWeekSessions] = useState<number | null>(null);
  const [sessionDates, setSessionDates] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const [prs, sessions] = await Promise.all([
        customFetch<SnapPR[]>("/api/workout/prs?limit=1"),
        customFetch<{ id: number; date: string; status: string }[]>(
          "/api/workout/sessions?status=completed&limit=60",
        ),
      ]);
      if (prs.length > 0) setPr(prs[0]!);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dow = today.getDay();
      const mondayOffset = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(today);
      monday.setDate(today.getDate() + mondayOffset);
      const weekSet = new Set(
        Array.from({ length: 7 }, (_, i) => {
          const d = new Date(monday);
          d.setDate(monday.getDate() + i);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }),
      );

      const sessionDateSet = new Set(sessions.map((s) => s.date));
      const count = [...weekSet].filter((d) => sessionDateSet.has(d)).length;
      setWeekSessions(count);
      setSessionDates(sessionDateSet);
    } catch {
      // ignore — no cards shown on error
    } finally {
      setLoaded(true);
    }
  }

  if (!loaded) return null;
  const hasPR = !!pr;
  const hasAnySession = sessionDates.size > 0;
  if (!hasPR && !hasAnySession) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const todayStr = weekDates[dow === 0 ? 6 : dow - 1]!;

  return (
    <View style={snapStyles.container}>
      {hasPR && (
        <TouchableOpacity
          onPress={() => router.navigate("/(tabs)/progress")}
          activeOpacity={0.78}
          style={[
            snapStyles.card,
            {
              backgroundColor: "#FDF6F0",
              borderColor: "#E8D9CC",
              borderLeftColor: "#C17B3F",
            },
          ]}
        >
          <View style={snapStyles.cardHeader}>
            <Text
              style={[snapStyles.cardLabel, { color: "#C17B3F", fontFamily: "Inter_600SemiBold" }]}
            >
              Latest PR
            </Text>
            <Feather name="award" size={13} color="#C17B3F" />
          </View>
          <Text
            style={[snapStyles.cardMain, { color: "#1A1814", fontFamily: "Inter_600SemiBold" }]}
            numberOfLines={1}
          >
            {pr!.exerciseName ?? "Exercise"}
          </Text>
          <Text
            style={[snapStyles.cardSub, { color: "#8A7060", fontFamily: "Inter_400Regular" }]}
          >
            {pr!.weightKg ? `${pr!.weightKg}kg` : ""}
            {pr!.weightKg && pr!.reps ? " × " : ""}
            {pr!.reps ? `${pr!.reps} rep${pr!.reps !== 1 ? "s" : ""}` : ""}
            {pr!.achievedAt
              ? ` · ${new Date(pr!.achievedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
              : ""}
          </Text>
        </TouchableOpacity>
      )}
      {hasAnySession && (
        <TouchableOpacity
          onPress={() => router.navigate("/(tabs)/progress")}
          activeOpacity={0.78}
          style={[
            snapStyles.card,
            {
              backgroundColor: (weekSessions ?? 0) > 0 ? "#F0F6F2" : "#F5F4F2",
              borderColor: (weekSessions ?? 0) > 0 ? "#C2DAC9" : "#E0DDD8",
              borderLeftColor: (weekSessions ?? 0) > 0 ? "#4A7D68" : "#C0BBB4",
            },
          ]}
        >
          <View style={snapStyles.cardHeader}>
            <Text
              style={[
                snapStyles.cardLabel,
                {
                  color: (weekSessions ?? 0) > 0 ? "#4A7D68" : "#8B8780",
                  fontFamily: "Inter_600SemiBold",
                },
              ]}
            >
              Workouts this week
            </Text>
            <Feather
              name="activity"
              size={13}
              color={(weekSessions ?? 0) > 0 ? "#4A7D68" : "#8B8780"}
            />
          </View>
          <View style={snapStyles.dotRow}>
            {weekDates.map((d) => {
              const isCompleted = sessionDates.has(d);
              const isFuture = d > todayStr;
              return (
                <View
                  key={d}
                  style={[
                    snapStyles.dot,
                    {
                      backgroundColor: isCompleted
                        ? "#4A7D68"
                        : isFuture
                        ? "#E8E4E0"
                        : "#D0CCC8",
                    },
                  ]}
                />
              );
            })}
          </View>
          <Text
            style={[
              snapStyles.cardSub,
              {
                color: (weekSessions ?? 0) > 0 ? "#3A6A55" : "#8B8780",
                fontFamily: "Inter_400Regular",
              },
            ]}
          >
            {weekSessions ?? 0} workout{(weekSessions ?? 0) !== 1 ? "s" : ""} logged
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const snapStyles = StyleSheet.create({
  container: { gap: 10, marginBottom: 24 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: 14,
    gap: 4,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  cardLabel: { fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase" },
  cardMain: { fontSize: 15, lineHeight: 20 },
  cardSub: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  dotRow: { flexDirection: "row", gap: 5, marginVertical: 4 },
  dot: { flex: 1, height: 14, borderRadius: 3 },
});

// ── HomeScreen ─────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useColors();
  const { name, getToken } = useValoAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [checkInOpen, setCheckInOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);

  const { data: briefing = null, isLoading: loading } = useQuery<Briefing | null>({
    queryKey: ["/api/home-briefing"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return null;
      const res = await fetch(`${getApiBase()}/api/home-briefing`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return (await res.json()) as Briefing;
    },
    staleTime: 0,
  });

  const dateLabel = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    [],
  );

  const tod = briefing?.time_of_day ?? "morning";
  const firstName = briefing?.greeting_name ?? (name ? name.split(" ")[0] : "there") ?? "there";
  const greeting = getGreeting(tod);

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop:
              (Platform.OS === "web"
                ? Math.max(insets.top, 67)
                : insets.top) + 24,
            paddingBottom: 120,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.greeting,
                { color: colors.foreground, fontFamily: "Inter_700Bold" },
              ]}
            >
              {greeting}, {firstName}
            </Text>
            <Text
              style={[
                styles.dateText,
                {
                  color: colors.mutedForeground,
                  fontFamily: "Inter_400Regular",
                },
              ]}
            >
              {dateLabel}
            </Text>
          </View>

          {/* Apps button */}
          <TouchableOpacity
            onPress={() => setAppsOpen(true)}
            activeOpacity={0.75}
            style={[
              styles.appsButton,
              { backgroundColor: colors.secondary, borderColor: colors.border },
            ]}
          >
            <Feather name="grid" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Avatar dropdown */}
          <AvatarDropdown name={name} colors={colors} />
        </View>

        {/* ── From Valo ── */}
        {loading ? (
          <View
            style={[
              styles.valoCard,
              {
                backgroundColor: colors.secondary,
                borderColor: colors.border,
                borderLeftColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
                minHeight: 80,
              },
            ]}
          >
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          </View>
        ) : (
          <FromValoCard
            fromValo={briefing?.from_valo ?? null}
            hasIntelligence={briefing?.states.has_intelligence ?? false}
            colors={colors}
            onStartVoice={() => { triggerVoiceStart(); router.push("/voice"); }}
            onPlan={() => router.navigate("/(tabs)/plan")}
          />
        )}

        {/* ── At a glance ── */}
        <Text
          style={[
            styles.sectionLabel,
            { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" },
          ]}
        >
          At a glance
        </Text>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          </View>
        ) : briefing && briefing.cards.length > 0 ? (
          <View style={styles.cardsStack}>
            {briefing.cards.map((card) => (
              <GlanceCard
                key={card.type}
                card={card}
                colors={colors}
                onCheckIn={() => setCheckInOpen(true)}
                router={router}
              />
            ))}
          </View>
        ) : (
          <View
            style={[
              styles.emptyCards,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.emptyText,
                {
                  color: colors.mutedForeground,
                  fontFamily: "Inter_400Regular",
                },
              ]}
            >
              No data yet — log your first check-in to see your briefing here.
            </Text>
          </View>
        )}

        {/* ── Workout snapshot ── */}
        <WorkoutSnapshot colors={colors} router={router} />

        {/* ── Quick check-in ── */}
        <QuickCheckIn
          tod={tod}
          colors={colors}
          onPress={() => { triggerVoiceStart(); router.push("/voice"); }}
        />
      </ScrollView>

      <CheckInSheet
        isOpen={checkInOpen}
        onClose={() => setCheckInOpen(false)}
      />

      <AppsSheet
        visible={appsOpen}
        onClose={() => setAppsOpen(false)}
        colors={colors}
        router={router}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 24,
    marginTop: 4,
  },
  greeting: {
    fontSize: 26,
    lineHeight: 32,
    marginBottom: 4,
  },
  dateText: {
    fontSize: 13,
    lineHeight: 18,
  },
  appsButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  avatarText: {
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
  },
  dropdown: {
    position: "absolute",
    right: 16,
    minWidth: 220,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    overflow: "hidden",
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dropdownLabel: {
    fontSize: 15,
  },
  appsSheet: {
    position: "absolute",
    top: 80,
    right: 16,
    width: 220,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  appsLabel: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  appsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  appTile: {
    width: "47%",
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: "center",
    gap: 6,
  },
  appTileLabel: {
    fontSize: 12,
    textAlign: "center",
  },
  // ── From Valo ──
  valoCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: 16,
    marginBottom: 28,
  },
  valoLabel: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  valoText: {
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 6,
  },
  valoToggle: {
    fontSize: 13,
    marginBottom: 14,
  },
  valoCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },
  valoCtaText: {
    fontSize: 13,
    letterSpacing: 0.1,
  },
  // ── Section label ──
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  loadingRow: {
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  cardsStack: {
    gap: 10,
    marginBottom: 24,
  },
  emptyCards: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    marginBottom: 24,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  // ── Glance card ──
  glanceCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  glanceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  glanceContent: {
    flex: 1,
    gap: 3,
  },
  glanceTitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  glanceSub: {
    fontSize: 13,
    lineHeight: 18,
  },
  // ── Quick check-in ──
  quickCheckin: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  quickCheckinIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  quickCheckinTitle: {
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 2,
  },
  quickCheckinSub: {
    fontSize: 13,
    lineHeight: 18,
  },
});
