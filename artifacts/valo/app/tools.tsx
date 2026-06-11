import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ToolCard } from "@/components/ToolCard";

type ToolDef = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  description: string;
  accentColor: string;
  route: string;
};

type Category = {
  label: string;
  tools: ToolDef[];
};

const CATEGORIES: Category[] = [
  {
    label: "Mind & Reflection",
    tools: [
      {
        icon: "book-open",
        label: "Living Journal",
        description: "Capture thoughts, see them compound",
        accentColor: "#9B7BB8",
        route: "/(tools)/journal",
      },
      {
        icon: "wind",
        label: "Breathe & Meditate",
        description: "Guided breathing and calm",
        accentColor: "#6B9E78",
        route: "/(tools)/meditate",
      },
    ],
  },
  {
    label: "Focus & Time",
    tools: [
      {
        icon: "clock",
        label: "Focus Timer",
        description: "Pomodoro, ambient sound, app blocking",
        accentColor: "#5B7FA6",
        route: "/(tools)/focus-timer",
      },
      {
        icon: "calendar",
        label: "Time Management",
        description: "Block your time, protect your focus",
        accentColor: "#5B7FA6",
        route: "/(tools)/time-management",
      },
    ],
  },
  {
    label: "Fitness",
    tools: [
      {
        icon: "activity",
        label: "Workout Planner",
        description: "Plan workouts and track progress",
        accentColor: "#6B9E78",
        route: "/(tools)/fitness",
      },
    ],
  },
  {
    label: "Nutrition",
    tools: [
      {
        icon: "coffee",
        label: "Meal Planner",
        description: "Plan meals, browse recipes",
        accentColor: "#C17B3F",
        route: "/(tools)/meal-plan",
      },
      {
        icon: "shopping-cart",
        label: "Grocery Buyer",
        description: "Build and manage your shopping list",
        accentColor: "#A67C5B",
        route: "/(tools)/grocery",
      },
      {
        icon: "camera",
        label: "Food Logging",
        description: "Log meals and estimate macros",
        accentColor: "#D4A847",
        route: "/(tools)/food-log",
      },
      {
        icon: "droplet",
        label: "Water Tracker",
        description: "Stay hydrated, hit your goal",
        accentColor: "#5B9FB8",
        route: "/(tools)/water",
      },
    ],
  },
  {
    label: "Connection",
    tools: [
      {
        icon: "target",
        label: "Accountability Buddy",
        description: "Set commitments and stay on track",
        accentColor: "#C17B3F",
        route: "/(tools)/accountability",
      },
      {
        icon: "users",
        label: "Networking",
        description: "Stay in touch with people who matter",
        accentColor: "#C8857A",
        route: "/(tools)/networking",
      },
    ],
  },
];

export default function ToolsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.safe, { backgroundColor: "#F7F5F2" }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 12, borderBottomColor: "#E8E4DE" },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          style={styles.backBtn}
        >
          <Feather name="arrow-left" size={22} color="#C17B3F" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontFamily: "Inter_600SemiBold" }]}>
          Tools
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
      >
        <Text style={[styles.subtitle, { fontFamily: "Inter_400Regular" }]}>
          Everything you need, in one place.
        </Text>

        {CATEGORIES.map((cat) => (
          <View key={cat.label} style={styles.section}>
            <Text style={[styles.catLabel, { fontFamily: "Inter_600SemiBold" }]}>
              {cat.label.toUpperCase()}
            </Text>
            <View style={styles.grid}>
              {cat.tools.map((tool) => (
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
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, color: "#1A1814" },
  subtitle: { fontSize: 13, color: "#8B8780", marginBottom: 24 },
  section: { marginBottom: 28 },
  catLabel: {
    fontSize: 11,
    color: "#8B8780",
    letterSpacing: 1,
    marginBottom: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
});
