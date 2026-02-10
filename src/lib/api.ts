import type { ApiCallPayload, ApiCallResponse } from "@/types/api";

export async function triggerCall(
  payload: ApiCallPayload
): Promise<ApiCallResponse> {
  console.log("[triggerCall] Sending payload:", JSON.stringify(payload, null, 2));

  const response = await fetch("/api/call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload }),
  });

  console.log("[triggerCall] Response status:", response.status, response.statusText);

  const data = await response.json();
  console.log("[triggerCall] Response data:", JSON.stringify(data, null, 2));

  if (!response.ok) {
    throw new Error(data.message || `Call failed: ${response.statusText}`);
  }

  return data;
}
