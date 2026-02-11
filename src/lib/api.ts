import type { ApiCallPayload, ApiCallResponse } from "@/types/api";

export async function triggerCall(
  payload: ApiCallPayload
): Promise<ApiCallResponse> {
  // When a bot config is selected, strip context fields — the server resolves
  // them from the bot config's contextVariables.  Form fields are hidden so any
  // values here are stale defaults (e.g. agentName:"Agent") that would conflict.
  let cleanPayload: Record<string, unknown> = { ...payload };
  if (payload.botConfigId) {
    delete cleanPayload.agentName;
    delete cleanPayload.companyName;
    delete cleanPayload.eventName;
    delete cleanPayload.eventHost;
    delete cleanPayload.location;
  }

  console.log("[triggerCall] Sending payload:", JSON.stringify(cleanPayload, null, 2));

  const response = await fetch("/api/call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload: cleanPayload }),
  });

  console.log("[triggerCall] Response status:", response.status, response.statusText);

  const data = await response.json();
  console.log("[triggerCall] Response data:", JSON.stringify(data, null, 2));

  if (!response.ok) {
    throw new Error(data.message || `Call failed: ${response.statusText}`);
  }

  return data;
}
