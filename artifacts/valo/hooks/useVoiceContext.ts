import { useQuery } from "@tanstack/react-query";
import { useValoAuth } from "@/contexts/AuthContext";

export type VoiceContextData = {
  user_id: string;
  user_name: string;
  user_priorities: string | null;
  date_today: string;
  sleep_hours: number | null;
  sleep_score: number | null;
  sleep_avg_30d: number | null;
  sleep_avg_14d: number | null;
  hrv_today: number | null;
  hrv_avg: number | null;
  rhr_today: number | null;
  steps_today: number | null;
  active_calories: number | null;
  workout_logged: "yes" | "no";
  workout_type: string | null;
  workout_duration: number | null;
  workout_hr_peak: number | null;
  recovery_score: number | null;
  stress_score: number | null;
  readiness_score: number | null;
  mood_avg_today: number | null;
  mood_count_today: number;
  mood_avg_14d: number | null;
  workout_consistency_14d: number;
  habits_completed_today: string;
  habits_pending_today: string;
  habits_summary: string;
  top_goal: string | null;
  top_goal_progress: number | null;
  goals_summary: string;
  meeting_count: number;
  workday_hours: number;
  calendar_stress: "yes" | "no";
  latest_pattern: string | null;
};

export function useVoiceContext(userId: string) {
  const { getToken } = useValoAuth();

  return useQuery({
    queryKey: ["voice-context", userId],
    queryFn: async (): Promise<VoiceContextData> => {
      const token = await getToken();
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/vapi/context/${userId}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) throw new Error("Failed to fetch voice context");
      return res.json();
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}
