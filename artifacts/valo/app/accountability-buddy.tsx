import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";

export default function AccountabilityBuddyScreen() {
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
          Accountability Buddy
        </Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.body}>
        <View style={[styles.iconWrap, { backgroundColor: colors.secondary }]}>
          <Feather name="users" size={36} color={colors.primary} />
        </View>
        <Text style={[styles.comingSoon, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Coming soon
        </Text>
        <Text style={[styles.description, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Accountability Buddy will let you share your goals and progress with a trusted partner — keeping you motivated and on track together.
        </Text>
      </View>
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
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 16,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  comingSoon: {
    fontSize: 22,
    lineHeight: 28,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
});
