import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useValoAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

const REASONS = [
  { id: "expensive", label: "Too expensive" },
  { id: "not_using", label: "Not using it enough" },
  { id: "missing_features", label: "Missing features I need" },
  { id: "switching", label: "Switching to another app" },
  { id: "other", label: "Other" },
];

type Step = "reason" | "save_attempt" | "confirm";

interface Props {
  visible: boolean;
  onClose: () => void;
  onCanceled: () => void;
  periodEnd: string | null;
}

export default function CancellationModal({ visible, onClose, onCanceled, periodEnd }: Props) {
  const colors = useColors();
  const { getToken } = useValoAuth();
  const { refresh } = useSubscription();

  const [step, setStep] = useState<Step>("reason");
  const [reason, setReason] = useState<string | null>(null);
  const [reasonDetail, setReasonDetail] = useState("");
  const [saveAttemptOffered, setSaveAttemptOffered] = useState<string | null>(null);
  const [saveAccepted, setSaveAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setStep("reason");
    setReason(null);
    setReasonDetail("");
    setSaveAttemptOffered(null);
    setSaveAccepted(false);
    setSubmitting(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function submitCancel(accepted: boolean, offer: string | null) {
    setSubmitting(true);
    try {
      const token = await getToken();
      await fetch(`${getApiBase()}/api/subscription/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          reason,
          reasonDetail: reasonDetail || undefined,
          saveAttemptOffered: offer ?? undefined,
          saveAttemptAccepted: accepted,
        }),
      });
      refresh();
      reset();
      onCanceled();
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  }

  function handleReasonNext() {
    if (!reason) return;
    // Determine save attempt for this reason
    const offerMap: Record<string, string> = {
      expensive: "discount",
      not_using: "pause",
      missing_features: "feature_request",
      switching: "competitor",
      other: "thank_you",
    };
    setSaveAttemptOffered(offerMap[reason] ?? "thank_you");
    setStep("save_attempt");
  }

  async function handleSaveAccept() {
    setSaveAccepted(true);
    // For discount/pause — mark as accepted and cancel with save
    await submitCancel(true, saveAttemptOffered);
  }

  function handleSaveDecline() {
    setStep("confirm");
  }

  function formatDate(iso: string | null): string {
    if (!iso) return "end of billing period";
    return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  const SaveAttemptContent = () => {
    const offer = saveAttemptOffered;
    if (offer === "discount") {
      return (
        <>
          <Text style={[styles.saveTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Before you go...
          </Text>
          <Text style={[styles.saveBody, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            We'd hate to lose you. How about 50% off your next month?
          </Text>
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSaveAccept} disabled={submitting}>
            {submitting ? <ActivityIndicator color={colors.primaryForeground} /> : (
              <Text style={[styles.saveBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                Apply 50% discount
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.noThanksBtn} onPress={handleSaveDecline}>
            <Text style={[styles.noThanksText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              No thanks, cancel anyway
            </Text>
          </TouchableOpacity>
        </>
      );
    }
    if (offer === "pause") {
      return (
        <>
          <Text style={[styles.saveTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Need a break?
          </Text>
          <Text style={[styles.saveBody, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Pause your subscription for 30 days at no extra charge. We'll be here when you're ready.
          </Text>
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSaveAccept} disabled={submitting}>
            {submitting ? <ActivityIndicator color={colors.primaryForeground} /> : (
              <Text style={[styles.saveBtnText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                Pause for 30 days
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.noThanksBtn} onPress={handleSaveDecline}>
            <Text style={[styles.noThanksText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              No thanks, cancel anyway
            </Text>
          </TouchableOpacity>
        </>
      );
    }
    if (offer === "feature_request") {
      return (
        <>
          <Text style={[styles.saveTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            What's missing?
          </Text>
          <Text style={[styles.saveBody, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
            Tell us what feature would keep you here. Your feedback directly shapes our roadmap.
          </Text>
          <TextInput
            style={[styles.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
            placeholder="I wish Valo had..."
            placeholderTextColor={colors.mutedForeground}
            multiline
            numberOfLines={4}
            value={reasonDetail}
            onChangeText={setReasonDetail}
          />
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.muted }]} onPress={handleSaveDecline}>
            <Text style={[styles.saveBtnText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              Submit and cancel
            </Text>
          </TouchableOpacity>
        </>
      );
    }
    if (offer === "competitor") {
      return (
        <>
          <Text style={[styles.saveTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
            Which app are you switching to?
          </Text>
          <TextInput
            style={[styles.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: "Inter_400Regular" }]}
            placeholder="e.g. Whoop, Oura, Notion..."
            placeholderTextColor={colors.mutedForeground}
            value={reasonDetail}
            onChangeText={setReasonDetail}
          />
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.muted }]} onPress={handleSaveDecline}>
            <Text style={[styles.saveBtnText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
              Submit and cancel
            </Text>
          </TouchableOpacity>
        </>
      );
    }
    // thank_you
    return (
      <>
        <Text style={[styles.saveTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
          Thank you for trying Valo
        </Text>
        <Text style={[styles.saveBody, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          We'd love to have you back any time. Your data will be preserved for 90 days.
        </Text>
        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.muted }]} onPress={handleSaveDecline}>
          <Text style={[styles.saveBtnText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Continue with cancellation
          </Text>
        </TouchableOpacity>
      </>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            {step === "reason" ? "Cancel subscription" : step === "save_attempt" ? "One moment..." : "Confirm cancellation"}
          </Text>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {step === "reason" && (
            <>
              <Text style={[styles.reasonPrompt, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                Help us improve — why are you canceling?
              </Text>
              <View style={styles.reasons}>
                {REASONS.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    activeOpacity={0.75}
                    onPress={() => setReason(r.id)}
                    style={[
                      styles.reasonOption,
                      {
                        backgroundColor: reason === r.id ? colors.primary : colors.card,
                        borderColor: reason === r.id ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.reasonOptionText,
                        {
                          color: reason === r.id ? colors.primaryForeground : colors.foreground,
                          fontFamily: reason === r.id ? "Inter_600SemiBold" : "Inter_400Regular",
                        },
                      ]}
                    >
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.nextBtn, { backgroundColor: reason ? colors.primary : colors.muted }]}
                onPress={handleReasonNext}
                disabled={!reason}
              >
                <Text style={[styles.nextBtnText, { color: reason ? colors.primaryForeground : colors.mutedForeground, fontFamily: "Inter_600SemiBold" }]}>
                  Next
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === "save_attempt" && <SaveAttemptContent />}

          {step === "confirm" && (
            <>
              <Text style={[styles.confirmBody, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}>
                Your subscription will remain active until{" "}
                <Text style={{ fontFamily: "Inter_600SemiBold" }}>{formatDate(periodEnd)}</Text>.
                After that, your account will be locked.
              </Text>
              <TouchableOpacity
                style={[styles.confirmBtn, { borderColor: colors.destructive }]}
                onPress={() => void submitCancel(false, saveAttemptOffered)}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.destructive} />
                ) : (
                  <Text style={[styles.confirmBtnText, { color: colors.destructive, fontFamily: "Inter_600SemiBold" }]}>
                    Confirm cancellation
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.keepBtn} onPress={handleClose}>
                <Text style={[styles.keepBtnText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
                  Keep my subscription
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17 },
  body: { padding: 24, gap: 16 },
  reasonPrompt: { fontSize: 15, marginBottom: 8 },
  reasons: { gap: 10 },
  reasonOption: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  reasonOptionText: { fontSize: 15 },
  nextBtn: {
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  nextBtnText: { fontSize: 16 },
  saveTitle: { fontSize: 22, lineHeight: 30 },
  saveBody: { fontSize: 15, lineHeight: 22 },
  saveBtn: {
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: { fontSize: 16 },
  noThanksBtn: { alignItems: "center", paddingVertical: 10 },
  noThanksText: { fontSize: 14 },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    minHeight: 100,
    fontSize: 15,
    textAlignVertical: "top",
  },
  confirmBody: { fontSize: 15, lineHeight: 22 },
  confirmBtn: {
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    marginTop: 8,
  },
  confirmBtnText: { fontSize: 16 },
  keepBtn: { alignItems: "center", paddingVertical: 10 },
  keepBtnText: { fontSize: 14 },
});
