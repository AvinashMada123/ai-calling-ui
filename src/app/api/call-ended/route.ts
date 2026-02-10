import { NextRequest, NextResponse } from "next/server";
import { addCallUpdate } from "@/lib/call-updates-store";
import { qualifyLead } from "@/lib/gemini";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    console.log("[API /api/call-ended] Received webhook from n8n");
    console.log("[API /api/call-ended] call_uuid:", data.call_uuid);
    console.log("[API /api/call-ended] contact_name:", data.contact_name);
    console.log("[API /api/call-ended] duration_seconds:", data.duration_seconds);
    console.log("[API /api/call-ended] interest_level:", data.interest_level);
    console.log("[API /api/call-ended] completion_rate:", data.completion_rate);
    console.log("[API /api/call-ended] call_summary:", data.call_summary?.slice(0, 100));

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

    addCallUpdate(data);

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
