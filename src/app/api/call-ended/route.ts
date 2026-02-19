import { NextRequest, NextResponse } from "next/server";
import { addCallUpdate } from "@/lib/call-updates-store";
import { qualifyLead } from "@/lib/gemini";
import { query, queryOne } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    const queryOrgId = request.nextUrl.searchParams.get("orgId") || "";

    console.log("[API /api/call-ended] Received call-ended webhook");
    console.log("[API /api/call-ended] call_uuid:", data.call_uuid);
    console.log("[API /api/call-ended] contact_name:", data.contact_name);
    console.log("[API /api/call-ended] duration_seconds:", data.duration_seconds);
    console.log("[API /api/call-ended] interest_level:", data.interest_level);
    console.log("[API /api/call-ended] completion_rate:", data.completion_rate);
    console.log("[API /api/call-ended] call_summary:", data.call_summary?.slice(0, 100));
    console.log("[API /api/call-ended] orgId (query):", queryOrgId, "orgId (body):", data.orgId);
    console.log("[API /api/call-ended] recording_url:", data.recording_url || "(none)");

    if (!data.recording_url && data.call_uuid) {
      data.recording_url = `/api/calls/${data.call_uuid}/recording`;
    }
    if (!data.transcript_entries) {
      data.transcript_entries = [];
    }

    // Qualify lead with Gemini if we have question pairs
    if (data.question_pairs && data.question_pairs.length > 0) {
      try {
        const qualification = await qualifyLead(data);
        if (qualification) {
          data.qualification = qualification;
          console.log(
            `[API /api/call-ended] Qualified as ${qualification.level} (${qualification.confidence}%)`
          );
        }
      } catch (err) {
        console.error("[API /api/call-ended] Qualification error (non-fatal):", err);
      }
    }

    const orgId: string = queryOrgId || data.orgId || "";

    // Update PostgreSQL if orgId is present
    if (orgId) {
      try {
        // Find the call by call_uuid
        const callRow = await queryOne<{ id: string }>(
          "SELECT id FROM ui_calls WHERE org_id = $1 AND call_uuid = $2 LIMIT 1",
          [orgId, data.call_uuid]
        );

        if (callRow) {
          await query(
            `UPDATE ui_calls SET
              status = 'completed',
              ended_data = $1,
              duration_seconds = $2,
              interest_level = $3,
              completion_rate = $4,
              call_summary = $5,
              qualification = $6,
              completed_at = NOW()
            WHERE id = $7`,
            [
              JSON.stringify(data),
              data.duration_seconds || 0,
              data.interest_level || "",
              data.completion_rate || 0,
              data.call_summary || "",
              data.qualification ? JSON.stringify(data.qualification) : null,
              callRow.id,
            ]
          );
          console.log(`[API /api/call-ended] Updated call doc for ${data.call_uuid}`);
        } else {
          console.warn(`[API /api/call-ended] No call doc found for ${data.call_uuid} in org ${orgId}`);
        }

        // Increment usage counters on the organization (JSONB update)
        const minutes = Math.ceil((data.duration_seconds || 0) / 60);
        await query(
          `UPDATE organizations SET
            usage = jsonb_set(
              jsonb_set(
                jsonb_set(
                  COALESCE(usage, '{}'::jsonb),
                  '{totalCalls}',
                  to_jsonb(COALESCE((usage->>'totalCalls')::int, 0) + 1)
                ),
                '{totalMinutes}',
                to_jsonb(COALESCE((usage->>'totalMinutes')::numeric, 0) + $1)
              ),
              '{lastCallAt}',
              to_jsonb($2::text)
            )
          WHERE id = $3`,
          [minutes, new Date().toISOString(), orgId]
        );
        console.log(`[API /api/call-ended] Incremented usage for org ${orgId}`);
      } catch (dbErr) {
        console.error("[API /api/call-ended] DB update error (non-fatal):", dbErr);
      }
    }

    // Keep in-memory store for backward compatibility
    addCallUpdate(orgId, data);

    return NextResponse.json({
      success: true,
      message: "Call ended data received",
    });
  } catch (error) {
    console.error("[API /api/call-ended] Error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to process call ended data" },
      { status: 500 }
    );
  }
}
