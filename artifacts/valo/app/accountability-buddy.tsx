import React, { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListBuddies,
  useListSharedCommitments,
  useGetAccountabilityFeed,
  useListBuddyCommitments,
  useCreateEncouragement,
  getGetAccountabilityFeedQueryKey,
  type Buddy,
  type BuddyCommitmentView,
  type SharedCommitmentWithParticipants,
  type AccountabilityFeedItem,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

const TERRACOTTA = "#C17B3F";
const SAGE = "#6B9E78";
const AMBER = "#D4A847";

const STATUS_META: Record<string, { label: string; color: string }> = {
  on_track: { label: "On track", color: SAGE },
  slipping: { label: "Slipping", color: AMBER },
  away: { label: "Away", color: TERRACOTTA },
};

function metricLine(c: BuddyCommitmentView): string {
  const parts: string[] = [];
  if (c.streak != null) parts.push(`${c.streak}-day streak`);
  if (c.completionRate != null && c.weeklyTarget != null) {
    const done = Math.round(c.completionRate * c.weeklyTarget);
    parts.push(`${done}/${c.weeklyTarget} this week`);
  } else if (c.completionRate != null) {
    parts.push(`${Math.round(c.completionRate * 100)}% complete`);
  }
  return parts.join(" · ") || "Shared with you";
}

export default function AccountabilityBuddyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const buddiesQ = useListBuddies();
  const commitmentsQ = useListSharedCommitments();
  const feedQ = useGetAccountabilityFeed();

  const topPad = (Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top) + 12;
  const buddies = (buddiesQ.data ?? []) as Buddy[];
  const commitments = (commitmentsQ.data ?? []) as SharedCommitmentWithParticipants[];
  const feed = (feedQ.data?.items ?? []) as AccountabilityFeedItem[];

  const loading = buddiesQ.isLoading || commitmentsQ.isLoading || feedQ.isLoading;
  const errored = buddiesQ.isError || commitmentsQ.isError || feedQ.isError;

  const retry = () => {
    buddiesQ.refetch();
    commitmentsQ.refetch();
    feedQ.refetch();
  };

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          Accountability
        </Text>
        <TouchableOpacity
          onPress={() => router.push("/buddy-invite")}
          activeOpacity={0.7}
          style={styles.iconBtn}
        >
          <Feather name="user-plus" size={20} color={TERRACOTTA} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={TERRACOTTA} />
        </View>
      ) : errored ? (
        <View style={styles.center}>
          <Feather name="wifi-off" size={24} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold", marginTop: 12 }]}>
            Couldn't load
          </Text>
          <Text style={[styles.emptySub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 4 }]}>
            Check your connection and try again.
          </Text>
          <TouchableOpacity
            onPress={retry}
            activeOpacity={0.8}
            style={[styles.primaryBtn, { backgroundColor: TERRACOTTA, marginTop: 16 }]}
          >
            <Feather name="refresh-cw" size={16} color="#FFFFFF" />
            <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        >
          {/* Section A — Your Buddies */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            YOUR BUDDIES
          </Text>
          {buddies.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="users" size={24} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                No buddies yet
              </Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Invite someone to keep each other on track.
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/buddy-invite")}
                activeOpacity={0.8}
                style={[styles.primaryBtn, { backgroundColor: TERRACOTTA }]}
              >
                <Feather name="user-plus" size={16} color="#FFFFFF" />
                <Text style={[styles.primaryBtnText, { fontFamily: "Inter_600SemiBold" }]}>Invite a buddy</Text>
              </TouchableOpacity>
            </View>
          ) : (
            buddies.map((b) => <BuddyCard key={b.relationshipId} buddy={b} colors={colors} />)
          )}

          {/* Section B — Your Shared Commitments */}
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginBottom: 0 }]}>
              YOUR SHARED COMMITMENTS
            </Text>
            <TouchableOpacity onPress={() => router.push("/commitment/new")} activeOpacity={0.7} hitSlop={8}>
              <Feather name="plus" size={18} color={TERRACOTTA} />
            </TouchableOpacity>
          </View>
          {commitments.length === 0 ? (
            <TouchableOpacity
              onPress={() => router.push("/commitment/new")}
              activeOpacity={0.7}
              style={[styles.addRow, { borderColor: colors.border }]}
            >
              <Feather name="plus" size={18} color={TERRACOTTA} />
              <Text style={[styles.addText, { color: TERRACOTTA, fontFamily: "Inter_500Medium" }]}>
                Create a commitment
              </Text>
            </TouchableOpacity>
          ) : (
            commitments.map((c) => (
              <TouchableOpacity
                key={c.id}
                onPress={() => router.push(`/commitment/${c.id}`)}
                activeOpacity={0.8}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                    {c.title}
                  </Text>
                  <Text style={[styles.cardSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    {c.participants.length === 0
                      ? "Not shared yet"
                      : `Shared with ${c.participants
                          .map((p) => p.displayName ?? "a buddy")
                          .join(", ")}`}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            ))
          )}

          {/* Section C — Activity */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 24 }]}>
            ACTIVITY
          </Text>
          {feed.length === 0 ? (
            <Text style={[styles.quietLine, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              No activity yet.
            </Text>
          ) : (
            feed.map((item) => <FeedRow key={`${item.type}-${item.id}`} item={item} colors={colors} />)
          )}

          {/* Section D — AI Coach placeholder */}
          <View
            style={[
              styles.coachCard,
              { backgroundColor: colors.muted, borderColor: colors.border },
            ]}
          >
            <View style={[styles.coachIcon, { backgroundColor: `${TERRACOTTA}1F` }]}>
              <Feather name="compass" size={18} color={TERRACOTTA} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.coachTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                Valo Coach
              </Text>
              <Text style={[styles.coachSub, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                An AI coach on your commitments — coming soon.
              </Text>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function BuddyCard({
  buddy,
  colors,
}: {
  buddy: Buddy;
  colors: ReturnType<typeof useColors>;
}) {
  const q = useListBuddyCommitments(buddy.relationshipId);
  const views = (q.data ?? []) as BuddyCommitmentView[];

  return (
    <View style={[styles.buddyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.buddyHead}>
        <View style={[styles.avatar, { backgroundColor: `${TERRACOTTA}1F` }]}>
          <Text style={[styles.avatarText, { color: TERRACOTTA, fontFamily: "Inter_600SemiBold" }]}>
            {(buddy.displayName ?? "?").slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <Text style={[styles.buddyName, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
          {buddy.displayName ?? "Your buddy"}
        </Text>
      </View>

      {q.isLoading ? (
        <ActivityIndicator color={TERRACOTTA} style={{ marginVertical: 8 }} />
      ) : views.length === 0 ? (
        <Text style={[styles.quietLine, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Nothing shared with you yet.
        </Text>
      ) : (
        views.map((v) => (
          <CommitmentRow key={v.commitmentId} view={v} colors={colors} />
        ))
      )}
    </View>
  );
}

function CommitmentRow({
  view,
  colors,
}: {
  view: BuddyCommitmentView;
  colors: ReturnType<typeof useColors>;
}) {
  const queryClient = useQueryClient();
  const createEncouragement = useCreateEncouragement();
  const [cheered, setCheered] = useState(false);
  const meta = STATUS_META[view.onTrackStatus] ?? STATUS_META.on_track!;
  const cheerKey = `cheer_${view.commitmentId}_${new Date().toISOString().slice(0, 10)}`;

  useEffect(() => {
    AsyncStorage.getItem(cheerKey).then((v) => {
      if (v === "1") setCheered(true);
    });
  }, [cheerKey]);

  const markCheered = () => {
    setCheered(true);
    AsyncStorage.setItem(cheerKey, "1");
  };

  const sendSupport = async () => {
    if (cheered || createEncouragement.isPending) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await createEncouragement.mutateAsync({ data: { commitmentId: view.commitmentId } });
      markCheered();
      queryClient.invalidateQueries({ queryKey: getGetAccountabilityFeedQueryKey() });
    } catch (err) {
      // 409 means we already cheered today — reflect the muted state anyway.
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) markCheered();
    }
  };

  return (
    <View style={[styles.commitRow, { borderTopColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.commitTitle, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          {view.title}
        </Text>
        <View style={styles.commitMetaRow}>
          <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
          <Text style={[styles.commitMeta, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {meta.label} · {metricLine(view)}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={sendSupport}
        activeOpacity={0.7}
        disabled={cheered}
        style={[
          styles.supportBtn,
          cheered
            ? { backgroundColor: colors.muted }
            : { backgroundColor: `${SAGE}1F` },
        ]}
      >
        <Feather name={cheered ? "check" : "heart"} size={13} color={cheered ? colors.mutedForeground : SAGE} />
        <Text
          style={[
            styles.supportText,
            { color: cheered ? colors.mutedForeground : SAGE, fontFamily: "Inter_600SemiBold" },
          ]}
        >
          {cheered ? "Cheered today" : "Support"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function FeedRow({
  item,
  colors,
}: {
  item: AccountabilityFeedItem;
  colors: ReturnType<typeof useColors>;
}) {
  const data = item.data as Record<string, unknown>;
  let icon: keyof typeof Feather.glyphMap = "activity";
  let text = "";
  let retro = false;

  if (item.type === "encouragement") {
    icon = "heart";
    text = "A buddy cheered you on";
  } else if (item.type === "exception") {
    icon = "pause-circle";
    const kind = String(data.kind ?? "pause");
    text = kind === "pause" ? "You paused a commitment" : "You logged an excused absence";
    retro = data.isRetroactive === true;
  } else if (item.type === "buddy_joined") {
    icon = "user-check";
    text = "A buddy joined";
  }

  return (
    <View style={styles.feedRow}>
      <View style={[styles.feedIcon, { backgroundColor: colors.muted }]}>
        <Feather name={icon} size={14} color={colors.mutedForeground} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.feedText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
          {text}
        </Text>
        {retro && (
          <Text style={[styles.retroBadge, { color: AMBER, fontFamily: "Inter_500Medium" }]}>
            noted retroactively
          </Text>
        )}
      </View>
      <Text style={[styles.feedTime, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
        {formatRelative(item.timestamp)}
      </Text>
    </View>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionLabel: { fontSize: 11, letterSpacing: 0.6, marginBottom: 10 },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
    marginBottom: 10,
  },
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { fontSize: 15 },
  emptySub: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 14 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  cardText: { fontSize: 14, marginBottom: 4 },
  cardSub: { fontSize: 12, lineHeight: 17 },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    paddingVertical: 14,
  },
  addText: { fontSize: 14 },
  buddyCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  buddyHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 14 },
  buddyName: { fontSize: 15 },
  commitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 12,
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commitTitle: { fontSize: 14, marginBottom: 4 },
  commitMetaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  commitMeta: { fontSize: 12, flex: 1 },
  supportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  supportText: { fontSize: 12 },
  quietLine: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  feedRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  feedIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  feedText: { fontSize: 13, lineHeight: 18 },
  retroBadge: { fontSize: 11, marginTop: 2 },
  feedTime: { fontSize: 11 },
  coachCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    padding: 14,
    marginTop: 24,
  },
  coachIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  coachTitle: { fontSize: 14, marginBottom: 2 },
  coachSub: { fontSize: 12, lineHeight: 17 },
});
