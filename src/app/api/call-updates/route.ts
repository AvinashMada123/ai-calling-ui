import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { getAdminDb } from "@/lib/firebase-admin";
import { getPendingUpdates } from "@/lib/call-updates-store";
import type { CallEndedData } from "@/types/call";

const FWAI_BACKEND_URL =
  (process.env.CALL_SERVER_URL || "http://34.93.142.172:3005/call/conversational")
    .replace(/\/call\/conversational$/, "");

// Rate-limit backend polling per UUID (30s cooldown)
const POLL_COOLDOWN_MS = 30_000;
const pollCooldownMap = new Map<string, number>();

function canPollUuid(uuid: string): boolean {
  const last = pollCooldownMap.get(uuid);
  if (last && Date.now() - last < POLL_COOLDOWN_MS) return false;
  pollCooldownMap.set(uuid, Date.now());
  return true;
}

// Prune entries older than 5 minutes every 100 calls
let pruneCounter = 0;
function maybePrune() {
  if (++pruneCounter % 100 !== 0) return;
  const cutoff = Date.now() - 5 * 60_000;
  for (const [uuid, ts] of pollCooldownMap) {
    if (ts < cutoff) pollCooldownMap.delete(uuid);
  }
}

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  const orgId = authUser?.orgId || "";

  // Get active call UUIDs from query params
  const uuids = request.nextUrl.searchParams.get("uuids");
  if (!uuids) {
    return NextResponse.json({ updates: [] });
  }

  const callUuids = uuids.split(",").filter(Boolean);
  if (callUuids.length === 0) {
    return NextResponse.json({ updates: [] });
  }

  const errors: string[] = [];

  // Source 1: Check in-memory store (from webhook, if it landed on this instance)
  const pendingUpdates = getPendingUpdates(orgId);
  const resolvedUuids = new Set(pendingUpdates.map((u) => u.callUuid));

  // Source 2: Check Firestore for calls with endedData
  if (orgId) {
    try {
      const db = getAdminDb();
      const callsCol = db
        .collection("organizations")
        .doc(orgId)
        .collection("calls");

      const unresolvedFromFirestore = callUuids.filter((u) => !resolvedUuids.has(u));
      if (unresolvedFromFirestore.length > 0) {
        const batch = unresolvedFromFirestore.slice(0, 30);
        const snap = await callsCol.where("callUuid", "in", batch).get();

        for (const doc of snap.docs) {
          const data = doc.data();
          if (data.endedData && !resolvedUuids.has(data.callUuid)) {
            pendingUpdates.push({
              callUuid: data.callUuid,
              data: data.endedData,
              receivedAt: new Date().toISOString(),
            });
            resolvedUuids.add(data.callUuid);
          }
        }
      }
    } catch (error) {
      errors.push(`Firestore: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Source 3: Poll FWAI backend directly for any still-unresolved UUIDs
  maybePrune();
  const stillUnresolved = callUuids.filter((u) => !resolvedUuids.has(u));
  if (stillUnresolved.length > 0) {
    await Promise.all(
      stillUnresolved.map(async (uuid) => {
        // Rate-limit: skip if we polled this UUID within the cooldown window
        if (!canPollUuid(uuid)) {
          errors.push(`${uuid}: cooldown (skipped)`);
          return;
        }
        const url = `${FWAI_BACKEND_URL}/calls/${uuid}/status`;
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (res.status === 404) {
            // Backend doesn't know this UUID — synthesize a completed result so frontend stops polling
            const syntheticData: CallEndedData = {
              call_uuid: uuid,
              caller_phone: "",
              contact_name: "",
              client_name: "",
              duration_seconds: 0,
              timestamp: new Date().toISOString(),
              questions_completed: 0,
              total_questions: 0,
              completion_rate: 0,
              interest_level: "Low",
              call_summary: "Call data unavailable — the backend has no record of this call.",
              objections_raised: [],
              collected_responses: {},
              question_pairs: [],
              call_metrics: {
                questions_completed: 0,
                total_duration_s: 0,
                avg_latency_ms: 0,
                p90_latency_ms: 0,
                min_latency_ms: 0,
                max_latency_ms: 0,
                total_nudges: 0,
              },
              transcript: "",
            };
            pendingUpdates.push({
              callUuid: uuid,
              data: syntheticData,
              receivedAt: new Date().toISOString(),
            });
            return;
          }
          if (!res.ok) {
            errors.push(`${uuid}: HTTP ${res.status}`);
            return;
          }
          const call = await res.json();
          if (call.status !== "completed") {
            errors.push(`${uuid}: status=${call.status}`);
            return;
          }

          const qc = call.questions_completed || 0;
          const tq = call.total_questions || Math.max(qc, 1);
          const cr = tq > 0 ? qc / tq : 0;

          const data: CallEndedData = {
            call_uuid: call.call_uuid,
            caller_phone: call.phone || "",
            contact_name: call.contact_name || "",
            client_name: call.client_name || "",
            duration_seconds: call.duration_seconds || 0,
            timestamp: call.ended_at || new Date().toISOString(),
            questions_completed: qc,
            total_questions: tq,
            completion_rate: cr,
            interest_level: call.interest_level || (cr > 0.7 ? "High" : cr > 0.4 ? "Medium" : "Low"),
            call_summary: call.call_summary || "",
            objections_raised: call.objections_raised || [],
            collected_responses: call.collected_responses || {},
            question_pairs: call.question_pairs || [],
            call_metrics: call.call_metrics || {
              questions_completed: qc,
              total_duration_s: call.duration_seconds || 0,
              avg_latency_ms: 0,
              p90_latency_ms: 0,
              min_latency_ms: 0,
              max_latency_ms: 0,
              total_nudges: 0,
            },
            transcript: call.transcript || "",
            recording_url: `/api/calls/${call.call_uuid}/recording`,
          };

          pendingUpdates.push({
            callUuid: uuid,
            data,
            receivedAt: new Date().toISOString(),
          });
        } catch (e) {
          errors.push(`${uuid}: ${e instanceof Error ? e.message : String(e)}`);
        }
      })
    );
  }

  return NextResponse.json({
    updates: pendingUpdates,
    _debug: { fwaiUrl: FWAI_BACKEND_URL, uuids, errors },
  });
}
