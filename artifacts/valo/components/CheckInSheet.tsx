import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/contexts/ThemeContext";

type Option = {
  icon: keyof typeof Feather.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  actionType: string;
};

const OPTIONS: Option[] = [
  {
    icon: "mic",
    iconBg: "#D8EBE3",
    iconColor: "#4A7D68",
    title: "Voice conversation",
    subtitle: "Talk it out — decompress, reflect, think aloud",
    actionType: "start_voice_conversation",
  },
  {
    icon: "compass",
    iconBg: "#F5DDD8",
    iconColor: "#A06050",
    title: "Guided check-in",
    subtitle: "Valo asks what's missing — sleep, mood, goals",
    actionType: "start_guided_checkin",
  },
  {
    icon: "edit-3",
    iconBg: "#E0D8CC",
    iconColor: "#7A6A5A",
    title: "Write it out",
    subtitle: "Quick capture when you can't talk",
    actionType: "start_text_checkin",
  },
  {
    icon: "grid",
    iconBg: "#EDE8F8",
    iconColor: "#6A5A9A",
    title: "Tools",
    subtitle: "Open your active agents and apps",
    actionType: "open_tools",
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CheckInSheet({ isOpen, onClose }: Props) {
  const colors = useColors();
  const { colorScheme } = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = colorScheme === "dark";

  const sheetBg = isDark ? "#242018" : "#FCFBF9";
  const optionBg = colors.muted;

  const slideAnim = useRef(new Animated.Value(500)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setModalVisible(true);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 500,
          duration: 160,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setModalVisible(false);
      });
    }
  }, [isOpen]);

  function handleOption(actionType: string) {
    onClose();
    console.log("[CheckIn] action:", actionType);
  }

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View
          style={[
            styles.backdrop,
            { opacity: backdropOpacity },
          ]}
        />
      </TouchableWithoutFeedback>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: sheetBg,
            paddingBottom: Math.max(insets.bottom, 16) + 12,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Drag handle */}
        <View style={styles.handleWrap}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Check in
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          How would you like to check in?
        </Text>

        {/* Options */}
        <View style={styles.options}>
          {OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.actionType}
              style={[styles.optionRow, { backgroundColor: optionBg, borderColor: colors.border }]}
              onPress={() => handleOption(opt.actionType)}
              activeOpacity={0.75}
            >
              <View style={[styles.optionIcon, { backgroundColor: opt.iconBg }]}>
                <Feather name={opt.icon} size={18} color={opt.iconColor} />
              </View>
              <View style={styles.optionText}>
                <Text style={[styles.optionTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                  {opt.title}
                </Text>
                <Text style={[styles.optionSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {opt.subtitle}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Cancel */}
        <TouchableOpacity
          style={[styles.cancelBtn, { borderColor: colors.border }]}
          onPress={onClose}
          activeOpacity={0.7}
        >
          <Text style={[styles.cancelText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Cancel
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(26,24,20,0.45)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  handleWrap: {
    alignItems: "center",
    marginBottom: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  title: {
    fontSize: 16,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    marginBottom: 16,
  },
  options: {
    gap: 10,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  optionIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  optionTitle: {
    fontSize: 13,
  },
  optionSub: {
    fontSize: 11,
    lineHeight: 15,
  },
  cancelBtn: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: "transparent",
  },
  cancelText: {
    fontSize: 13,
  },
});
