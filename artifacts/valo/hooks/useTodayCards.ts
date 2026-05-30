import { useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { useValoAuth } from "@/contexts/AuthContext";
import { trackEvent } from "@/services/telemetry";

export interface PrimaryAction {
  label: string;
  actionType: "start_checkin" | "open_goals" | "open_habits" | "open_voice" | "open_log" | "open_insights";
  payload: Record<string, unknown>;
}

export interface TodayCardData {
  hrv?: number | null;
  sleep?: number | null;
  rhr?: number | null;
  readiness?: string;
  avgHrv?: number | null;
  avgSleep?: number | null;
  goalName?: string;
  percent?: number;
  daysLeft?: number | null;
  habitName?: string;
  streakDays?: number;
  text?: string;
  message?: string;
  streak?: number;
}

export interface TodayCardResult {
  type: string;
  priority: number;
  data: TodayCardData;
  primaryAction: PrimaryAction;
  bonus?: boolean;
}

interface TodayCardsResponse {
  cards: TodayCardResult[];
  bonusCard: TodayCardResult | null;
}

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

export function useTodayCards() {
  const { getToken } = useValoAuth();
  const [serverCards, setServerCards] = useState<TodayCardResult[]>([]);
  const [bonusCard, setBonusCard] = useState<TodayCardResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const fetchCards = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    setIsLoading(true);
    setHasError(false);
    try {
      const res = await fetch(`${getApiBase()}/api/today/cards`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setHasError(true);
        return;
      }
      const json = (await res.json()) as TodayCardsResponse;
      const cards = json.cards ?? [];
      setServerCards(cards);
      setBonusCard(json.bonusCard ?? null);
      trackEvent("today.cards_fetched", { count: cards.length });
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [getToken]);

  useFocusEffect(
    useCallback(() => {
      void fetchCards();
    }, [fetchCards]),
  );

  return { serverCards, bonusCard, isLoading, hasError, refetchCards: fetchCards };
}
