import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";

const SUPPORT_EMAIL = "support@govalo.app";

const FAQ_ITEMS = [
  {
    q: "How do I log my daily check-in?",
    a: "Tap the + button in the center of the tab bar to open the check-in sheet. You can choose Voice, Guided, or Write it out.",
  },
  {
    q: "How do habits and streaks work?",
    a: "Mark a habit complete each day on the Plan tab. Your streak counts consecutive days you completed it. Streaks reset if you miss a day.",
  },
  {
    q: "How are my pillar scores calculated?",
    a: "Health, Work & Mission, and Relationships scores are derived from your logged data — sleep, HRV, goals, mood, and more. Log consistently for the most accurate scores.",
  },
  {
    q: "Is my data private?",
    a: "Yes. Your data is stored securely and never sold or shared with third parties. See our privacy policy for full details.",
  },
  {
    q: "How do I connect my wearable?",
    a: "On iOS, Valo reads from Apple Health. Go to the Health tab to authorize data sync. Android wearable integrations are coming soon.",
  },
];

export default function HelpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  async function handleContact() {
    const url = `mailto:${SUPPORT_EMAIL}?subject=Valo%20Support%20Request`;
    const canOpen = await Linking.canOpenURL(url).catch(() => false);
    if (canOpen) {
      await Linking.openURL(url).catch(() => {});
    } else {
      Alert.alert("Contact Support", `Email us at ${SUPPORT_EMAIL}`);
    }
  }

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Help & Support
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
          FREQUENTLY ASKED
        </Text>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {FAQ_ITEMS.map((item, i) => (
            <View
              key={i}
              style={[
                styles.faqItem,
                i < FAQ_ITEMS.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
              ]}
            >
              <Text style={[styles.faqQ, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                {item.q}
              </Text>
              <Text style={[styles.faqA, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {item.a}
              </Text>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
          CONTACT
        </Text>

        <TouchableOpacity
          onPress={handleContact}
          activeOpacity={0.75}
          style={[styles.contactBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Feather name="mail" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.contactLabel, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
              Email Support
            </Text>
            <Text style={[styles.contactSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              {SUPPORT_EMAIL}
            </Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>

        <Text style={[styles.appVersion, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Valo — your personal AI life companion
        </Text>
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
    fontSize: 17,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: 10,
    marginTop: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 24,
    overflow: "hidden",
  },
  faqItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  faqQ: {
    fontSize: 14,
    lineHeight: 20,
  },
  faqA: {
    fontSize: 13,
    lineHeight: 19,
  },
  contactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 24,
  },
  contactLabel: {
    fontSize: 14,
  },
  contactSub: {
    fontSize: 12,
    marginTop: 2,
  },
  appVersion: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },
});
