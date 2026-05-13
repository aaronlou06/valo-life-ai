import { useState, useEffect, useCallback, useRef } from "react";
import { Alert } from "react-native";
import vapi from "@/lib/vapi";

export type CallState = "idle" | "loading" | "active" | "ending";

export type TranscriptEntry = {
  role: "assistant" | "user";
  text: string;
};

const ASSISTANT_ID =
  process.env.EXPO_PUBLIC_VAPI_ASSISTANT_ID ??
  "1f6a73ec-abef-4181-ac53-31b6a037a613";

function extractSummaryPoints(entries: TranscriptEntry[]): string[] {
  const valosLines = entries
    .filter((t) => t.role === "assistant" && t.text.trim().length > 50)
    .map((t) => t.text.trim());
  const seen = new Set<string>();
  const unique = valosLines.filter((t) => {
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });
  return unique.slice(-3);
}

export function useVapiDebrief(
  userId: string,
  getToken: () => Promise<string | null>
) {
  const [callState, setCallState] = useState<CallState>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isValoSpeaking, setIsValoSpeaking] = useState(false);
  const [summary, setSummary] = useState<string[]>([]);

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
          await fetch(
            `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/debrief/process`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ userId, transcript: finalTranscript }),
            }
          );
        } catch (err) {
          console.error("Debrief process error:", err);
        } finally {
          setSummary(extractSummaryPoints(transcriptRef.current));
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
    setSummary([]);
    setIsMuted(false);

    try {
      const token = await getToken();
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/vapi/context/${userId}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) throw new Error(`Context fetch failed: ${res.status}`);
      const contextPayload = await res.json();
      await vapi.start(ASSISTANT_ID, { variableValues: contextPayload });
    } catch (err: any) {
      console.error("Vapi start error:", err);
      setCallState("idle");
      Alert.alert(
        "Call failed",
        "Could not start the debrief. Please try again.",
        [{ text: "OK" }]
      );
    }
  }, [userId, getToken]);

  const endCall = useCallback(() => vapi.stop(), []);

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    vapi.setMuted(next);
    setIsMuted(next);
  }, [isMuted]);

  const clearSummary = useCallback(() => setSummary([]), []);

  return {
    callState,
    transcript,
    startCall,
    endCall,
    isMuted,
    toggleMute,
    isValoSpeaking,
    summary,
    clearSummary,
  };
}
