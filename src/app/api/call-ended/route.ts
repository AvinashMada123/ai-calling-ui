import { NextRequest, NextResponse } from "next/server";
import { addCallUpdate } from "@/lib/call-updates-store";
import { qualifyLead } from "@/lib/gemini";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    // orgId can come from: (1) query param in the webhook URL, (2) body payload
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

    // Normalize recording_url and transcript_entries from FWAI webhook
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

    // Extract orgId: prefer query param (reliable), fall back to body (if call server passes it through)
    const orgId: string = queryOrgId || data.orgId || "";

    // Update Firestore if orgId is present
    if (orgId) {
      try {
        // Find the call document by call_uuid within the org's calls collection
        const callsSnap = await adminDb
          .collection("organizations")
          .doc(orgId)
          .collection("calls")
          .where("callUuid", "==", data.call_uuid)
          .limit(1)
          .get();

        if (!callsSnap.empty) {
          const callDocRef = callsSnap.docs[0].ref;
          await callDocRef.update({
            status: "completed",
            endedData: data,
            durationSeconds: data.duration_seconds || 0,
            interestLevel: data.interest_level || "",
            completionRate: data.completion_rate || 0,
            callSummary: data.call_summary || "",
            qualification: data.qualification || null,
            completedAt: FieldValue.serverTimestamp(),
          });
          console.log(`[API /api/call-ended] Updated Firestore call doc for ${data.call_uuid}`);
        } else {
          console.warn(`[API /api/call-ended] No Firestore call doc found for ${data.call_uuid} in org ${orgId}`);
        }

        // Increment usage counters on the organization
        await adminDb
          .collection("organizations")
          .doc(orgId)
          .update({
            "usage.totalCalls": FieldValue.increment(1),
            "usage.totalMinutes": FieldValue.increment(
              Math.ceil((data.duration_seconds || 0) / 60)
            ),
            "usage.lastCallAt": FieldValue.serverTimestamp(),
          });
        console.log(`[API /api/call-ended] Incremented usage for org ${orgId}`);
      } catch (firestoreErr) {
        console.error("[API /api/call-ended] Firestore update error (non-fatal):", firestoreErr);
      }
    }

    // Keep in-memory store for backward compatibility (scoped by orgId)
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
