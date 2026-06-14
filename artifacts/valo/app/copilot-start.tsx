import React from "react";
import { useRouter } from "expo-router";
import { CopilotPlaceholder } from "@/components/CopilotPlaceholder";
import { useWorkoutCopilot } from "@/contexts/WorkoutCopilotContext";

export default function CopilotStartScreen() {
  const router = useRouter();
  const { activeSession, startSession } = useWorkoutCopilot();

  return (
    <CopilotPlaceholder
      title="Start a workout"
      icon="play"
      heading={activeSession ? "Workout in progress" : "Start a workout"}
      sub={
        activeSession
          ? "You already have an active session. The full logging flow is coming soon."
          : "The full workout logging flow is coming soon. For now you can begin a session to keep it tracked across the app."
      }
      actionLabel={activeSession ? "Back" : "Begin session"}
      onAction={() => {
        if (!activeSession) {
          startSession({ name: "Workout", source: "start" });
        }
        router.back();
      }}
    />
  );
}
