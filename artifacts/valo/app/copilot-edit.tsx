import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { customFetch } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { TemplateEditor, type TemplateEditorData, type TemplateSlot } from "@/components/TemplateEditor";

type ServerSlot = {
  id: number;
  exerciseId: number;
  name: string;
  category: string;
  trackingType: string;
  orderIndex: number;
  prescribedSets: number | null;
  prescribedReps: number | null;
  prescribedWeightKg: string | null;
  prescribedDurationSec: number | null;
  prescribedDistanceM: number | null;
  restSec: number;
  supersetGroupId: number | null;
  notes: string | null;
};

let _key = 0;
function nextKey() { return `slot-edit-${Date.now()}-${++_key}`; }

export default function CopilotEditScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    name: string;
    category: string;
    duration?: string;
    notes?: string;
  }>();

  const templateId = params.id ? parseInt(params.id, 10) : null;
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [initialSlots, setInitialSlots] = useState<TemplateSlot[]>([]);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const originalSlotIdsRef = useRef<number[]>([]);

  useEffect(() => {
    if (!templateId) return;
    void loadSlots(templateId);
  }, [templateId]);

  async function loadSlots(id: number) {
    setLoadingSlots(true);
    try {
      const slots = await customFetch<ServerSlot[]>(`/api/workout/templates/${id}/exercises`);
      originalSlotIdsRef.current = slots.map((s) => s.id);
      setInitialSlots(
        slots.map((s) => ({
          key: nextKey(),
          id: s.id,
          exerciseId: s.exerciseId,
          exerciseName: s.name,
          exerciseCategory: s.category,
          trackingType: s.trackingType,
          prescribedSets: s.prescribedSets != null ? String(s.prescribedSets) : "",
          prescribedReps: s.prescribedReps != null ? String(s.prescribedReps) : "",
          prescribedWeightKg: s.prescribedWeightKg != null ? String(s.prescribedWeightKg) : "",
          prescribedDurationSec: s.prescribedDurationSec != null ? String(s.prescribedDurationSec) : "",
          restSec: String(s.restSec ?? 90),
          supersetGroupId: s.supersetGroupId,
          notes: s.notes ?? "",
        })),
      );
    } catch {
      Alert.alert("Load failed", "Could not load template exercises.");
    } finally {
      setLoadingSlots(false);
    }
  }

  async function onSave(data: TemplateEditorData) {
    if (!templateId) return;
    setSaving(true);
    try {
      await customFetch(`/api/workout/templates/${templateId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: data.name,
          category: data.category,
          estimatedDurationMin: data.estimatedDurationMin,
          notes: data.notes,
        }),
      });

      // Delete all original slots then re-insert current state.
      for (const slotId of originalSlotIdsRef.current) {
        await customFetch(`/api/workout/templates/${templateId}/exercises/${slotId}`, {
          method: "DELETE",
        });
      }

      for (let i = 0; i < data.slots.length; i++) {
        const slot = data.slots[i]!;
        await customFetch(`/api/workout/templates/${templateId}/exercises`, {
          method: "POST",
          body: JSON.stringify({
            exerciseId: slot.exerciseId,
            orderIndex: i,
            prescribedSets: slot.prescribedSets ? parseInt(slot.prescribedSets, 10) : null,
            prescribedReps: slot.prescribedReps ? parseInt(slot.prescribedReps, 10) : null,
            prescribedWeightKg: slot.prescribedWeightKg ? parseFloat(slot.prescribedWeightKg) : null,
            prescribedDurationSec: slot.prescribedDurationSec
              ? parseInt(slot.prescribedDurationSec, 10)
              : null,
            restSec: slot.restSec ? parseInt(slot.restSec, 10) : 90,
            supersetGroupId: slot.supersetGroupId,
            notes: slot.notes || null,
          }),
        });
      }

      router.back();
    } catch {
      Alert.alert("Save failed", "Could not save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate() {
    if (!templateId) return;
    Alert.alert("Duplicate template", "Create a copy of this template?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Duplicate",
        onPress: async () => {
          setDuplicating(true);
          try {
            await customFetch(`/api/workout/templates/${templateId}/duplicate`, { method: "POST" });
            router.back();
          } catch {
            Alert.alert("Failed", "Could not duplicate the template.");
          } finally {
            setDuplicating(false);
          }
        },
      },
    ]);
  }

  if (!templateId) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
          Template not found.
        </Text>
      </View>
    );
  }

  if (loadingSlots) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const duplicateBtn = (
    <TouchableOpacity
      onPress={handleDuplicate}
      disabled={duplicating}
      style={styles.dupBtn}
      hitSlop={8}
    >
      {duplicating ? (
        <ActivityIndicator size="small" color={colors.mutedForeground} />
      ) : (
        <Feather name="copy" size={19} color={colors.mutedForeground} />
      )}
    </TouchableOpacity>
  );

  return (
    <TemplateEditor
      title="Edit template"
      initialName={params.name ?? ""}
      initialCategory={params.category ?? "strength"}
      initialDurationMin={params.duration ? parseInt(params.duration, 10) : null}
      initialNotes={params.notes ?? null}
      initialSlots={initialSlots}
      onSave={onSave}
      isSaving={saving}
      rightAction={duplicateBtn}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  dupBtn: { padding: 4 },
});
