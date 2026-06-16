import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

type Colors = ReturnType<typeof useColors>;

interface EmptyStateProps {
  icon?: React.ComponentProps<typeof Feather>["name"];
  title: string;
  body?: string;
  cta?: { label: string; onPress: () => void };
  secondaryCta?: { label: string; onPress: () => void };
  colors: Colors;
  style?: ViewStyle;
}

export function EmptyState({
  icon,
  title,
  body,
  cta,
  secondaryCta,
  colors,
  style,
}: EmptyStateProps) {
  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.card, borderColor: colors.border },
        style,
      ]}
    >
      {icon != null && (
        <View style={[styles.iconBox, { backgroundColor: colors.muted }]}>
          <Feather name={icon} size={22} color={colors.primary} />
        </View>
      )}
      <Text
        style={[
          styles.title,
          { color: colors.foreground, fontFamily: "Inter_600SemiBold" },
        ]}
      >
        {title}
      </Text>
      {body != null && (
        <Text
          style={[
            styles.body,
            { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
          ]}
        >
          {body}
        </Text>
      )}
      {cta != null && (
        <TouchableOpacity
          style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
          onPress={cta.onPress}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.ctaText,
              {
                color: colors.primaryForeground,
                fontFamily: "Inter_600SemiBold",
              },
            ]}
          >
            {cta.label}
          </Text>
        </TouchableOpacity>
      )}
      {secondaryCta != null && (
        <TouchableOpacity
          onPress={secondaryCta.onPress}
          activeOpacity={0.7}
          style={styles.secondaryBtn}
        >
          <Text
            style={[
              styles.secondaryText,
              { color: colors.primary, fontFamily: "Inter_500Medium" },
            ]}
          >
            {secondaryCta.label}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 10,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  ctaBtn: {
    marginTop: 8,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  ctaText: {
    fontSize: 14,
  },
  secondaryBtn: {
    marginTop: 2,
    paddingVertical: 4,
  },
  secondaryText: {
    fontSize: 13,
  },
});
