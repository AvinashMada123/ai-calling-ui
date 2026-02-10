// Server-side in-memory store for pending call updates from n8n webhook.
// The /api/call-ended endpoint writes here, and /api/call-updates reads + clears.

import type { CallEndedData } from "@/types/call";

interface PendingUpdate {
  callUuid: string;
  data: CallEndedData;
  receivedAt: string;
}

const pendingUpdates: PendingUpdate[] = [];

export function addCallUpdate(data: CallEndedData) {
  pendingUpdates.push({
    callUuid: data.call_uuid,
    data,
    receivedAt: new Date().toISOString(),
  });
  console.log(
    `[call-updates-store] Added update for call ${data.call_uuid}. Pending: ${pendingUpdates.length}`
  );
}

export function getPendingUpdates(): PendingUpdate[] {
  const updates = [...pendingUpdates];
  pendingUpdates.length = 0; // clear after reading
  return updates;
}
