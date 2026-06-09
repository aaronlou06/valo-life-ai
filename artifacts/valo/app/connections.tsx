import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/useColors";

// ─── Storage ──────────────────────────────────────────────────────────────────

export const CONNECTIONS_STORAGE_KEY = "@valo/connections";

const SEED_CONNECTED: Record<string, boolean> = {
  "apple-healthkit": true,
  "google-calendar": true,
  twilio: true,
};

// ─── Types ────────────────────────────────────────────────────────────────────

type IntegrationStatus = "available" | "unavailable" | "unofficial";

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: IntegrationStatus;
}

interface Category {
  key: string;
  label: string;
  accentKey: "primary" | "accent" | "mutedForeground";
  integrations: Integration[];
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

const CATEGORIES: Category[] = [
  {
    key: "misc",
    label: "Misc",
    accentKey: "mutedForeground",
    integrations: [
      { id: "birthdays", name: "Birthdays", description: "Contacts & reminders", icon: "gift", status: "available" },
      { id: "duolingo", name: "Duolingo", description: "Language streaks", icon: "book-open", status: "available" },
      { id: "screen-time", name: "Screen Time", description: "App usage & limits", icon: "smartphone", status: "available" },
      { id: "spotify", name: "Spotify", description: "Music & mood", icon: "music", status: "available" },
      { id: "apple-music", name: "Apple Music", description: "Music & mood", icon: "music", status: "available" },
    ],
  },
  {
    key: "health",
    label: "Health & Wearables",
    accentKey: "primary",
    integrations: [
      { id: "apple-healthkit", name: "Apple HealthKit", description: "Sleep, HRV, steps, RHR, workouts", icon: "heart", status: "available" },
      { id: "google-fit", name: "Google Fit", description: "Steps & activity (Android)", icon: "activity", status: "available" },
      { id: "garmin", name: "Garmin Connect", description: "GPS, HRV, VO2 max, training load", icon: "watch", status: "available" },
      { id: "whoop", name: "Whoop", description: "Recovery, strain, sleep", icon: "zap", status: "available" },
      { id: "oura", name: "Oura Ring", description: "Sleep stages, readiness, HRV", icon: "moon", status: "available" },
      { id: "fitbit", name: "Fitbit", description: "Steps, sleep, heart rate", icon: "activity", status: "available" },
      { id: "polar", name: "Polar", description: "Training metrics, running power", icon: "trending-up", status: "available" },
      { id: "withings", name: "Withings", description: "Smart scale, blood pressure, sleep mat", icon: "bar-chart-2", status: "available" },
      { id: "eight-sleep", name: "Eight Sleep", description: "Sleep temp, stages, HRV", icon: "moon", status: "available" },
    ],
  },
  {
    key: "nutrition",
    label: "Nutrition & Food",
    accentKey: "accent",
    integrations: [
      { id: "nutritionix", name: "Nutritionix", description: "Food DB, barcode, macros", icon: "box", status: "available" },
      { id: "edamam", name: "Edamam", description: "Recipe nutrition, meal planning", icon: "book", status: "available" },
      { id: "cronometer", name: "Cronometer", description: "Micronutrients", icon: "pie-chart", status: "available" },
      { id: "open-food-facts", name: "Open Food Facts", description: "Open DB, barcode", icon: "database", status: "available" },
      { id: "spoonacular", name: "Spoonacular", description: "Recipes, meal plans, substitutions", icon: "coffee", status: "available" },
    ],
  },
  {
    key: "grocery",
    label: "Grocery Shopping",
    accentKey: "accent",
    integrations: [
      { id: "walmart", name: "Walmart", description: "Groceries, delivery & pickup", icon: "shopping-cart", status: "available" },
      { id: "kroger", name: "Kroger", description: "Groceries, delivery & pickup", icon: "shopping-cart", status: "available" },
      { id: "instacart", name: "Instacart", description: "Grocery delivery", icon: "package", status: "available" },
    ],
  },
  {
    key: "mindfulness",
    label: "Mindfulness",
    accentKey: "primary",
    integrations: [
      { id: "calm", name: "Calm", description: "Meditation & sleep content", icon: "cloud", status: "available" },
      { id: "headspace", name: "Headspace", description: "Guided meditation", icon: "sun", status: "available" },
      { id: "muse", name: "Muse", description: "EEG headband, meditation quality", icon: "headphones", status: "available" },
    ],
  },
  {
    key: "fitness",
    label: "Fitness & Training",
    accentKey: "accent",
    integrations: [
      { id: "strava", name: "Strava", description: "Running, cycling, outdoor", icon: "map", status: "available" },
      { id: "training-peaks", name: "TrainingPeaks", description: "Structured training plans", icon: "trending-up", status: "available" },
      { id: "nike-run-club", name: "Nike Run Club", description: "Running", icon: "wind", status: "unavailable" },
      { id: "peloton", name: "Peloton", description: "Cycling & strength", icon: "refresh-cw", status: "unofficial" },
      { id: "myfitnesspal", name: "MyFitnessPal", description: "Workout & nutrition logging", icon: "clipboard", status: "available" },
    ],
  },
  {
    key: "productivity",
    label: "Productivity & Calendar",
    accentKey: "mutedForeground",
    integrations: [
      { id: "google-calendar", name: "Google Calendar", description: "Events & scheduling", icon: "calendar", status: "available" },
      { id: "apple-calendar", name: "Apple Calendar", description: "EventKit, native iOS", icon: "calendar", status: "available" },
      { id: "outlook", name: "Outlook / Microsoft 365", description: "Calendar, tasks & email", icon: "mail", status: "available" },
      { id: "notion", name: "Notion", description: "Notes, goals, projects", icon: "file-text", status: "available" },
      { id: "todoist", name: "Todoist", description: "Tasks", icon: "check-square", status: "available" },
      { id: "calendly", name: "Calendly", description: "Meeting scheduling", icon: "clock", status: "available" },
    ],
  },
  {
    key: "reservations",
    label: "Reservations & Booking",
    accentKey: "accent",
    integrations: [
      { id: "opentable", name: "OpenTable", description: "Restaurants", icon: "coffee", status: "available" },
      { id: "resy", name: "Resy", description: "Restaurants", icon: "coffee", status: "unofficial" },
      { id: "mindbody", name: "Mindbody", description: "Gyms, yoga, spas & salons", icon: "heart", status: "available" },
      { id: "zocdoc", name: "Zocdoc", description: "Doctor appointments", icon: "thermometer", status: "available" },
      { id: "uber", name: "Uber", description: "Rides", icon: "navigation", status: "available" },
      { id: "lyft", name: "Lyft", description: "Rides", icon: "navigation", status: "available" },
      { id: "amadeus", name: "Amadeus", description: "Flights, hotels & cars", icon: "send", status: "available" },
      { id: "booking-com", name: "Booking.com", description: "Hotels", icon: "home", status: "available" },
      { id: "airbnb", name: "Airbnb", description: "Rentals", icon: "home", status: "unavailable" },
      { id: "ticketmaster", name: "Ticketmaster", description: "Concerts, sports & events", icon: "tag", status: "available" },
      { id: "eventbrite", name: "Eventbrite", description: "Local events", icon: "calendar", status: "available" },
      { id: "square-appointments", name: "Square Appointments", description: "Business booking", icon: "briefcase", status: "available" },
      { id: "acuity", name: "Acuity Scheduling", description: "Appointment booking", icon: "clock", status: "available" },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    accentKey: "primary",
    integrations: [
      { id: "plaid", name: "Plaid", description: "Bank accounts, spending & income", icon: "credit-card", status: "available" },
      { id: "coinbase", name: "Coinbase", description: "Crypto portfolio", icon: "trending-up", status: "available" },
      { id: "robinhood", name: "Robinhood", description: "Stock portfolio", icon: "bar-chart-2", status: "unavailable" },
      { id: "ynab", name: "YNAB", description: "Zero-based budgeting", icon: "pie-chart", status: "available" },
    ],
  },
  {
    key: "smart-home",
    label: "Smart Home",
    accentKey: "accent",
    integrations: [
      { id: "apple-homekit", name: "Apple HomeKit", description: "Lights, thermostat, locks & cameras", icon: "home", status: "available" },
      { id: "google-home", name: "Google Home", description: "Smart home devices", icon: "wifi", status: "available" },
      { id: "philips-hue", name: "Philips Hue", description: "Lighting & sleep routines", icon: "sun", status: "available" },
      { id: "nest", name: "Nest", description: "Thermostat & temp automation", icon: "thermometer", status: "available" },
      { id: "amazon-alexa", name: "Amazon Alexa", description: "Voice & smart home", icon: "speaker", status: "available" },
    ],
  },
  {
    key: "comms",
    label: "Comms",
    accentKey: "mutedForeground",
    integrations: [
      { id: "twilio", name: "Twilio", description: "SMS reminders & notifications", icon: "message-circle", status: "available" },
      { id: "sendgrid", name: "SendGrid", description: "Email", icon: "send", status: "available" },
      { id: "whatsapp", name: "WhatsApp Business", description: "Messaging", icon: "message-square", status: "available" },
      { id: "slack", name: "Slack", description: "Team notifications", icon: "hash", status: "available" },
    ],
  },
  {
    key: "location",
    label: "Location & Maps",
    accentKey: "primary",
    integrations: [
      { id: "google-maps", name: "Google Maps", description: "Location, commute & places", icon: "map-pin", status: "available" },
      { id: "apple-maps", name: "Apple Maps", description: "Native iOS", icon: "navigation", status: "available" },
      { id: "foursquare", name: "Foursquare", description: "Place recommendations", icon: "star", status: "available" },
    ],
  },
];

const ALL_INTEGRATIONS: Integration[] = CATEGORIES.flatMap((c) => c.integrations);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadConnections(): Promise<Record<string, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(CONNECTIONS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as Record<string, boolean>;
    }
    // First load — seed the defaults
    await AsyncStorage.setItem(CONNECTIONS_STORAGE_KEY, JSON.stringify(SEED_CONNECTED));
    return { ...SEED_CONNECTED };
  } catch {
    return { ...SEED_CONNECTED };
  }
}

