// State management with React Context for OpenCode Session Monitor

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useMemo,
  ReactNode,
  useRef,
} from "react";
import {
  AppState,
  Server,
  Session,
  ViewMode,
  GroupMode,
  SortMode,
  AppError,
  StateAction,
} from "./types";
import { connectionManager } from "./connection-manager";

// ---------------------------------------------------------------------------
// State Reducer (Optimized for Batching)
// ---------------------------------------------------------------------------

function stateReducer(state: AppState, action: StateAction): AppState {
  switch (action.type) {
    case "BATCH": {
      return action.actions.reduce(stateReducer, state);
    }

    case "SET_SERVERS":
      return { ...state, servers: action.servers };

    case "ADD_SERVER":
    case "UPDATE_SERVER": {
      const updatedServers = new Map(state.servers);
      updatedServers.set(action.server.id, action.server);
      return { ...state, servers: updatedServers };
    }

    case "REMOVE_SERVER": {
      const remainingServers = new Map(state.servers);
      remainingServers.delete(action.serverId);
      return { ...state, servers: remainingServers };
    }

    case "SET_SESSIONS":
      return { ...state, sessions: action.sessions };

    case "ADD_SESSION":
    case "UPDATE_SESSION": {
      const updatedSessions = new Map(state.sessions);
      updatedSessions.set(action.session.id, action.session);
      return { ...state, sessions: updatedSessions };
    }

    case "REMOVE_SESSION": {
      const remainingSessions = new Map(state.sessions);
      remainingSessions.delete(action.sessionId);
      const selectedSessionId =
        state.selectedSessionId === action.sessionId
          ? undefined
          : state.selectedSessionId;
      return {
        ...state,
        sessions: remainingSessions,
        selectedSessionId,
      };
    }

    case "SELECT_SESSION":
      return { ...state, selectedSessionId: action.sessionId };

    case "SET_VIEW":
      return { ...state, currentView: action.view };

    case "SET_GROUP_BY":
      return { ...state, groupBy: action.groupBy };

    case "SET_SORT_BY":
      return { ...state, sortBy: action.sortBy };

    case "TOGGLE_SHOW_ONLY_ACTIVE":
      return { ...state, showOnlyActive: !state.showOnlyActive };

    case "TOGGLE_GROUP_EXPANDED": {
      const expandedGroups = new Set(state.expandedGroups);
      if (expandedGroups.has(action.groupId)) {
        expandedGroups.delete(action.groupId);
      } else {
        expandedGroups.add(action.groupId);
      }
      return { ...state, expandedGroups };
    }

    case "SET_NOTIFICATIONS":
      return {
        ...state,
        notifications: {
          ...state.notifications,
          enabled: action.notifications.enabled,
        },
      };

    case "ADD_NOTIFICATION": {
      const newLastNotified = new Map(state.notifications.lastNotified);
      newLastNotified.set(action.sessionId, Date.now());
      return {
        ...state,
        notifications: {
          ...state.notifications,
          lastNotified: newLastNotified,
        },
      };
    }

    case "CLEAR_NOTIFICATION": {
      const clearedLastNotified = new Map(state.notifications.lastNotified);
      clearedLastNotified.delete(action.sessionId);
      return {
        ...state,
        notifications: {
          ...state.notifications,
          lastNotified: clearedLastNotified,
        },
      };
    }

    case "SET_ERROR":
      return { ...state, error: action.error };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Initial State
// ---------------------------------------------------------------------------

const initialState: AppState = {
  servers: new Map(),
  sessions: new Map(),
  selectedSessionId: undefined,
  currentView: "list",
  groupBy: "project",
  sortBy: "activity",
  showOnlyActive: true,
  expandedGroups: new Set(),
  notifications: {
    enabled: true,
    lastNotified: new Map(),
    pendingPermissions: new Set(),
  },
  error: null,
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<StateAction>;
  // Helper functions
  selectSession: (sessionId?: string) => void;
  setView: (view: ViewMode) => void;
  setGroupBy: (groupBy: GroupMode) => void;
  setSortBy: (sortBy: SortMode) => void;
  toggleShowOnlyActive: () => void;
  toggleGroupExpanded: (groupId: string) => void;
  clearError: () => void;
  // Session interaction functions
  sendMessage: (sessionId: string, message: string) => Promise<void>;
  abortSession: (sessionId: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

// ---------------------------------------------------------------------------
// Provider Component
// ---------------------------------------------------------------------------

interface AppStateProviderProps {
  children: ReactNode;
}

export function AppStateProvider({ children }: AppStateProviderProps) {
  const [state, dispatch] = useReducer(stateReducer, initialState);

  // Implement action batching to prevent TUI flickering from high-frequency updates
  const actionQueue = useRef<StateAction[]>([]);
  const batchTimer = useRef<NodeJS.Timeout | null>(null);

  const batchedDispatch = (action: StateAction) => {
    actionQueue.current.push(action);

    if (!batchTimer.current) {
      batchTimer.current = setTimeout(() => {
        batchTimer.current = null;
        if (actionQueue.current.length > 0) {
          const batch = [...actionQueue.current];
          actionQueue.current = [];
          dispatch({ type: "BATCH", actions: batch });
        }
      }, 50); // 50ms batching window
    }
  };

  // Helper functions
  const selectSession = (sessionId?: string) => {
    dispatch({ type: "SELECT_SESSION", sessionId });
  };

  const setView = (view: ViewMode) => {
    dispatch({ type: "SET_VIEW", view });
  };

  const setGroupBy = (groupBy: GroupMode) => {
    dispatch({ type: "SET_GROUP_BY", groupBy });
  };

  const setSortBy = (sortBy: SortMode) => {
    dispatch({ type: "SET_SORT_BY", sortBy });
  };

  const toggleShowOnlyActive = () => {
    dispatch({ type: "TOGGLE_SHOW_ONLY_ACTIVE" });
  };

  const toggleGroupExpanded = (groupId: string) => {
    dispatch({ type: "TOGGLE_GROUP_EXPANDED", groupId });
  };

  const clearError = () => {
    dispatch({ type: "SET_ERROR", error: null });
  };

  // Session interaction functions
  const sendMessage = async (
    sessionId: string,
    message: string,
  ): Promise<void> => {
    try {
      const result = await connectionManager.sendMessage(sessionId, message);
      if (!result.success) {
        throw new Error(result.error?.message || "Failed to send message");
      }
    } catch (error) {
      const appError: AppError = {
        code: "SESSION_INTERACTION_ERROR",
        message: `Failed to send message: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: Date.now(),
        recoverable: true,
      };
      dispatch({ type: "SET_ERROR", error: appError });
    }
  };

  const abortSession = async (sessionId: string): Promise<void> => {
    try {
      const result = await connectionManager.abortSession(sessionId);
      if (!result.success) {
        throw new Error(result.error?.message || "Failed to abort session");
      }
    } catch (error) {
      const appError: AppError = {
        code: "SESSION_INTERACTION_ERROR",
        message: `Failed to abort session: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: Date.now(),
        recoverable: true,
      };
      dispatch({ type: "SET_ERROR", error: appError });
    }
  };

  // Fetch session details when a session is selected
  useEffect(() => {
    if (state.selectedSessionId && state.currentView === "session") {
      connectionManager
        .getSessionDetails(state.selectedSessionId)
        .then((result) => {
          if (!result.success) {
            dispatch({ type: "SET_ERROR", error: result.error! });
          }
        });
    }
  }, [state.selectedSessionId, state.currentView]);

  // Set up connection manager event listeners
  useEffect(() => {
    const handleServerDiscovered = (server: Server) => {
      batchedDispatch({ type: "ADD_SERVER", server });
    };

    const handleServerUpdated = (server: Server) => {
      batchedDispatch({ type: "UPDATE_SERVER", server });
    };

    const handleServerRemoved = (serverId: string) => {
      batchedDispatch({ type: "REMOVE_SERVER", serverId });
    };

    const handleSessionAdded = (session: Session) => {
      batchedDispatch({ type: "ADD_SESSION", session });
    };

    const handleSessionUpdated = (session: Session) => {
      batchedDispatch({ type: "UPDATE_SESSION", session });
    };

    const handleSessionRemoved = (sessionId: string) => {
      batchedDispatch({ type: "REMOVE_SESSION", sessionId });
    };

    const handleBatchUpdate = (actions: StateAction[]) => {
      batchedDispatch({ type: "BATCH", actions });
    };

    const handleError = (error: AppError) => {
      batchedDispatch({ type: "SET_ERROR", error });
    };

    // Add event listeners
    connectionManager.on("server_discovered", handleServerDiscovered);
    connectionManager.on("server_updated", handleServerUpdated);
    connectionManager.on("server_removed", handleServerRemoved);
    connectionManager.on("session_added", handleSessionAdded);
    connectionManager.on("session_updated", handleSessionUpdated);
    connectionManager.on("session_removed", handleSessionRemoved);
    connectionManager.on("batch_update", handleBatchUpdate);
    connectionManager.on("error", handleError);

    // Start connection manager
    connectionManager.start().then((result) => {
      if (!result.success) {
        dispatch({
          type: "SET_ERROR",
          error: result.error || {
            code: "CONFIGURATION_ERROR",
            message: "Failed to start connection manager",
            timestamp: Date.now(),
            recoverable: true,
          },
        });
      }
    });

    // Cleanup
    return () => {
      connectionManager.off("server_discovered", handleServerDiscovered);
      connectionManager.off("server_updated", handleServerUpdated);
      connectionManager.off("server_removed", handleServerRemoved);
      connectionManager.off("session_added", handleSessionAdded);
      connectionManager.off("session_updated", handleSessionUpdated);
      connectionManager.off("session_removed", handleSessionRemoved);
      connectionManager.off("batch_update", handleBatchUpdate);
      connectionManager.off("error", handleError);

      connectionManager.stop();
    };
  }, []);

  const contextValue: AppContextType = {
    state,
    dispatch,
    selectSession,
    setView,
    setGroupBy,
    setSortBy,
    toggleShowOnlyActive,
    toggleGroupExpanded,
    clearError,
    sendMessage,
    abortSession,
  };

  return (
    <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook for using the context
// ---------------------------------------------------------------------------

export function useAppState(): AppContextType {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppState must be used within an AppStateProvider");
  }
  return context;
}

// ---------------------------------------------------------------------------
// Selector hooks for specific data (Granular to prevent over-subscription)
// ---------------------------------------------------------------------------

export function useServers(): Server[] {
  const context = useContext(AppContext);
  if (!context)
    throw new Error("useAppState must be used within an AppStateProvider");
  return useMemo(
    () => Array.from(context.state.servers.values()),
    [context.state.servers],
  );
}

export function useSessions(): Session[] {
  const context = useContext(AppContext);
  if (!context)
    throw new Error("useAppState must be used within an AppStateProvider");
  return useMemo(
    () => Array.from(context.state.sessions.values()),
    [context.state.sessions],
  );
}

export function useActiveSessions(): Session[] {
  const sessions = useSessions();
  return useMemo(
    () =>
      sessions.filter(
        (session) =>
          !["completed", "aborted", "error"].includes(session.status),
      ),
    [sessions],
  );
}

export function useSelectedSessionId(): string | undefined {
  const context = useContext(AppContext);
  if (!context)
    throw new Error("useAppState must be used within an AppStateProvider");
  return context.state.selectedSessionId;
}

export function useSelectedSession(): Session | undefined {
  const context = useContext(AppContext);
  const sessionId = useSelectedSessionId();
  if (!context)
    throw new Error("useAppState must be used within an AppStateProvider");
  return useMemo(
    () => (sessionId ? context.state.sessions.get(sessionId) : undefined),
    [context.state.sessions, sessionId],
  );
}

export function useCurrentView(): ViewMode {
  const context = useContext(AppContext);
  if (!context)
    throw new Error("useAppState must be used within an AppStateProvider");
  return context.state.currentView;
}

export function useGroupingAndSorting() {
  const context = useContext(AppContext);
  if (!context)
    throw new Error("useAppState must be used within an AppStateProvider");
  return useMemo(
    () => ({
      groupBy: context.state.groupBy,
      sortBy: context.state.sortBy,
      showOnlyActive: context.state.showOnlyActive,
      expandedGroups: context.state.expandedGroups,
    }),
    [
      context.state.groupBy,
      context.state.sortBy,
      context.state.showOnlyActive,
      context.state.expandedGroups,
    ],
  );
}

export function useAppError(): AppError | null | undefined {
  const context = useContext(AppContext);
  if (!context)
    throw new Error("useAppState must be used within an AppStateProvider");
  return context.state.error;
}

export function useServerCount(): number {
  const context = useContext(AppContext);
  if (!context)
    throw new Error("useAppState must be used within an AppStateProvider");
  return context.state.servers.size;
}

export function useSessionCount(): number {
  const context = useContext(AppContext);
  if (!context)
    throw new Error("useAppState must be used within an AppStateProvider");
  return context.state.sessions.size;
}

export function useActiveSessionCount(): number {
  const activeSessions = useActiveSessions();
  return activeSessions.length;
}
