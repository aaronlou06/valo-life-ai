import { useState, useEffect, useCallback, useRef } from "react";
import { Alert } from "react-native";
import vapi from "@/lib/vapi";

export type CallState = "idle" | "loading" | "active" | "ending";

export type TranscriptEntry = {
  role: "assistant" | "user";
  text: string;
};

export type DebriefExtraction = {
  mood_score: number | null;
  primary_emotion: string | null;
  energy_level: string | null;
  work_quality: string | null;
  work_stress: string | null;
  meaningful_connection: boolean | null;
  relationship_quality: string | null;
  sense_of_purpose: number | null;
  motivation_level: number | null;
  morning_routine_done: boolean | null;
  workout_felt: string | null;
  nutrition_quality: string | null;
  one_win: string | null;
  one_struggle: string | null;
  tomorrow_intention: string | null;
  valo_observation: string | null;
  flags: string[];
};

const REGULAR_ASSISTANT_ID = "1ac4c2fa-da5e-4528-8260-bc051717706e";

const FIRST_CALL_ASSISTANT_ID =
  process.env.EXPO_PUBLIC_VAPI_FIRST_CALL_ASSISTANT_ID ?? REGULAR_ASSISTANT_ID;

export function useVapiDebrief(
  userId: string,
  getToken: () => Promise<string | null>,
  firstCallCompleted: boolean
) {
  const [callState, setCallState] = useState<CallState>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isValoSpeaking, setIsValoSpeaking] = useState(false);
  const [debriefExtraction, setDebriefExtraction] =
    useState<DebriefExtraction | null>(null);

  const transcriptRef = useRef<TranscriptEntry[]>([]);

  useEffect(() => {
    const onCallStart = () => {
      setCallState("active");
      setIsValoSpeaking(false);
    };

    const onCallEnd = () => {
      setCallState("ending");
      setIsValoSpeaking(false);
      const finalTranscript = transcriptRef.current;

      setTimeout(async () => {
        try {
          const token = await getToken();
          const res = await fetch(
            `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/vapi/debrief`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ transcript: finalTranscript }),
            }
          );
          if (res.ok) {
            const data = await res.json();
            if (data.extraction) {
              const raw = data.extraction;
              setDebriefExtraction({
                mood_score: typeof raw.mood_score === "number" ? raw.mood_score : null,
                primary_emotion: typeof raw.primary_emotion === "string" ? raw.primary_emotion : null,
                energy_level: typeof raw.energy_level === "string" ? raw.energy_level : null,
                work_quality: typeof raw.work_quality === "string" ? raw.work_quality : null,
                work_stress: typeof raw.work_stress === "string" ? raw.work_stress : null,
                meaningful_connection: typeof raw.meaningful_connection === "boolean" ? raw.meaningful_connection : null,
                relationship_quality: typeof raw.relationship_quality === "string" ? raw.relationship_quality : null,
                sense_of_purpose: typeof raw.sense_of_purpose === "number" ? raw.sense_of_purpose : null,
                motivation_level: typeof raw.motivation_level === "number" ? raw.motivation_level : null,
                morning_routine_done: typeof raw.morning_routine_done === "boolean" ? raw.morning_routine_done : null,
                workout_felt: typeof raw.workout_felt === "string" ? raw.workout_felt : null,
                nutrition_quality: typeof raw.nutrition_quality === "string" ? raw.nutrition_quality : null,
                one_win: typeof raw.one_win === "string" ? raw.one_win : null,
                one_struggle: typeof raw.one_struggle === "string" ? raw.one_struggle : null,
                tomorrow_intention: typeof raw.tomorrow_intention === "string" ? raw.tomorrow_intention : null,
                valo_observation: typeof raw.valo_observation === "string" ? raw.valo_observation : null,
                flags: Array.isArray(raw.flags) ? raw.flags : [],
              });
            }
          }
        } catch (err) {
          console.error("Debrief process error:", err);
        } finally {
          setCallState("idle");
        }
      }, 1000);
    };

    const onSpeechStart = () => setIsValoSpeaking(true);
    const onSpeechEnd = () => setIsValoSpeaking(false);

    const onMessage = (message: any) => {
      if (
        message.type === "transcript" &&
        message.transcriptType === "final"
      ) {
        const entry: TranscriptEntry = {
          role: message.role as "assistant" | "user",
          text: message.transcript,
        };
        setTranscript((prev) => {
          const updated = [...prev, entry];
          transcriptRef.current = updated;
          return updated;
        });
      }
    };

    const onError = (error: any) => {
      console.error("Vapi error:", error);
      setCallState("idle");
      setIsValoSpeaking(false);
    };

    vapi.on("call-start", onCallStart);
    vapi.on("call-end", onCallEnd);
    vapi.on("speech-start", onSpeechStart);
    vapi.on("speech-end", onSpeechEnd);
    vapi.on("message", onMessage);
    vapi.on("error", onError);

    return () => {
      vapi.off("call-start", onCallStart);
      vapi.off("call-end", onCallEnd);
      vapi.off("speech-start", onSpeechStart);
      vapi.off("speech-end", onSpeechEnd);
      vapi.off("message", onMessage);
      vapi.off("error", onError);
    };
  }, [userId, getToken]);

  const startCall = useCallback(async () => {
    setCallState("loading");
    setTranscript([]);
    transcriptRef.current = [];
    setDebriefExtraction(null);
    setIsMuted(false);

    const assistantId = firstCallCompleted
      ? REGULAR_ASSISTANT_ID
      : FIRST_CALL_ASSISTANT_ID;

    const contextPath = firstCallCompleted
      ? `/api/vapi/context/${userId}`
      : `/api/vapi/first-call-context/${userId}`;

    try {
      const token = await getToken();
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}${contextPath}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) throw new Error(`Context fetch failed: ${res.status}`);
      const contextPayload = await res.json();
      await vapi.start(assistantId, {
        variableValues: contextPayload,
        metadata: { userId },
      });
    } catch (err: any) {
      console.error("Vapi start error:", err);
      setCallState("idle");
      Alert.alert(
        "Call failed",
        "Could not start the debrief. Please try again.",
        [{ text: "OK" }]
      );
    }
  }, [userId, getToken, firstCallCompleted]);

  const endCall = useCallback(() => vapi.stop(), []);

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    vapi.setMuted(next);
    setIsMuted(next);
  }, [isMuted]);

  const clearExtraction = useCallback(() => setDebriefExtraction(null), []);

  return {
    callState,
    transcript,
    startCall,
    endCall,
    isMuted,
    toggleMute,
    isValoSpeaking,
    debriefExtraction,
    clearExtraction,
  };
}
