"use client";

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  type ReactNode,
} from "react";
import type { CallRecord, CallStatus } from "@/types/call";
import { getStorageItem, setStorageItem } from "@/lib/storage";

const STORAGE_KEY = "wavelength_calls";

interface CallsState {
  calls: CallRecord[];
  activeCall: CallRecord | null;
  loaded: boolean;
}

type CallsAction =
  | { type: "SET_CALLS"; payload: CallRecord[] }
  | { type: "ADD_CALL"; payload: CallRecord }
  | { type: "UPDATE_CALL"; payload: { id: string; updates: Partial<CallRecord> } }
  | { type: "SET_ACTIVE_CALL"; payload: CallRecord }
  | { type: "CLEAR_ACTIVE_CALL" };

function callsReducer(state: CallsState, action: CallsAction): CallsState {
  switch (action.type) {
    case "SET_CALLS":
      return { ...state, calls: action.payload, loaded: true };
    case "ADD_CALL":
      return {
        ...state,
        calls: [action.payload, ...state.calls],
      };
    case "UPDATE_CALL": {
      const updated = state.calls.map((c) =>
        c.id === action.payload.id ? { ...c, ...action.payload.updates } : c
      );
      const activeUpdated =
        state.activeCall?.id === action.payload.id
          ? { ...state.activeCall, ...action.payload.updates }
          : state.activeCall;
      return { ...state, calls: updated, activeCall: activeUpdated };
    }
    case "SET_ACTIVE_CALL":
      return { ...state, activeCall: action.payload };
    case "CLEAR_ACTIVE_CALL":
      return { ...state, activeCall: null };
    default:
      return state;
  }
}

const CallsContext = createContext<{
  state: CallsState;
  dispatch: React.Dispatch<CallsAction>;
} | null>(null);

export function CallsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(callsReducer, {
    calls: [],
    activeCall: null,
    loaded: false,
  });

  useEffect(() => {
    const stored = getStorageItem<CallRecord[]>(STORAGE_KEY, []);
    dispatch({ type: "SET_CALLS", payload: stored });
  }, []);

  useEffect(() => {
    if (state.loaded) {
      setStorageItem(STORAGE_KEY, state.calls);
    }
  }, [state.calls, state.loaded]);

  return (
    <CallsContext.Provider value={{ state, dispatch }}>
      {children}
    </CallsContext.Provider>
  );
}

export function useCallsContext() {
  const ctx = useContext(CallsContext);
  if (!ctx) throw new Error("useCallsContext must be within CallsProvider");
  return ctx;
}

// Re-export CallStatus for convenience
export type { CallStatus };
