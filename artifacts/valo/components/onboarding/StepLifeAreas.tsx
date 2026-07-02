import React, { useState, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import * as Haptics from "expo-haptics";

const AREAS = [
  "Health & Fitness",
  "Mental Wellbeing",
  "Career",
  "Relationships",
  "Family",
  "Money",
  "Personal Growth",
  "Faith",
] as const;

type Area = (typeof AREAS)[number];

const SUB_CHIPS: Record<Area, string[]> = {
  "Health & Fitness": ["More Energy", "Better Sleep", "Build Strength", "Lose Weight", "Better Nutrition"],
  "Mental Wellbeing": ["More Focus", "Less Stress", "More Calm", "More Confidence", "Better Mood"],
  "Career": ["Better Performance", "Career Growth", "More Clarity", "Work-Life Balance", "Build Discipline"],
  "Relationships": ["Stronger Connections", "More Quality Time", "Better Communication", "Less Isolation"],
  "Family": ["More Presence", "Better Routines", "Stronger Bonds", "Support Family"],
  "Money": ["Financial Stability", "Save More", "Reduce Debt", "Grow Wealth", "Better Budgeting"],
  "Personal Growth": ["Learn New Skills", "Read More", "Broaden Perspective", "Build Habits"],
  "Faith": ["Spiritual Practice", "Inner Peace", "Community Connection", "Deeper Reflection"],
};

const MAX_AREAS = 3;
const MAX_POOL = 10;

function deriveTopGoal(areas: Area[], subchips: string[]): string {
  if (areas.length === 0) return "";
  const areaStr = areas
    .map((a) => a.toLowerCase())
    .join(areas.length > 1 ? " and " : "");
  const focus = subchips[0] ? `, with a focus on ${subchips[0].toLowerCase()}` : "";
  return `Improve ${areaStr}${focus}`;
}

interface Props {
  onContinue: (data: Record<string, unknown>) => void;
  initialValue?: Record<string, unknown>;
}

export default function StepLifeAreas({ onContinue, initialValue }: Props) {
  const colors = useColors();
  const [selectedAreas, setSelectedAreas] = useState<Area[]>(() => {
    const raw = initialValue?.lifePriorities;
    if (typeof raw === "string" && raw.length > 0) {
      return raw.split(",").filter((a): a is Area => (AREAS as readonly string[]).includes(a));
    }
    return [];
  });
  const [selectedSubs, setSelectedSubs] = useState<string[]>(() => {
    const raw = initialValue?.userWantsMore;
    if (typeof raw === "string" && raw.length > 0) {
      return raw.split(",").filter((s) => s.length > 0);
    }
    return [];
  });

  const pooledChips = useMemo(() => {
    const seen = new Set<string>();
    const chips: string[] = [];
    for (const area of selectedAreas) {
      for (const chip of SUB_CHIPS[area]) {
        if (!seen.has(chip) && chips.length < MAX_POOL) {
          seen.add(chip);
          chips.push(chip);
        }
      }
    }
    return chips;
  }, [selectedAreas]);

  // When areas change, prune any sub-chips that are no longer in the pool
  const activeSubs = selectedSubs.filter((s) => pooledChips.includes(s));

  const toggleArea = (area: Area) => {
    void Haptics.selectionAsync();
    if (selectedAreas.includes(area)) {
      setSelectedAreas((prev) => prev.filter((a) => a !== area));
      // Pruning happens via activeSubs derivation above
    } else if (selectedAreas.length < MAX_AREAS) {
      setSelectedAreas((prev) => [...prev, area]);
    }
  };

  const toggleSub = (chip: string) => {
    void Haptics.selectionAsync();
    setSelectedSubs((prev) =>
      prev.includes(chip) ? prev.filter((s) => s !== chip) : [...prev, chip],
    );
  };

  const handleContinue = () => {
    onContinue({
      lifePriorities: selectedAreas.join(","),
      userWantsMore: activeSubs.join(","),
      topGoal: deriveTopGoal(selectedAreas, activeSubs),
      topGoalProvenance: "assumed",
    });
  };

  const canContinue = selectedAreas.length > 0;

  return (
    <View style={styles.container}>
      <Text style={[styles.valoLabel, { color: colors.primary, fontFamily: "Inter_500Medium" }]}>
        VALO
      </Text>

      <View style={styles.headingBlock}>
        <Text style={[styles.heading, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
          What are you working on?
        </Text>
        <Text style={[styles.subtext, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
          Pick up to {MAX_AREAS} areas that matter most right now.
        </Text>
      </View>

      <View style={styles.chipGrid}>
        {AREAS.map((area) => {
          const selected = selectedAreas.includes(area);
          const atMax = selectedAreas.length >= MAX_AREAS && !selected;
          return (
            <TouchableOpacity
              key={area}
              onPress={() => toggleArea(area)}
              disabled={atMax}
              activeOpacity={0.7}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? colors.primary : colors.card,
                  borderColor: selected ? colors.primary : colors.border,
                  opacity: atMax ? 0.38 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color: selected ? colors.primaryForeground : colors.foreground,
                    fontFamily: selected ? "Inter_600SemiBold" : "Inter_400Regular",
                  },
                ]}
              >
                {area}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {pooledChips.length > 0 && (
        <View style={styles.subSection}>
          <Text style={[styles.subLabel, { color: colors.mutedForeground, fontFamily: "Inter_500Medium" }]}>
            What would better look like?
          </Text>
          <View style={styles.chipGrid}>
            {pooledChips.map((chip) => {
              const selected = activeSubs.includes(chip);
              return (
                <TouchableOpacity
                  key={chip}
                  onPress={() => toggleSub(chip)}
                  activeOpacity={0.7}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected ? colors.primary : colors.card,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: selected ? colors.primaryForeground : colors.foreground,
                        fontFamily: selected ? "Inter_600SemiBold" : "Inter_400Regular",
                      },
                    ]}
                  >
                    {chip}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[
          styles.continueBtn,
          { backgroundColor: canContinue ? colors.primary : colors.muted },
        ]}
        onPress={handleContinue}
        disabled={!canContinue}
        activeOpacity={0.85}
      >
        <Text
          style={[
            styles.continueBtnText,
            {
              color: canContinue ? colors.primaryForeground : colors.mutedForeground,
              fontFamily: "Inter_600SemiBold",
            },
          ]}
        >
          Continue
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 24 },
  valoLabel: { fontSize: 11, letterSpacing: 1.5 },
  headingBlock: { gap: 8 },
  heading: { fontSize: 22, lineHeight: 30 },
  subtext: { fontSize: 14, lineHeight: 22 },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  chipText: { fontSize: 14 },
  subSection: { gap: 12 },
  subLabel: { fontSize: 13 },
  continueBtn: { height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 4 },
  continueBtnText: { fontSize: 16 },
});
