import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSharedCommitments,
  useListBuddies,
  useListCommitmentExceptions,
  useGetAccountabilityFeed,
  useAddCommitmentParticipant,
  useRemoveCommitmentParticipant,
  useCreateCommitmentException,
  getListSharedCommitmentsQueryKey,
  getListCommitmentExceptionsQueryKey,
  type Buddy,
  type SharedCommitmentWithParticipants,
  type CommitmentParticipantSummary,
  type CommitmentException,
  type AccountabilityFeedItem,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

const TERRACOTTA = "#C17B3F";
const AMBER = "#D4A847";

const SCOPES: { value: string; label: string; hint: string }[] = [
  { value: "streak_only", label: "Streak only", hint: "Just whether you're keeping it up" },
  { value: "summary", label: "Summary", hint: "Streak plus weekly progress" },
  { value: "full", label: "Full", hint: "All details of this commitment" },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CommitmentDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id?: string }>();
  const commitmentId = Number(params.id);

  const commitmentsQ = useListSharedCommitments();
  const buddiesQ = useListBuddies();
  const exceptionsQ = useListCommitmentExceptions(commitmentId);
  const feedQ = useGetAccountabilityFeed();
  const addParticipant = useAddCommitmentParticipant();
  const removeParticipant = useRemoveCommitmentParticipant();
  const createException = useCreateCommitmentException();

  const [pendingScope, setPendingScope] = useState("summary");
  const [pickingBuddyId, setPickingBuddyId] = useState<number | null>(null);

  const topPad = (Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top) + 12;

  const commitment = useMemo<SharedCommitmentWithParticipants | undefined>(
    () => ((commitmentsQ.data ?? []) as SharedCommitmentWithParticipants[]).find((c) => c.id === commitmentId),
    [commitmentsQ.data, commitmentId],
  );
  const buddies = (buddiesQ.data ?? []) as Buddy[];
  const exceptions = (exceptionsQ.data ?? []) as CommitmentException[];

  const sharedRelationshipIds = new Set(
    (commitment?.participants ?? [])
      .map((p) => p.buddyRelationshipId)
      .filter((x): x is number => x != null),
  );
  const availableBuddies = buddies.filter((b) => !sharedRelationshipIds.has(b.relationshipId));

  const today = todayISO();
  const activeException = exceptions.find((e) => e.startDate <= today && e.endDate >= today);

  const encouragements = ((feedQ.data?.items ?? []) as AccountabilityFeedItem[]).filter((it) => {
    if (it.type !== "encouragement") return false;
    const raw = (it.data as Record<string, unknown>).commitmentId;
    return Number(raw) === commitmentId;
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListSharedCommitmentsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListCommitmentExceptionsQueryKey(commitmentId) });
  };

  const share = async (relationshipId: number) => {
    if (addParticipant.isPending) return;
    setPickingBuddyId(relationshipId);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await addParticipant.mutateAsync({
        id: commitmentId,
        data: { buddyRelationshipId: relationshipId, shareScope: pendingScope },
      });
      invalidate();
    } catch {
      // surfaced via addParticipant.isError
    } finally {
      setPickingBuddyId(null);
    }
  };

  const revoke = (participant: CommitmentParticipantSummary) => {
    if (removeParticipant.isPending) return;
    Alert.alert(
      "Remove access",
      `${participant.displayName ?? "Your buddy"} will no longer see this commitment. They won't be notified.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              await removeParticipant.mutateAsync({ id: commitmentId, participantId: participant.participantId });
              invalidate();
            } catch {
              // surfaced via removeParticipant.isError
            }
          },
        },
      ],
    );
  };

  const pauseWeek = async () => {
    if (createException.isPending) return;
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 6);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await createException.mutateAsync({
        data: {
          kind: "pause",
          scope: "one",
          commitmentId,
          startDate: start.toISOString().slice(0, 10),
          endDate: end.toISOString().slice(0, 10),
        },
      });
      invalidate();
    } catch {
      // surfaced via createException.isError
    }
  };

  if (commitmentsQ.isLoading) {
    return (
      <View style={[styles.safe, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={TERRACOTTA} />
      </View>
    );
  }

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>
          Commitment
        </Text>
        <View style={styles.iconBtn} />
      </View>

      {!commitment ? (
        <View style={styles.center}>
          <Text style={[styles.quiet, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            This commitment could not be found.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.title, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            {commitment.title}
          </Text>
          <Text style={[styles.meta, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            {commitment.cadence}
            {commitment.cadenceDaysPerWeek ? ` · ${commitment.cadenceDaysPerWeek}x per week` : ""}
          </Text>

          {activeException && (
            <View style={[styles.pauseBanner, { backgroundColor: `${AMBER}1F`, borderColor: `${AMBER}40` }]}>
              <Feather name="pause-circle" size={16} color={AMBER} />
              <Text style={[styles.pauseText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                Paused through {new Date(activeException.endDate).toLocaleDateString()}
              </Text>
            </View>
          )}

          {/* Participants */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            SHARED WITH
          </Text>
          {commitment.participants.length === 0 ? (
            <Text style={[styles.quiet, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Not shared with anyone yet.
            </Text>
          ) : (
            commitment.participants.map((p) => (
              <View
                key={p.participantId}
                style={[styles.participantRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.participantName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                    {p.displayName ?? "Your buddy"}
                  </Text>
                  <Text style={[styles.participantScope, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                    {SCOPES.find((s) => s.value === p.shareScope)?.label ?? p.shareScope}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => revoke(p)} activeOpacity={0.7} hitSlop={8} style={styles.revokeBtn}>
                  <Feather name="x-circle" size={18} color={colors.destructive} />
                </TouchableOpacity>
              </View>
            ))
          )}

          {/* Add participant */}
          {buddies.length === 0 ? (
            <TouchableOpacity
              onPress={() => router.push("/buddy-invite")}
              activeOpacity={0.7}
              style={[styles.addRow, { borderColor: colors.border }]}
            >
              <Feather name="user-plus" size={16} color={TERRACOTTA} />
              <Text style={[styles.addText, { color: TERRACOTTA, fontFamily: "Inter_500Medium" }]}>
                Invite a buddy to share with
              </Text>
            </TouchableOpacity>
          ) : availableBuddies.length > 0 ? (
            <View style={{ marginTop: 16 }}>
              <Text style={[styles.subLabel, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                Share with a buddy
              </Text>
              <Text style={[styles.subHelp, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Choose what they can see:
              </Text>
              <View style={styles.chipWrap}>
                {SCOPES.map((s) => {
                  const active = s.value === pendingScope;
                  return (
                    <TouchableOpacity
                      key={s.value}
                      onPress={() => setPendingScope(s.value)}
                      activeOpacity={0.8}
                      style={[
                        styles.chip,
                        { backgroundColor: active ? TERRACOTTA : colors.card, borderColor: active ? TERRACOTTA : colors.border },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: active ? "#FFFFFF" : colors.foreground, fontFamily: "Inter_500Medium" }]}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={[styles.scopeHint, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                {SCOPES.find((s) => s.value === pendingScope)?.hint}
              </Text>
              {availableBuddies.map((b) => (
                <TouchableOpacity
                  key={b.relationshipId}
                  onPress={() => share(b.relationshipId)}
                  activeOpacity={0.8}
                  disabled={addParticipant.isPending}
                  style={[styles.buddyPick, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <Text style={[styles.participantName, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                    {b.displayName ?? "Your buddy"}
                  </Text>
                  {pickingBuddyId === b.relationshipId ? (
                    <ActivityIndicator color={TERRACOTTA} />
                  ) : (
                    <Feather name="plus-circle" size={18} color={TERRACOTTA} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {(addParticipant.isError || removeParticipant.isError) && (
            <Text style={[styles.errorText, { color: colors.destructive, fontFamily: "Inter_400Regular" }]}>
              Something went wrong updating who this is shared with. Please try again.
            </Text>
          )}

          {/* Pause */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 28 }]}>
            NEED A BREAK?
          </Text>
          <Text style={[styles.subHelp, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Pause this commitment for a week. Your buddies will see it's paused, not slipping.
          </Text>
          <TouchableOpacity
            onPress={pauseWeek}
            activeOpacity={0.8}
            disabled={createException.isPending || activeException != null}
            style={[
              styles.pauseBtn,
              { borderColor: colors.border, opacity: activeException != null ? 0.5 : 1 },
            ]}
          >
            {createException.isPending ? (
              <ActivityIndicator color={AMBER} />
            ) : (
              <>
                <Feather name="pause" size={16} color={AMBER} />
                <Text style={[styles.pauseBtnText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                  {activeException != null ? "Already paused" : "Pause for a week"}
                </Text>
              </>
            )}
          </TouchableOpacity>
          {createException.isError && (
            <Text style={[styles.errorText, { color: colors.destructive, fontFamily: "Inter_400Regular" }]}>
              Could not pause this commitment. Please try again.
            </Text>
          )}

          {/* Exception log */}
          {exceptions.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 28 }]}>
                EXCEPTION LOG
              </Text>
              {[...exceptions]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((ex) => (
                  <View
                    key={ex.id}
                    style={[styles.exRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={styles.exHeadRow}>
                        <Text style={[styles.exKind, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
                          {ex.kind === "pause" ? "Pause" : "Excused absence"}
                        </Text>
                        {ex.isRetroactive && (
                          <View style={[styles.retroBadge, { backgroundColor: `${AMBER}22` }]}>
                            <Text style={[styles.retroText, { color: AMBER, fontFamily: "Inter_500Medium" }]}>
                              noted retroactively
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.exDates, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                        {new Date(ex.startDate).toLocaleDateString()} – {new Date(ex.endDate).toLocaleDateString()}
                      </Text>
                      {ex.reason ? (
                        <Text style={[styles.exReason, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                          {ex.reason}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
            </>
          )}

          {/* Encouragement history */}
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 28 }]}>
            ENCOURAGEMENT
          </Text>
          {encouragements.length === 0 ? (
            <Text style={[styles.quiet, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              No cheers on this commitment yet.
            </Text>
          ) : (
            encouragements.map((e) => (
              <View
                key={e.id}
                style={[styles.encRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Feather name="heart" size={15} color={TERRACOTTA} />
                <Text style={[styles.encText, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                  A buddy cheered you on
                </Text>
                <Text style={[styles.encTime, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  {new Date(e.timestamp).toLocaleDateString()}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, flex: 1, textAlign: "center" },
  title: { fontSize: 22, marginBottom: 4 },
  meta: { fontSize: 13, marginBottom: 16, textTransform: "capitalize" },
  pauseBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  pauseText: { fontSize: 13 },
  sectionLabel: { fontSize: 11, letterSpacing: 0.6, marginBottom: 10, marginTop: 8 },
  quiet: { fontSize: 13, lineHeight: 19 },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  participantName: { fontSize: 14, marginBottom: 2 },
  participantScope: { fontSize: 12 },
  revokeBtn: { padding: 4 },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    paddingVertical: 14,
    marginTop: 12,
  },
  addText: { fontSize: 14 },
  subLabel: { fontSize: 14, marginBottom: 4 },
  subHelp: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13 },
  scopeHint: { fontSize: 12, marginTop: 8, marginBottom: 12, fontStyle: "italic" },
  buddyPick: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
  },
  errorText: { fontSize: 13, marginTop: 12 },
  pauseBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    marginTop: 12,
  },
  pauseBtnText: { fontSize: 14 },
  encRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  encText: { fontSize: 13, flex: 1 },
  encTime: { fontSize: 11 },
  exRow: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  exHeadRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  exKind: { fontSize: 13 },
  exDates: { fontSize: 12, lineHeight: 18 },
  exReason: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  retroBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  retroText: { fontSize: 10, letterSpacing: 0.2 },
});
