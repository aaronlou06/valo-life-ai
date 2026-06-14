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
  /** Server-side session id once persisted; null while the session is local-only. */
  sessionId: number | null;
  /** Human-readable label shown in the slim bar and expanded panel. */
  name: string;
  /** ISO timestamp of when the session began — used to derive elapsed time. */
  startedAt: string;
  /** How the session was created, so later flows can branch on origin. */
  source: WorkoutSessionSource;
}

interface WorkoutCopilotContextType {
  /** True once persisted state has been read from storage (avoids first-frame flicker). */
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

  // Hydrate persisted state once on mount so an in-progress session and the
  // panel's open/closed preference survive an app restart.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [storedPanel, storedSession] = await Promise.all([
          AsyncStorage.getItem(PANEL_STATE_KEY),
          AsyncStorage.getItem(ACTIVE_SESSION_KEY),
        ]);
        if (cancelled) return;
        if (storedPanel === "minimized" || storedPanel === "expanded") {
          setPanelState(storedPanel);
        }
        if (storedSession) {
          const parsed = JSON.parse(storedSession) as ActiveWorkoutSession;
          if (parsed && typeof parsed.startedAt === "string" && typeof parsed.name === "string") {
            setActiveSession(parsed);
          }
        }
      } catch {
        // Corrupt or unavailable storage — start clean rather than crash.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist panel state after hydration (skip the initial pre-hydration write).
  const persistedPanel = useRef(false);
  useEffect(() => {
    if (!hydrated) return;
    if (!persistedPanel.current) {
      persistedPanel.current = true;
    }
    AsyncStorage.setItem(PANEL_STATE_KEY, panelState).catch(() => {});
  }, [panelState, hydrated]);

  // Persist the active session whenever it changes.
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
    (input: { name: string; source: WorkoutSessionSource; sessionId?: number | null }) => {
      setActiveSession({
        sessionId: input.sessionId ?? null,
        name: input.name,
        source: input.source,
        startedAt: new Date().toISOString(),
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
