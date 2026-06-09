import React, { useRef } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  Text,
  useColorScheme,
} from "react-native";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import { SymbolView } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";

const isIOS = Platform.OS === "ios";

type TabDef = {
  routeName: string;
  label: string;
  sfSymbol: string;
  sfSymbolFill: string;
  feather: keyof typeof Feather.glyphMap;
};

const LEFT_TABS: TabDef[] = [
  {
    routeName: "index",
    label: "Home",
    sfSymbol: "house",
    sfSymbolFill: "house.fill",
    feather: "home",
  },
  {
    routeName: "plan",
    label: "Plan",
    sfSymbol: "list.bullet.clipboard",
    sfSymbolFill: "list.bullet.clipboard.fill",
    feather: "list",
  },
];

const RIGHT_TABS: TabDef[] = [
  {
    routeName: "health",
    label: "Health",
    sfSymbol: "heart",
    sfSymbolFill: "heart.fill",
    feather: "heart",
  },
  {
    routeName: "profile",
    label: "Profile",
    sfSymbol: "person",
    sfSymbolFill: "person.fill",
    feather: "user",
  },
];

const FAB_COLOR = "#b06050";

const FAB_SIZE = 52;
const FAB_SLOT_WIDTH = 72;
const TAB_BAR_HEIGHT = 64;

function TabItem({
  def,
  isActive,
  onPress,
}: {
  def: TabDef;
  isActive: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const iconColor = isActive ? colors.navActive : colors.navInactive;

  return (
    <TouchableOpacity
      style={styles.tabItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {isIOS ? (
        <SymbolView
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          name={(isActive ? def.sfSymbolFill : def.sfSymbol) as any}
          tintColor={iconColor}
          size={20}
        />
      ) : (
        <Feather name={def.feather} size={20} color={iconColor} />
      )}
      {def.label ? (
        <Text style={[styles.tabLabel, { color: iconColor, fontFamily: "Inter_500Medium" }]}>
          {def.label}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

type RouteEntry = { key: string; name: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CustomTabBar({ state, navigation }: { state: any; navigation: any; descriptors: any; insets: any }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const fabScale = useRef(new Animated.Value(1)).current;
  const fabRotate = useRef(new Animated.Value(0)).current;

  const bottomPad = Math.max(insets.bottom, 8);
  const totalHeight = TAB_BAR_HEIGHT + bottomPad;

  function getRouteIndex(routeName: string) {
    return state.routes.findIndex((r: RouteEntry) => r.name === routeName);
  }

  function isRouteActive(routeName: string) {
    const idx = getRouteIndex(routeName);
    return idx !== -1 && state.index === idx;
  }

  function navigateTo(routeName: string) {
    const idx = getRouteIndex(routeName);
    if (idx === -1) return;
    const event = navigation.emit({
      type: "tabPress",
      target: state.routes[idx].key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  }

  function handleFABPress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Animated.sequence([
      Animated.parallel([
        Animated.spring(fabScale, {
          toValue: 0.9,
          useNativeDriver: true,
          speed: 80,
          bounciness: 4,
        }),
        Animated.timing(fabRotate, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.spring(fabScale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 40,
          bounciness: 8,
        }),
        Animated.timing(fabRotate, {
          toValue: 0,
          duration: 100,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
    navigateTo("checkin");
  }

  const rotation = fabRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "45deg"],
  });

  return (
    <View style={[styles.wrapper, { height: totalHeight }]}>
      {isIOS ? (
        <BlurView
          intensity={90}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.navBackground }]}
        />
      )}

      <View
        style={[
          styles.tabRow,
          { paddingBottom: bottomPad, borderTopColor: colors.border },
        ]}
      >
        {/* Left tabs */}
        {LEFT_TABS.map((def) => (
          <TabItem
            key={def.routeName}
            def={def}
            isActive={isRouteActive(def.routeName)}
            onPress={() => navigateTo(def.routeName)}
          />
        ))}

        {/* Center FAB — inline, raised just above the row */}
        <View style={styles.fabSlot}>
          <Animated.View
            style={{ transform: [{ scale: fabScale }, { rotate: rotation }] }}
          >
            <TouchableOpacity
              onPress={handleFABPress}
              activeOpacity={0.85}
              style={[styles.fab, { backgroundColor: FAB_COLOR }]}
            >
              <Feather name="plus" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Right tabs */}
        {RIGHT_TABS.map((def) => (
          <TabItem
            key={def.routeName}
            def={def}
            isActive={isRouteActive(def.routeName)}
            onPress={() => navigateTo(def.routeName)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#C17B3F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  fabSlot: {
    width: FAB_SLOT_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  tabRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tabLabel: {
    fontSize: 9,
    letterSpacing: 0.2,
  },
});
