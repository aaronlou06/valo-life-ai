import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface Props {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  description: string;
  accentColor: string;
  onPress: () => void;
}

export function ToolCard({ icon, label, description, accentColor, onPress }: Props) {
  const colors = useColors();

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${accentColor}26` }]}>
        <Feather name={icon} size={22} color={accentColor} />
      </View>
      <Text
        style={[styles.label, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}
      >
        {label}
      </Text>
      <Text
        numberOfLines={2}
        style={[styles.description, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}
      >
        {description}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "48%",
    minHeight: 116,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    justifyContent: "flex-start",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    marginBottom: 4,
  },
  description: {
    fontSize: 12,
    lineHeight: 16,
  },
});
