import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { query } from "@/lib/db";
import { getPendingUpdates } from "@/lib/call-updates-store";
import type { CallEndedData } from "@/types/call";

const FWAI_BACKEND_URL =
  (process.env.CALL_SERVER_URL || "http://34.93.142.172:3001/call/conversational")
    .replace(/\/call\/conversational$/, "");

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  const orgId = authUser?.orgId || "";

  const uuids = request.nextUrl.searchParams.get("uuids");
  if (!uuids) {
    return NextResponse.json({ updates: [] });
  }

  const callUuids = uuids.split(",").filter(Boolean);
  if (callUuids.length === 0) {
    return NextResponse.json({ updates: [] });
  }

  const errors: string[] = [];

  // Source 1: Check in-memory store
  const pendingUpdates = getPendingUpdates(orgId);
  const resolvedUuids = new Set(pendingUpdates.map((u) => u.callUuid));

  // Source 2: Check PostgreSQL for calls with endedData
  if (orgId) {
    try {
      const unresolvedFromDb = callUuids.filter((u) => !resolvedUuids.has(u));
      if (unresolvedFromDb.length > 0) {
        const batch = unresolvedFromDb.slice(0, 30);
        // Build parameterized IN clause
        const placeholders = batch.map((_, i) => `$${i + 2}`).join(", ");
        const rows = await query(
          `SELECT call_uuid, ended_data FROM ui_calls WHERE org_id = $1 AND call_uuid IN (${placeholders})`,
          [orgId, ...batch]
        );

        for (const row of rows) {
          if (row.ended_data && !resolvedUuids.has(row.call_uuid as string)) {
            pendingUpdates.push({
              callUuid: row.call_uuid as string,
              data: row.ended_data as CallEndedData,
              receivedAt: new Date().toISOString(),
            });
            resolvedUuids.add(row.call_uuid as string);
          }
        }
      }
    } catch (error) {
      errors.push(`DB: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Source 3: Poll FWAI backend directly for any still-unresolved UUIDs
  const stillUnresolved = callUuids.filter((u) => !resolvedUuids.has(u));
  if (stillUnresolved.length > 0) {
    await Promise.all(
      stillUnresolved.map(async (uuid) => {
        const url = `${FWAI_BACKEND_URL}/calls/${uuid}/status`;
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
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
