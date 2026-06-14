import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";

interface Props {
  title: string;
  heading: string;
  sub: string;
  icon: keyof typeof Feather.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Shared scaffold for the Workout Co-Pilot flow placeholders. Each of the five
 * menu options routes here with its own copy; the real flows replace these later.
 */
export function CopilotPlaceholder({ title, heading, sub, icon, actionLabel, onAction }: Props) {
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
        <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          {title}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.body}>
        <View style={[styles.iconWrap, { backgroundColor: colors.secondary }]}>
          <Feather name={icon} size={28} color={colors.primary} />
        </View>
        <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          {heading}
        </Text>
        <Text style={[styles.sub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          {sub}
        </Text>

        {actionLabel && onAction ? (
          <TouchableOpacity
            onPress={onAction}
            activeOpacity={0.85}
            style={[styles.action, { backgroundColor: colors.primary }]}
          >
            <Text
              style={[
                styles.actionText,
                { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" },
              ]}
            >
              {actionLabel}
            </Text>
          </TouchableOpacity>
        ) : null}
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
  action: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  actionText: { fontSize: 15 },
});
