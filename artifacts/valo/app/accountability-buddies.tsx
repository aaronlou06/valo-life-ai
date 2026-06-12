import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";

export default function AccountabilityBuddiesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

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
          Accountability Buddies
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.body}>
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: colors.secondary },
          ]}
        >
          <Feather name="users" size={28} color={colors.primary} />
        </View>
        <Text
          style={[
            styles.heading,
            { color: colors.foreground, fontFamily: "Inter_600SemiBold" },
          ]}
        >
          Coming soon
        </Text>
        <Text
          style={[
            styles.sub,
            { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
          ]}
        >
          Accountability Buddies are being built. Check back soon.
        </Text>
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
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  heading: { fontSize: 18, textAlign: "center" },
  sub: { fontSize: 15, lineHeight: 23, textAlign: "center" },
});
