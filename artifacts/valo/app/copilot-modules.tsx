import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useWorkoutCopilot } from "@/contexts/WorkoutCopilotContext";

type Module = {
  id: string;
  icon: keyof typeof Feather.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  available: boolean;
};

const MODULES: Module[] = [
  {
    id: "workouts",
    icon: "activity",
    iconBg: "#F5DDD8",
    iconColor: "#A06050",
    title: "Workouts",
    subtitle: "Start, log, and track your workouts",
    available: true,
  },
  {
    id: "cooking",
    icon: "coffee",
    iconBg: "#E8EEE8",
    iconColor: "#7A9A7A",
    title: "Cooking",
    subtitle: "Coming soon",
    available: false,
  },
  {
    id: "focus",
    icon: "zap",
    iconBg: "#EAE4F5",
    iconColor: "#8B6EAE",
    title: "Focus",
    subtitle: "Coming soon",
    available: false,
  },
];

export default function CopilotModulesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { expand } = useWorkoutCopilot();

  function handleModuleTap(mod: Module) {
    if (!mod.available) return;
    if (mod.id === "workouts") {
      expand();
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 16, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text
          style={[
            styles.title,
            { color: colors.foreground, fontFamily: "Inter_600SemiBold" },
          ]}
        >
          Copilot Modules
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.list}>
        {MODULES.map((mod) => (
          <TouchableOpacity
            key={mod.id}
            activeOpacity={mod.available ? 0.7 : 1}
            onPress={() => handleModuleTap(mod)}
            style={[
              styles.row,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                opacity: mod.available ? 1 : 0.48,
              },
            ]}
          >
            <View
              style={[styles.iconWrap, { backgroundColor: mod.iconBg }]}
            >
              <Feather name={mod.icon} size={22} color={mod.iconColor} />
            </View>
            <View style={styles.rowText}>
              <Text
                style={[
                  styles.rowTitle,
                  {
                    color: colors.foreground,
                    fontFamily: "Inter_600SemiBold",
                  },
                ]}
              >
                {mod.title}
              </Text>
              <Text
                style={[
                  styles.rowSubtitle,
                  {
                    color: mod.available
                      ? colors.mutedForeground
                      : colors.mutedForeground,
                    fontFamily: "Inter_400Regular",
                  },
                ]}
              >
                {mod.subtitle}
              </Text>
            </View>
            {mod.available ? (
              <Feather
                name="chevron-right"
                size={18}
                color={colors.mutedForeground}
              />
            ) : (
              <View
                style={[
                  styles.soonBadge,
                  { backgroundColor: colors.secondary },
                ]}
              >
                <Text
                  style={[
                    styles.soonText,
                    {
                      color: colors.mutedForeground,
                      fontFamily: "Inter_500Medium",
                    },
                  ]}
                >
                  Soon
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 17 },
  list: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16 },
  rowSubtitle: { fontSize: 13, marginTop: 2 },
  soonBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  soonText: { fontSize: 12 },
});
