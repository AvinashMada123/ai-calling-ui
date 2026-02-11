"use client";

import { useMemo, useEffect, useRef, useCallback } from "react";
import { useCallsContext } from "@/context/calls-context";
import { triggerCall } from "@/lib/api";
import { generateId } from "@/lib/utils";
import type { CallRequest, CallRecord, CallStatus, CallResponse, CallEndedData } from "@/types/call";
import { toast } from "sonner";

const POLL_INTERVAL_MS = 3000;

export function useCalls() {
  const { state, dispatch } = useCallsContext();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasActiveCalls = useMemo(
    () => state.calls.some((c) => c.status === "initiating" || c.status === "in-progress"),
    [state.calls]
  );

  const applyCallUpdate = useCallback(
    (data: CallEndedData) => {
      const match = state.calls.find((c) => c.callUuid === data.call_uuid);
      if (!match) return;

      dispatch({
        type: "UPDATE_CALL",
        payload: {
          id: match.id,
          updates: {
            status: "completed" as CallStatus,
            endedData: data,
            durationSeconds: data.duration_seconds,
            interestLevel: data.interest_level,
            completionRate: data.completion_rate,
            callSummary: data.call_summary,
          },
        },
      });

      if (state.activeCall?.callUuid === data.call_uuid) {
        dispatch({ type: "CLEAR_ACTIVE_CALL" });
      }

      toast.success("Call completed!", {
        description: `${data.contact_name} — ${data.duration_seconds}s, Interest: ${data.interest_level}`,
      });
    },
    [state.calls, state.activeCall, dispatch]
  );

  useEffect(() => {
    if (!hasActiveCalls) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    const poll = async () => {
      try {
        // Collect UUIDs of active calls to check their status in Firestore
        const activeUuids = state.calls
          .filter((c) => (c.status === "initiating" || c.status === "in-progress") && c.callUuid)
          .map((c) => c.callUuid);
        if (activeUuids.length === 0) return;

        const res = await fetch(`/api/call-updates?uuids=${activeUuids.join(",")}`);
        if (!res.ok) return;
        const { updates } = await res.json();
        for (const update of updates) {
          applyCallUpdate(update.data);
        }
      } catch {
        // silently ignore polling errors
      }
    };

    poll();
    pollingRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [hasActiveCalls, applyCallUpdate]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const todayCalls = state.calls.filter(
      (c) => new Date(c.initiatedAt).toDateString() === today
    );
    const completed = state.calls.filter((c) => c.status === "completed");
    const failed = state.calls.filter(
      (c) => c.status === "failed" || c.status === "no-answer"
    );
    const finished = completed.length + failed.length;

    return {
      totalCalls: state.calls.length,
      todayCalls: todayCalls.length,
      successfulCalls: completed.length,
      failedCalls: failed.length,
      successRate: finished > 0 ? Math.round((completed.length / finished) * 100) : 0,
    };
  }, [state.calls]);

  const initiateCall = async (
    request: CallRequest,
    leadId?: string
  ): Promise<CallResponse> => {
    const callRecord: CallRecord = {
      id: generateId(),
      callUuid: "",
      leadId,
      request,
      status: "initiating",
      initiatedAt: new Date().toISOString(),
    };

    dispatch({ type: "ADD_CALL", payload: callRecord });
    dispatch({ type: "SET_ACTIVE_CALL", payload: callRecord });

    try {
      const response = await triggerCall(request);
      dispatch({
        type: "UPDATE_CALL",
        payload: {
          id: callRecord.id,
          updates: {
            callUuid: response.call_uuid,
            response,
            status: "in-progress",
          },
        },
      });
      toast.success("Call initiated successfully!", {
        description: `Call UUID: ${response.call_uuid}`,
      });
      return response;
    } catch (error) {
      dispatch({
        type: "UPDATE_CALL",
        payload: {
          id: callRecord.id,
          updates: { status: "failed" },
        },
      });
      toast.error("Failed to initiate call", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  };

  const updateCallStatus = (callId: string, status: CallStatus) => {
    dispatch({
      type: "UPDATE_CALL",
      payload: { id: callId, updates: { status } },
    });
    if (status === "completed" || status === "failed" || status === "no-answer") {
      dispatch({ type: "CLEAR_ACTIVE_CALL" });
    }
  };

  return {
    calls: state.calls,
    activeCall: state.activeCall,
    loaded: state.loaded,
    initiateCall,
    updateCallStatus,
    clearActiveCall: () => dispatch({ type: "CLEAR_ACTIVE_CALL" }),
    ...stats,
  };
}
