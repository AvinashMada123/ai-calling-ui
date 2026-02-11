"use client";

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { CallRecord, CallStatus } from "@/types/call";
import { useAuthContext } from "./auth-context";
import {
  getCalls as firestoreGetCalls,
  addCall as firestoreAddCall,
  updateCall as firestoreUpdateCall,
} from "@/lib/firestore/calls";

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
  const { userProfile } = useAuthContext();
  const orgId = userProfile?.orgId ?? null;

  const [state, baseDispatch] = useReducer(callsReducer, {
    calls: [],
    activeCall: null,
    loaded: false,
  });

  // Load calls from Firestore when authenticated
  useEffect(() => {
    if (!orgId) {
      baseDispatch({ type: "SET_CALLS", payload: [] });
      return;
    }
    let cancelled = false;
    firestoreGetCalls(orgId)
      .then((calls) => {
        if (!cancelled) {
          baseDispatch({ type: "SET_CALLS", payload: calls });
        }
      })
      .catch((err) => {
        console.error("Failed to load calls from Firestore:", err);
        if (!cancelled) {
          baseDispatch({ type: "SET_CALLS", payload: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // Enhanced dispatch that also persists to Firestore
  const dispatch: React.Dispatch<CallsAction> = useCallback(
    (action: CallsAction) => {
      baseDispatch(action);

      if (!orgId) return;

      switch (action.type) {
        case "ADD_CALL": {
          firestoreAddCall(orgId, action.payload).catch((err) =>
            console.error("Failed to add call to Firestore:", err)
          );
          break;
        }
        case "UPDATE_CALL": {
          firestoreUpdateCall(orgId, action.payload.id, action.payload.updates).catch((err) =>
            console.error("Failed to update call in Firestore:", err)
          );
          break;
        }
        default:
          break;
      }
    },
    [orgId]
  );

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
