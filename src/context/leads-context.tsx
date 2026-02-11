"use client";

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { Lead, LeadFilters } from "@/types/lead";
import { generateId } from "@/lib/utils";
import { useAuthContext } from "./auth-context";
import {
  getLeads as firestoreGetLeads,
  addLead as firestoreAddLead,
  addLeadsBulk as firestoreAddLeadsBulk,
  updateLead as firestoreUpdateLead,
  deleteLeads as firestoreDeleteLeads,
  incrementCallCount as firestoreIncrementCallCount,
} from "@/lib/firestore/leads";

interface LeadsState {
  leads: Lead[];
  filters: LeadFilters;
  selectedIds: string[];
  loaded: boolean;
}

type LeadsAction =
  | { type: "SET_LEADS"; payload: Lead[] }
  | { type: "ADD_LEAD"; payload: Omit<Lead, "createdAt" | "updatedAt" | "callCount" | "status"> }
  | { type: "ADD_LEADS_BULK"; payload: { leads: Partial<Lead>[]; source: Lead["source"] } }
  | { type: "UPDATE_LEAD"; payload: { id: string; updates: Partial<Lead> } }
  | { type: "DELETE_LEADS"; payload: string[] }
  | { type: "SET_FILTERS"; payload: Partial<LeadFilters> }
  | { type: "TOGGLE_SELECT"; payload: string }
  | { type: "SELECT_ALL"; payload: string[] }
  | { type: "DESELECT_ALL" }
  | { type: "INCREMENT_CALL_COUNT"; payload: string };

const initialFilters: LeadFilters = {
  search: "",
  status: "all",
  source: "all",
};

function leadsReducer(state: LeadsState, action: LeadsAction): LeadsState {
  switch (action.type) {
    case "SET_LEADS":
      return { ...state, leads: action.payload, loaded: true };
    case "ADD_LEAD": {
      const now = new Date().toISOString();
      const newLead: Lead = {
        ...action.payload,
        callCount: 0,
        status: "new",
        createdAt: now,
        updatedAt: now,
      };
      return { ...state, leads: [newLead, ...state.leads] };
    }
    case "ADD_LEADS_BULK": {
      const now = new Date().toISOString();
      const newLeads: Lead[] = action.payload.leads.map((l) => ({
        id: generateId(),
        phoneNumber: l.phoneNumber || "",
        contactName: l.contactName || "",
        email: l.email,
        company: l.company,
        location: l.location,
        tags: l.tags,
        status: "new" as const,
        callCount: 0,
        createdAt: now,
        updatedAt: now,
        source: action.payload.source,
      }));
      return { ...state, leads: [...newLeads, ...state.leads] };
    }
    case "UPDATE_LEAD":
      return {
        ...state,
        leads: state.leads.map((l) =>
          l.id === action.payload.id
            ? { ...l, ...action.payload.updates, updatedAt: new Date().toISOString() }
            : l
        ),
      };
    case "DELETE_LEADS":
      return {
        ...state,
        leads: state.leads.filter((l) => !action.payload.includes(l.id)),
        selectedIds: state.selectedIds.filter((id) => !action.payload.includes(id)),
      };
    case "SET_FILTERS":
      return {
        ...state,
        filters: { ...state.filters, ...action.payload },
      };
    case "TOGGLE_SELECT": {
      const exists = state.selectedIds.includes(action.payload);
      return {
        ...state,
        selectedIds: exists
          ? state.selectedIds.filter((id) => id !== action.payload)
          : [...state.selectedIds, action.payload],
      };
    }
    case "SELECT_ALL":
      return { ...state, selectedIds: action.payload };
    case "DESELECT_ALL":
      return { ...state, selectedIds: [] };
    case "INCREMENT_CALL_COUNT":
      return {
        ...state,
        leads: state.leads.map((l) =>
          l.id === action.payload
            ? {
                ...l,
                callCount: l.callCount + 1,
                lastCallDate: new Date().toISOString(),
                status: l.status === "new" ? "contacted" : l.status,
                updatedAt: new Date().toISOString(),
              }
            : l
        ),
      };
    default:
      return state;
  }
}

const LeadsContext = createContext<{
  state: LeadsState;
  dispatch: React.Dispatch<LeadsAction>;
} | null>(null);

export function LeadsProvider({ children }: { children: ReactNode }) {
  const { userProfile } = useAuthContext();
  const orgId = userProfile?.orgId ?? null;

  const [state, baseDispatch] = useReducer(leadsReducer, {
    leads: [],
    filters: initialFilters,
    selectedIds: [],
    loaded: false,
  });

  // Load leads from Firestore when authenticated
  useEffect(() => {
    if (!orgId) {
      baseDispatch({ type: "SET_LEADS", payload: [] });
      return;
    }
    let cancelled = false;
    firestoreGetLeads(orgId)
      .then((leads) => {
        if (!cancelled) {
          baseDispatch({ type: "SET_LEADS", payload: leads });
        }
      })
      .catch((err) => {
        console.error("Failed to load leads from Firestore:", err);
        if (!cancelled) {
          baseDispatch({ type: "SET_LEADS", payload: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // Enhanced dispatch that also persists to Firestore
  const dispatch: React.Dispatch<LeadsAction> = useCallback(
    (action: LeadsAction) => {
      baseDispatch(action);

      if (!orgId) return;

      switch (action.type) {
        case "ADD_LEAD": {
          const now = new Date().toISOString();
          const newLead: Lead = {
            ...action.payload,
            callCount: 0,
            status: "new",
            createdAt: now,
            updatedAt: now,
          };
          firestoreAddLead(orgId, newLead).catch((err) =>
            console.error("Failed to add lead to Firestore:", err)
          );
          break;
        }
        case "ADD_LEADS_BULK": {
          const now = new Date().toISOString();
          const newLeads: Lead[] = action.payload.leads.map((l) => ({
            id: generateId(),
            phoneNumber: l.phoneNumber || "",
            contactName: l.contactName || "",
            email: l.email,
            company: l.company,
            location: l.location,
            tags: l.tags,
            status: "new" as const,
            callCount: 0,
            createdAt: now,
            updatedAt: now,
            source: action.payload.source,
          }));
          firestoreAddLeadsBulk(orgId, newLeads).catch((err) =>
            console.error("Failed to bulk add leads to Firestore:", err)
          );
          break;
        }
        case "UPDATE_LEAD": {
          firestoreUpdateLead(orgId, action.payload.id, action.payload.updates).catch((err) =>
            console.error("Failed to update lead in Firestore:", err)
          );
          break;
        }
        case "DELETE_LEADS": {
          firestoreDeleteLeads(orgId, action.payload).catch((err) =>
            console.error("Failed to delete leads from Firestore:", err)
          );
          break;
        }
        case "INCREMENT_CALL_COUNT": {
          firestoreIncrementCallCount(orgId, action.payload).catch((err) =>
            console.error("Failed to increment call count in Firestore:", err)
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
    <LeadsContext.Provider value={{ state, dispatch }}>
      {children}
    </LeadsContext.Provider>
  );
}

export function useLeadsContext() {
  const ctx = useContext(LeadsContext);
  if (!ctx) throw new Error("useLeadsContext must be within LeadsProvider");
  return ctx;
}
