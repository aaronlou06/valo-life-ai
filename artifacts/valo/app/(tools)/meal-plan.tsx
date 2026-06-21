// Coming-soon placeholder for Upload and Find meal plan features.
// Navigated to from meal-planner.tsx when user taps Upload or Find in the + sheet.
// The full wizard entry point is /meal-planner (artifacts/valo/app/meal-planner.tsx).
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";

export default function MealPlanComingSoonScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const headerPaddingTop = (Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top) + 12;

  const features = [
    { icon: "upload" as const, label: "Upload a plan", description: "Import and parse an existing meal plan from a file or URL." },
    { icon: "search" as const, label: "Find a plan", description: "Browse community templates and expert-designed plans." },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: headerPaddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Meal Plans
        </Text>
        <View style={{ width: 30 }} />
      </View>

      <View style={styles.body}>
        <View style={[styles.iconWrap, { backgroundColor: colors.secondary }]}>
          <Feather name="clock" size={32} color={colors.primary} />
        </View>
        <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Coming soon
        </Text>
        <Text style={[styles.sub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          We are building two more ways to get a meal plan:
        </Text>

        <View style={{ marginTop: 28, width: "100%", gap: 12 }}>
          {features.map((f) => (
            <View key={f.label} style={[styles.featureCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.featureIcon, { backgroundColor: colors.secondary }]}>
                <Feather name={f.icon} size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.featureLabel, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                  {f.label}
                </Text>
                <Text style={[styles.featureSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {f.description}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.85}
          style={[styles.backBtn, { borderColor: colors.border }]}
        >
          <Text style={[styles.backBtnText, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
            Create a plan instead
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17 },
  body: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  iconWrap: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  heading: { fontSize: 22, marginBottom: 8 },
  sub: { fontSize: 14, textAlign: "center", lineHeight: 22 },
  featureCard: { flexDirection: "row", alignItems: "flex-start", gap: 14, padding: 16, borderRadius: 16, borderWidth: 1 },
  featureIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  featureLabel: { fontSize: 15, marginBottom: 3 },
  featureSub: { fontSize: 12, lineHeight: 18 },
  backBtn: { marginTop: 28, borderWidth: 1, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 },
  backBtnText: { fontSize: 15 },
});
