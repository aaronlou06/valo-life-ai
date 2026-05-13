import { useState, useEffect, useCallback } from "react";
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

export function useVapiDebrief(userId: string) {
  const [callState, setCallState] = useState<CallState>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const onCallStart = () => setCallState("active");

    const onCallEnd = () => {
      setCallState("ending");
      setTimeout(async () => {
        try {
          const currentTranscript = transcript;
          await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/debrief/process`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, transcript: currentTranscript }),
          });
        } catch (err) {
          console.error("Debrief process error:", err);
        } finally {
          setCallState("idle");
        }
      }, 1000);
    };

    const onSpeechStart = () => {};

    const onMessage = (message: any) => {
      if (
        message.type === "transcript" &&
        message.transcriptType === "final"
      ) {
        setTranscript((prev) => [
          ...prev,
          { role: message.role as "assistant" | "user", text: message.transcript },
        ]);
      }
    };

    const onError = (error: any) => {
      console.error("Vapi error:", error);
      setCallState("idle");
    };

    vapi.on("call-start", onCallStart);
    vapi.on("call-end", onCallEnd);
    vapi.on("speech-start", onSpeechStart);
    vapi.on("message", onMessage);
    vapi.on("error", onError);

    return () => {
      vapi.off("call-start", onCallStart);
      vapi.off("call-end", onCallEnd);
      vapi.off("speech-start", onSpeechStart);
      vapi.off("message", onMessage);
      vapi.off("error", onError);
    };
  }, [userId, transcript]);

  const startCall = useCallback(async () => {
    setCallState("loading");
    setTranscript([]);
    try {
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/vapi/context/${userId}`
      );
      if (!res.ok) throw new Error(`Context fetch failed: ${res.status}`);
      const contextPayload = await res.json();

      await vapi.start(ASSISTANT_ID, {
        variableValues: contextPayload,
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
  }, [userId]);

  const endCall = useCallback(() => {
    vapi.stop();
  }, []);

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    vapi.setMuted(next);
    setIsMuted(next);
  }, [isMuted]);

  return { callState, transcript, startCall, endCall, isMuted, toggleMute };
}
