"use client";

import { useMemo, useState } from "react";
import { useLeadsContext } from "@/context/leads-context";
import type { Lead, LeadFilters } from "@/types/lead";
import { ITEMS_PER_PAGE } from "@/lib/constants";

export function useLeads() {
  const { state, dispatch } = useLeadsContext();
  const [page, setPage] = useState(1);

  const filteredLeads = useMemo(() => {
    let result = state.leads;

    if (state.filters.status !== "all") {
      result = result.filter((l) => l.status === state.filters.status);
    }
    if (state.filters.source !== "all") {
      result = result.filter((l) => l.source === state.filters.source);
    }
    if (state.filters.search) {
      const q = state.filters.search.toLowerCase();
      result = result.filter(
        (l) =>
          l.contactName.toLowerCase().includes(q) ||
          l.phoneNumber.includes(q) ||
          (l.email?.toLowerCase().includes(q) ?? false) ||
          (l.company?.toLowerCase().includes(q) ?? false)
      );
    }

    return result;
  }, [state.leads, state.filters]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / ITEMS_PER_PAGE));
  const paginatedLeads = filteredLeads.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  return {
    leads: state.leads,
    filteredLeads,
    paginatedLeads,
    page,
    setPage,
    totalPages,
    filters: state.filters,
    selectedIds: state.selectedIds,
    loaded: state.loaded,

    addLead: (lead: Omit<Lead, "id" | "createdAt" | "updatedAt" | "callCount" | "status">) => {
      dispatch({ type: "ADD_LEAD", payload: lead });
    },

    addLeadsBulk: (leads: Partial<Lead>[], source: Lead["source"]) => {
      dispatch({ type: "ADD_LEADS_BULK", payload: { leads, source } });
    },

    updateLead: (id: string, updates: Partial<Lead>) => {
      dispatch({ type: "UPDATE_LEAD", payload: { id, updates } });
    },

    deleteLeads: (ids: string[]) => {
      dispatch({ type: "DELETE_LEADS", payload: ids });
    },

    setFilters: (filters: Partial<LeadFilters>) => {
      dispatch({ type: "SET_FILTERS", payload: filters });
      setPage(1);
    },

    toggleSelect: (id: string) => {
      dispatch({ type: "TOGGLE_SELECT", payload: id });
    },

    selectAll: () => {
      dispatch({
        type: "SELECT_ALL",
        payload: filteredLeads.map((l) => l.id),
      });
    },

    deselectAll: () => {
      dispatch({ type: "DESELECT_ALL" });
    },

    incrementCallCount: (id: string) => {
      dispatch({ type: "INCREMENT_CALL_COUNT", payload: id });
    },

    totalLeads: state.leads.length,
    newLeads: state.leads.filter((l) => l.status === "new").length,
    contactedLeads: state.leads.filter((l) => l.status === "contacted").length,
  };
}
