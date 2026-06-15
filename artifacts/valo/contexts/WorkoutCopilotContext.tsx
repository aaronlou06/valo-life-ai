import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type CopilotPanelState = "minimized" | "expanded";

export type WorkoutSessionSource = "start" | "template" | "program" | "import";

export interface ActiveWorkoutSession {
  sessionId: number | null;
  name: string;
  startedAt: string;
  source: WorkoutSessionSource;
  templateId?: number | null;
}

interface WorkoutCopilotContextType {
  hydrated: boolean;
  panelState: CopilotPanelState;
  expand: () => void;
  minimize: () => void;
  togglePanel: () => void;
  activeSession: ActiveWorkoutSession | null;
  startSession: (input: {
    name: string;
    source: WorkoutSessionSource;
    sessionId?: number | null;
    templateId?: number | null;
  }) => void;
  endSession: () => void;
}

const PANEL_STATE_KEY = "valo:copilot_panel_state";
const ACTIVE_SESSION_KEY = "valo:copilot_active_session";

const WorkoutCopilotContext = createContext<WorkoutCopilotContextType>({
  hydrated: false,
  panelState: "minimized",
  expand: () => {},
  minimize: () => {},
  togglePanel: () => {},
  activeSession: null,
  startSession: () => {},
  endSession: () => {},
});

export function WorkoutCopilotProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [panelState, setPanelState] = useState<CopilotPanelState>("minimized");
  const [activeSession, setActiveSession] = useState<ActiveWorkoutSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [storedPanel, storedSession] = await Promise.all([
          AsyncStorage.getItem(PANEL_STATE_KEY),
          AsyncStorage.getItem(ACTIVE_SESSION_KEY),
        ]);
        if (cancelled) return;
        let restoredSession: ActiveWorkoutSession | null = null;
        if (storedSession) {
          const parsed = JSON.parse(storedSession) as ActiveWorkoutSession;
          if (parsed && typeof parsed.startedAt === "string" && typeof parsed.name === "string") {
            restoredSession = parsed;
            setActiveSession(parsed);
          }
        }
        // Only restore "expanded" when there is also an active session to show.
        // If the app was killed while the sheet was open but no workout was in
        // progress, starting back up in "expanded" would auto-open the sheet
        // unexpectedly. Always start minimized in that case.
        if (storedPanel === "expanded" && restoredSession) {
          setPanelState("expanded");
        }
      } catch {
        // Corrupt or unavailable storage — start clean.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistedPanel = useRef(false);
  useEffect(() => {
    if (!hydrated) return;
    if (!persistedPanel.current) {
      persistedPanel.current = true;
    }
    AsyncStorage.setItem(PANEL_STATE_KEY, panelState).catch(() => {});
  }, [panelState, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (activeSession) {
      AsyncStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(activeSession)).catch(() => {});
    } else {
      AsyncStorage.removeItem(ACTIVE_SESSION_KEY).catch(() => {});
    }
  }, [activeSession, hydrated]);

  const expand = useCallback(() => setPanelState("expanded"), []);
  const minimize = useCallback(() => setPanelState("minimized"), []);
  const togglePanel = useCallback(
    () => setPanelState((s) => (s === "expanded" ? "minimized" : "expanded")),
    [],
  );

  const startSession = useCallback(
    (input: {
      name: string;
      source: WorkoutSessionSource;
      sessionId?: number | null;
      templateId?: number | null;
    }) => {
      setActiveSession({
        sessionId: input.sessionId ?? null,
        name: input.name,
        source: input.source,
        startedAt: new Date().toISOString(),
        templateId: input.templateId ?? null,
      });
    },
    [],
  );

  const endSession = useCallback(() => setActiveSession(null), []);

  return (
    <WorkoutCopilotContext.Provider
      value={{
        hydrated,
        panelState,
        expand,
        minimize,
        togglePanel,
        activeSession,
        startSession,
        endSession,
      }}
    >
      {children}
    </WorkoutCopilotContext.Provider>
  );
}

export function useWorkoutCopilot() {
  return useContext(WorkoutCopilotContext);
}
