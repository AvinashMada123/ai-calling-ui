import { NextRequest, NextResponse } from "next/server";
import { addCallUpdate } from "@/lib/call-updates-store";

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
