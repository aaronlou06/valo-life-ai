import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useAskValo, type AskCitation, type AskTurn } from "@workspace/api-client-react";

interface Turn {
  question: string;
  answer: string | null;
  citations: AskCitation[];
  failed?: boolean;
}

const STARTERS = [
  "What did I struggle with recently?",
  "When did I last feel good?",
  "What do I have this week?",
  "How has my sleep been?",
];

function formatCitationDate(date: string): string {
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function AskValoScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const ask = useAskValo();
  const scrollRef = useRef<ScrollView>(null);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const isPending = ask.isPending;

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const submit = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (question === "" || isPending) return;

      setInput("");

      // Build prior turns from completed answers only.
      const priorTurns: AskTurn[] = turns
        .filter((t): t is Turn & { answer: string } => typeof t.answer === "string" && !t.failed)
        .map((t) => ({ question: t.question, answer: t.answer }));

      const index = turns.length;
      setTurns((prev) => [...prev, { question, answer: null, citations: [] }]);
      scrollToEnd();

      try {
        const result = await ask.mutateAsync({ data: { question, priorTurns } });
        setTurns((prev) => {
          const next = [...prev];
          next[index] = {
            question,
            answer: result.answer,
            citations: result.citations ?? [],
          };
          return next;
        });
      } catch {
        setTurns((prev) => {
          const next = [...prev];
          next[index] = {
            question,
            answer: "Something went wrong reaching Valo. Please try again.",
            citations: [],
            failed: true,
          };
          return next;
        });
      } finally {
        scrollToEnd();
      }
    },
    [ask, isPending, turns, scrollToEnd],
  );

  function toggleCitations(index: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const canSend = input.trim().length > 0 && !isPending;
  const isEmpty = turns.length === 0;

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          {
            paddingTop:
              (Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top) + 12,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          style={styles.headerBtn}
        >
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text
          style={[
            styles.headerTitle,
            { color: colors.foreground, fontFamily: "Inter_600SemiBold" },
          ]}
        >
          Ask Valo
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {isEmpty ? (
            <View style={styles.empty}>
              <View
                style={[
                  styles.emptyIcon,
                  { backgroundColor: colors.secondary, borderColor: colors.border },
                ]}
              >
                <Feather name="message-circle" size={22} color={colors.primary} />
              </View>
              <Text
                style={[
                  styles.emptyTitle,
                  { color: colors.foreground, fontFamily: "Inter_600SemiBold" },
                ]}
              >
                Ask about your own life
              </Text>
              <Text
                style={[
                  styles.emptyText,
                  { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
                ]}
              >
                Valo answers using your check-ins, journal, goals, habits, calendar,
                and health data — and shows where each answer comes from.
              </Text>

              <View style={styles.starters}>
                {STARTERS.map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => void submit(s)}
                    activeOpacity={0.75}
                    style={[
                      styles.starterChip,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    <Text
                      style={[
                        styles.starterText,
                        { color: colors.foreground, fontFamily: "Inter_500Medium" },
                      ]}
                    >
                      {s}
                    </Text>
                    <Feather
                      name="arrow-up-right"
                      size={14}
                      color={colors.mutedForeground}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.turns}>
              {turns.map((turn, i) => {
                const showCitations = expanded.has(i);
                return (
                  <View key={i} style={styles.turn}>
                    {/* Question */}
                    <View style={styles.questionRow}>
                      <View
                        style={[
                          styles.questionBubble,
                          { backgroundColor: colors.secondary },
                        ]}
                      >
                        <Text
                          style={[
                            styles.questionText,
                            { color: colors.foreground, fontFamily: "Inter_500Medium" },
                          ]}
                        >
                          {turn.question}
                        </Text>
                      </View>
                    </View>

                    {/* Answer */}
                    {turn.answer === null ? (
                      <View
                        style={[
                          styles.answerCard,
                          { backgroundColor: colors.card, borderColor: colors.border },
                        ]}
                      >
                        <ActivityIndicator size="small" color={colors.mutedForeground} />
                        <Text
                          style={[
                            styles.thinkingText,
                            { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
                          ]}
                        >
                          Valo is thinking
                        </Text>
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.answerCard,
                          styles.answerCardAnswered,
                          {
                            backgroundColor: colors.card,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.answerText,
                            { color: colors.foreground, fontFamily: "Inter_400Regular" },
                          ]}
                        >
                          {turn.answer}
                        </Text>

                        {turn.citations.length > 0 && (
                          <View
                            style={[
                              styles.citationsWrap,
                              { borderTopColor: colors.border },
                            ]}
                          >
                            <TouchableOpacity
                              onPress={() => toggleCitations(i)}
                              activeOpacity={0.7}
                              style={styles.citationsToggle}
                              hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
                            >
                              <Feather
                                name="book-open"
                                size={13}
                                color={colors.mutedForeground}
                              />
                              <Text
                                style={[
                                  styles.citationsToggleText,
                                  { color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
                                ]}
                              >
                                Sources ({turn.citations.length})
                              </Text>
                              <Feather
                                name={showCitations ? "chevron-up" : "chevron-down"}
                                size={15}
                                color={colors.mutedForeground}
                              />
                            </TouchableOpacity>

                            {showCitations && (
                              <View style={styles.citationsList}>
                                {turn.citations.map((c, ci) => (
                                  <View
                                    key={ci}
                                    style={[
                                      styles.citation,
                                      { backgroundColor: colors.secondary },
                                    ]}
                                  >
                                    <View style={styles.citationHead}>
                                      <Text
                                        style={[
                                          styles.citationSource,
                                          { color: colors.primary, fontFamily: "Inter_600SemiBold" },
                                        ]}
                                      >
                                        {c.source}
                                      </Text>
                                      {c.date ? (
                                        <Text
                                          style={[
                                            styles.citationDate,
                                            { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
                                          ]}
                                        >
                                          {formatCitationDate(c.date)}
                                        </Text>
                                      ) : null}
                                    </View>
                                    {c.excerpt ? (
                                      <Text
                                        style={[
                                          styles.citationExcerpt,
                                          { color: colors.foreground, fontFamily: "Inter_400Regular" },
                                        ]}
                                      >
                                        {c.excerpt}
                                      </Text>
                                    ) : null}
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* ── Input bar ── */}
        <View
          style={[
            styles.inputBar,
            {
              borderTopColor: colors.border,
              backgroundColor: colors.background,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.input,
                color: colors.foreground,
                fontFamily: "Inter_400Regular",
              },
            ]}
            placeholder="Ask Valo anything..."
            placeholderTextColor={colors.mutedForeground}
            value={input}
            onChangeText={setInput}
            multiline
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={() => void submit(input)}
          />
          <TouchableOpacity
            onPress={() => void submit(input)}
            activeOpacity={0.8}
            disabled={!canSend}
            style={[
              styles.sendBtn,
              { backgroundColor: canSend ? colors.primary : colors.secondary },
            ]}
          >
            {isPending ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Feather
                name="arrow-up"
                size={20}
                color={canSend ? colors.primaryForeground : colors.mutedForeground}
              />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    minWidth: 44,
    height: 32,
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    flexGrow: 1,
  },
  // ── Empty state ──
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 24,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 19,
    marginBottom: 8,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    maxWidth: 320,
    marginBottom: 28,
  },
  starters: {
    width: "100%",
    gap: 10,
  },
  starterChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  starterText: {
    fontSize: 14,
    flex: 1,
  },
  // ── Turns ──
  turns: {
    gap: 24,
  },
  turn: {
    gap: 12,
  },
  questionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  questionBubble: {
    maxWidth: "85%",
    borderRadius: 16,
    borderTopRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  questionText: {
    fontSize: 15,
    lineHeight: 21,
  },
  answerCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  answerCardAnswered: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 0,
  },
  thinkingText: {
    fontSize: 14,
  },
  answerText: {
    fontSize: 15,
    lineHeight: 24,
  },
  // ── Citations ──
  citationsWrap: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  citationsToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  citationsToggleText: {
    fontSize: 13,
    flex: 1,
  },
  citationsList: {
    gap: 8,
    marginTop: 12,
  },
  citation: {
    borderRadius: 12,
    padding: 12,
    gap: 5,
  },
  citationHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  citationSource: {
    fontSize: 12,
    letterSpacing: 0.2,
    textTransform: "uppercase",
    flex: 1,
  },
  citationDate: {
    fontSize: 12,
  },
  citationExcerpt: {
    fontSize: 14,
    lineHeight: 20,
  },
  // ── Input bar ──
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: Platform.OS === "ios" ? 12 : 8,
    paddingBottom: Platform.OS === "ios" ? 12 : 8,
    fontSize: 15,
    lineHeight: 20,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
