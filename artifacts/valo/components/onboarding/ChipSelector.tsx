import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";

interface Props {
  options: string[];
  selected: string | string[];
  onSelect: (option: string) => void;
  multi?: boolean;
  colors: any;
}

export default function ChipSelector({ options, selected, onSelect, multi = false, colors }: Props) {
  const isSelected = (opt: string) => {
    if (multi) return (selected as string[]).includes(opt);
    return selected === opt;
  };

  return (
    <View style={styles.container}>
      {options.map((opt) => {
        const sel = isSelected(opt);
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(opt);
            }}
            style={[
              styles.chip,
              {
                backgroundColor: sel ? colors.primary : colors.card,
                borderColor: sel ? colors.primary : colors.border,
              },
            ]}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.chipText,
                {
                  color: sel ? colors.primaryForeground : colors.foreground,
                  fontFamily: sel ? "Inter_500Medium" : "Inter_400Regular",
                },
              ]}
            >
              {opt}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 100,
    borderWidth: 1,
  },
  chipText: { fontSize: 14, lineHeight: 18 },
});
