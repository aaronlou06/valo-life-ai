import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { ToolCard } from "@/components/ToolCard";

type Tool = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  description: string;
  accentColor: string;
  route: string;
};

const TOOLS: Tool[] = [
  {
    icon: "target",
    label: "Accountability Buddy",
    description: "Set commitments and stay on track",
    accentColor: "#C17B3F",
    route: "/accountability-buddy",
  },
  {
    icon: "clock",
    label: "Time Management",
    description: "Block your time and protect your focus",
    accentColor: "#5B7FA6",
    route: "/time-management",
  },
  {
    icon: "activity",
    label: "Fitness Planner",
    description: "Plan workouts and track progress",
    accentColor: "#6B9E78",
    route: "/fitness",
  },
  {
    icon: "coffee",
    label: "Meal Planner",
    description: "Plan meals for the week ahead",
    accentColor: "#C17B3F",
    route: "/meal-planner",
  },
  {
    icon: "shopping-cart",
    label: "Grocery List",
    description: "Build and manage your shopping list",
    accentColor: "#A67C5B",
    route: "/grocery",
  },
  {
    icon: "bar-chart-2",
    label: "Progress Charts",
    description: "Visualize your trends over time",
    accentColor: "#9B7BB8",
    route: "/charts",
  },
];

export default function ToolsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Tools
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
      >
        <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Everything you need, in one place.
        </Text>

        <View style={styles.grid}>
          {TOOLS.map((tool) => (
            <ToolCard
              key={tool.route}
              icon={tool.icon}
              label={tool.label}
              description={tool.description}
              accentColor={tool.accentColor}
              onPress={() => router.push(tool.route as never)}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 16,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
});
