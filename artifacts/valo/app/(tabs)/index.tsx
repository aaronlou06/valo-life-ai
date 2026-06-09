import React, { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { SymbolView } from "expo-symbols";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useValoAuth } from "@/contexts/AuthContext";

const isIOS = Platform.OS === "ios";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getFirstName(name: string | null): string {
  if (!name) return "there";
  return name.split(" ")[0];
}

function UserAvatar({ name, colors }: { name: string | null; colors: ReturnType<typeof useColors> }) {
  const initial = name ? name[0].toUpperCase() : "V";
  return (
    <View
      style={[
        styles.avatar,
        { backgroundColor: colors.secondary, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.avatarText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
        {initial}
      </Text>
    </View>
  );
}

type AtAGlanceCardProps = {
  time?: string;
  badge?: string;
  title: string;
  subtitle: string;
  iconName: string;
  cardColor: string;
  iconColor: string;
  colors: ReturnType<typeof useColors>;
};

function AtAGlanceCard({
  time,
  badge,
  title,
  subtitle,
  iconName,
  cardColor,
  iconColor,
  colors,
}: AtAGlanceCardProps) {
  return (
    <View style={[styles.glanceCard, { backgroundColor: cardColor }]}>
      <View style={styles.glanceCardHeader}>
        <View style={[styles.glanceIcon, { backgroundColor: iconColor + "30" }]}>
          {isIOS ? (
            <SymbolView name={iconName as any} tintColor={iconColor} size={16} />
          ) : (
            <Feather name="calendar" size={16} color={iconColor} />
          )}
        </View>
        {time ? (
          <Text style={[styles.glanceMeta, { color: iconColor, fontFamily: "Inter_500Medium" }]}>
            {time}
          </Text>
        ) : null}
        {badge ? (
          <Text style={[styles.glanceMeta, { color: iconColor, fontFamily: "Inter_500Medium" }]}>
            {badge}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.glanceTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
        {title}
      </Text>
      <Text style={[styles.glanceSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        {subtitle}
      </Text>
    </View>
  );
}

type SpaceTileProps = {
  label: string;
  sfSymbol: string;
  featherIcon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
};

function SpaceTile({ label, sfSymbol, featherIcon, onPress, colors }: SpaceTileProps) {
  return (
    <TouchableOpacity
      style={[styles.spaceTile, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.spaceIconWrap, { backgroundColor: colors.secondary }]}>
        {isIOS ? (
          <SymbolView name={sfSymbol as any} tintColor={colors.mutedForeground} size={22} />
        ) : (
          <Feather name={featherIcon} size={22} color={colors.mutedForeground} />
        )}
      </View>
      <Text style={[styles.spaceLabel, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const { name } = useValoAuth();
  const router = useRouter();
  const greeting = useMemo(() => getGreeting(), []);
  const firstName = useMemo(() => getFirstName(name), [name]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.greeting, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
              {greeting}, {firstName}
            </Text>
            <View style={styles.headerMeta}>
              <Feather name="sun" size={13} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {" "}72° & sunny{"  "}
              </Text>
              <Feather name="map-pin" size={13} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {" "}San Francisco
              </Text>
            </View>
          </View>
          <UserAvatar name={name} colors={colors} />
        </View>

        {/* At a Glance */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
          AT A GLANCE
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.glanceRow}
        >
          <AtAGlanceCard
            time="10:30 AM"
            title="Design Sync"
            subtitle="in 45 mins"
            iconName="calendar"
            cardColor="#C8D8C5"
            iconColor="#4A7C59"
            colors={colors}
          />
          <AtAGlanceCard
            badge="3 tasks"
            title="Weekly Goals"
            subtitle="2 completed"
            iconName="checkmark.circle"
            cardColor="#E8D5D0"
            iconColor="#9B5E52"
            colors={colors}
          />
          <AtAGlanceCard
            time="Tonight"
            title="Evening Debrief"
            subtitle="Tap to check in"
            iconName="mic"
            cardColor="#DDD5C8"
            iconColor="#7A6B55"
            colors={colors}
          />
        </ScrollView>

        {/* Your Spaces */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
          YOUR SPACES
        </Text>
        <View style={styles.spacesGrid}>
          <SpaceTile
            label="Messages"
            sfSymbol="message"
            featherIcon="message-square"
            onPress={() => {}}
            colors={colors}
          />
          <SpaceTile
            label="Tasks"
            sfSymbol="checkmark.circle"
            featherIcon="check-circle"
            onPress={() => router.navigate("/(tabs)/plan")}
            colors={colors}
          />
          <SpaceTile
            label="Calendar"
            sfSymbol="calendar"
            featherIcon="calendar"
            onPress={() => router.navigate("/(tabs)/plan")}
            colors={colors}
          />
          <SpaceTile
            label="Notes"
            sfSymbol="doc.text"
            featherIcon="file-text"
            onPress={() => {}}
            colors={colors}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 28,
    marginTop: 4,
  },
  greeting: {
    fontSize: 26,
    lineHeight: 32,
    marginBottom: 6,
  },
  headerMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaText: {
    fontSize: 13,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
    marginTop: 2,
  },
  avatarText: {
    fontSize: 16,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: 12,
    marginTop: 4,
  },
  glanceRow: {
    gap: 12,
    paddingRight: 4,
    marginBottom: 28,
  },
  glanceCard: {
    width: 160,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  glanceCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  glanceIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  glanceMeta: {
    fontSize: 12,
    flex: 1,
    textAlign: "right",
  },
  glanceTitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  glanceSub: {
    fontSize: 12,
    lineHeight: 16,
  },
  spacesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  spaceTile: {
    width: "47%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    gap: 12,
  },
  spaceIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  spaceLabel: {
    fontSize: 14,
  },
});
