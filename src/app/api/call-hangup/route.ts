import { NextRequest, NextResponse } from "next/server";

const FWAI_BACKEND_URL =
  (process.env.CALL_SERVER_URL || "http://34.93.142.172:3005/call/conversational")
    .replace(/\/call\/conversational$/, "");

export async function POST(request: NextRequest) {
  try {
    const { callUuid } = await request.json();
    if (!callUuid) {
      return NextResponse.json({ success: false, message: "Missing callUuid" }, { status: 400 });
    }

    const url = `${FWAI_BACKEND_URL}/calls/${callUuid}/hangup`;
    console.log("[API /api/call-hangup] Sending hangup to:", url);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      return NextResponse.json(data);
    } catch (e) {
      // Best-effort: backend may be unreachable but call might have already ended
      console.warn("[API /api/call-hangup] Backend unreachable:", e instanceof Error ? e.message : e);
      return NextResponse.json({ success: true, message: "Hangup sent (backend may be unreachable)" });
    }
  } catch (error) {
    console.error("[API /api/call-hangup] Error:", error);
    return NextResponse.json(
      { success: false, message: `Hangup failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