async function saveConnections(data: Record<string, boolean>): Promise<void> {
  try {
    await AsyncStorage.setItem(CONNECTIONS_STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConnectionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();

  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  useEffect(() => {
    void loadConnections().then(setConnected);
  }, []);

  const connectedCount = Object.values(connected).filter(Boolean).length;

  const filteredCategories = CATEGORIES.map((cat) => {
    const matchesCategory = activeCategory === "all" || activeCategory === cat.key;
    if (!matchesCategory) return null;

    const q = search.trim().toLowerCase();
    const items = q
      ? cat.integrations.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            i.description.toLowerCase().includes(q),
        )
      : cat.integrations;

    if (items.length === 0) return null;
    return { ...cat, integrations: items };
  }).filter(Boolean) as (Category & { integrations: Integration[] })[];

  async function handleConnect(integration: Integration) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (integration.status === "unavailable") return;

    const label = integration.status === "unofficial" ? "unofficial" : null;
    const message = label
      ? `${integration.name} uses an unofficial API. Connect anyway?`
      : `Allow Valo to access your ${integration.name} data.`;

    Alert.alert(
      `Connect ${integration.name}`,
      message,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Connect",
          onPress: async () => {
            const updated = { ...connected, [integration.id]: true };
            setConnected(updated);
            await saveConnections(updated);
          },
        },
      ],
    );
  }

  async function handleDisconnect(integration: Integration) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      `Disconnect ${integration.name}?`,
      `This will remove Valo's access to your ${integration.name} data.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            const updated = { ...connected, [integration.id]: false };
            setConnected(updated);
            await saveConnections(updated);
          },
        },
      ],
    );
  }

  function getAccentColor(accentKey: Category["accentKey"]): string {
    return colors[accentKey];
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + 12,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Connections
          </Text>
          {connectedCount > 0 && (
            <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
              <Text style={[styles.countBadgeText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                {connectedCount}
              </Text>
            </View>
          )}
        </View>
        <View style={{ width: 30 }} />
      </View>

      {/* ── Search ──────────────────────────────────────────────────────────── */}
      <View
        style={[
          styles.searchWrap,
          { backgroundColor: colors.background, borderBottomColor: colors.border },
        ]}
      >
        <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="search" size={15} color={colors.mutedForeground} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search integrations"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Category chips ──────────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.chipsScrollView, { borderBottomColor: colors.border }]}
        contentContainerStyle={styles.chipsContent}
      >
        {[{ key: "all", label: "All" }, ...CATEGORIES.map((c) => ({ key: c.key, label: c.label }))].map((cat) => {
          const active = activeCategory === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveCategory(cat.key);
              }}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.primary : colors.muted,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color: active ? colors.primaryForeground : colors.mutedForeground,
                    fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular",
                  },
                ]}
              >
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── List ────────────────────────────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {filteredCategories.length === 0 && (
          <View style={styles.emptyState}>
            <Feather name="search" size={28} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              No integrations match your search
            </Text>
          </View>
        )}

        {filteredCategories.map((cat) => {
          const accentColor = getAccentColor(cat.accentKey);
          return (
            <View key={cat.key} style={styles.section}>
              {/* Category header */}
              <View style={styles.categoryHeader}>
                <View style={[styles.categoryDot, { backgroundColor: accentColor }]} />
                <Text
                  style={[
                    styles.categoryLabel,
                    { color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
                  ]}
                >
                  {cat.label.toUpperCase()}
                </Text>
              </View>

              {/* Integration rows */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                {cat.integrations.map((integration, idx) => {
                  const isConnected = !!connected[integration.id];
                  const isLast = idx === cat.integrations.length - 1;

                  return (
                    <View key={integration.id}>
                      <View
                        style={[
                          styles.integrationRow,
                          !isLast && {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: colors.border,
                          },
                        ]}
                      >
                        {/* Icon + name + description */}
                        <View style={styles.integrationLeft}>
                          <View
                            style={[
                              styles.iconWrap,
                              {
                                backgroundColor:
                                  isConnected
                                    ? `${accentColor}22`
                                    : colors.muted,
                              },
                            ]}
                          >
                            <Feather
                              name={integration.icon as any}
                              size={16}
                              color={
                                integration.status === "unavailable"
                                  ? colors.mutedForeground
                                  : isConnected
                                  ? accentColor
                                  : colors.mutedForeground
                              }
                            />
                          </View>
                          <View style={styles.integrationInfo}>
                            <Text
                              style={[
                                styles.integrationName,
                                {
                                  color:
                                    integration.status === "unavailable"
                                      ? colors.mutedForeground
                                      : colors.foreground,
                                  fontFamily: "Inter_500Medium",
                                },
                              ]}
                            >
                              {integration.name}
                            </Text>
                            <Text
                              style={[
                                styles.integrationDesc,
                                { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
                              ]}
                              numberOfLines={1}
                            >
                              {integration.description}
                            </Text>
                          </View>
                        </View>

                        {/* Status / action */}
                        <View style={styles.integrationRight}>
                          {integration.status === "unavailable" ? (
                            <View style={[styles.badge, { backgroundColor: colors.muted }]}>
                              <Text style={[styles.badgeText, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
                                Unavailable
                              </Text>
                            </View>
                          ) : isConnected ? (
                            <TouchableOpacity
                              onPress={() => void handleDisconnect(integration)}
                              activeOpacity={0.7}
                              style={[styles.badge, { backgroundColor: "#DCFCE7" }]}
                            >
                              <Feather name="check" size={11} color="#059669" />
                              <Text style={[styles.badgeText, { color: "#059669", fontFamily: "Inter_500Medium" }]}>
                                Connected
                              </Text>
                            </TouchableOpacity>
                          ) : (
                            <View style={styles.rightStack}>
                              {integration.status === "unofficial" && (
                                <View style={[styles.informalBadge, { backgroundColor: `${colors.accent}28`, borderColor: `${colors.accent}55` }]}>
                                  <Text style={[styles.informalBadgeText, { color: colors.accent, fontFamily: "Inter_500Medium" }]}>
                                    Unofficial
                                  </Text>
                                </View>
                              )}
                              <TouchableOpacity
                                onPress={() => void handleConnect(integration)}
                                style={[styles.connectBtn, { backgroundColor: colors.primary }]}
                                activeOpacity={0.8}
                              >
                                <Text style={[styles.connectBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                                  Connect
                                </Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    padding: 4,
    width: 30,
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
  },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  countBadgeText: {
    fontSize: 12,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    height: 40,
  },
  chipsScrollView: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    maxHeight: 52,
  },
  chipsContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    lineHeight: 16,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 24,
  },
  section: {},
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 10,
  },
  categoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  categoryLabel: {
    fontSize: 11,
    letterSpacing: 0.8,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  integrationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  integrationLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  integrationInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  integrationName: {
    fontSize: 14,
    lineHeight: 19,
  },
  integrationDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  integrationRight: {
    flexShrink: 0,
    alignItems: "flex-end",
  },
  rightStack: {
    alignItems: "flex-end",
    gap: 5,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
  },
  badgeText: {
    fontSize: 11,
  },
  informalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
    borderWidth: 1,
  },
  informalBadgeText: {
    fontSize: 10,
  },
  connectBtn: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
  },
  connectBtnText: {
    fontSize: 12,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    textAlign: "center",
  },
});
