"use client";

import { useMemo } from "react";
import { useLeads } from "./use-leads";
import { useCalls } from "./use-calls";

export function useStats() {
  const { leads, totalLeads, newLeads } = useLeads();
  const { calls, totalCalls, todayCalls, successRate } = useCalls();

  const callsByDay = useMemo(() => {
    const days: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toDateString();
      const label = d.toLocaleDateString("en-US", { weekday: "short" });
      const count = calls.filter(
        (c) => new Date(c.initiatedAt).toDateString() === dateStr
      ).length;
      days.push({ date: label, count });
    }
    return days;
  }, [calls]);

  const maxCallsInDay = useMemo(
    () => Math.max(1, ...callsByDay.map((d) => d.count)),
    [callsByDay]
  );

  return {
    totalLeads,
    newLeads,
    totalCalls,
    todayCalls,
    successRate,
    callsByDay,
    maxCallsInDay,
  };
}
