import React, { useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { customFetch } from "@workspace/api-client-react";
import { TemplateEditor, type TemplateEditorData } from "@/components/TemplateEditor";

type SavedTemplate = { id: number; name: string };

export default function CopilotCreateScreen() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function onSave(data: TemplateEditorData) {
    setSaving(true);
    try {
      const tpl = await customFetch<SavedTemplate>("/api/workout/templates", {
        method: "POST",
        body: JSON.stringify({
          name: data.name,
          category: data.category,
          estimatedDurationMin: data.estimatedDurationMin,
          notes: data.notes,
        }),
      });

      for (let i = 0; i < data.slots.length; i++) {
        const slot = data.slots[i]!;
        await customFetch(`/api/workout/templates/${tpl.id}/exercises`, {
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
      Alert.alert("Save failed", "Could not save the template. Please check your connection.");
    } finally {
      setSaving(false);
    }
  }

  return <TemplateEditor title="New template" onSave={onSave} isSaving={saving} />;
}
