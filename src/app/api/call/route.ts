import { NextRequest, NextResponse } from "next/server";

const WEBHOOK_URL =
  process.env.N8N_WEBHOOK_URL ||
  "https://n8n.srv1100770.hstgr.cloud/webhook/start-call";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { payload } = body;

    console.log("[API /api/call] Webhook URL:", WEBHOOK_URL);
    console.log("[API /api/call] Request payload:", JSON.stringify(payload, null, 2));

    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    console.log("[API /api/call] Webhook response status:", response.status, response.statusText);

    const responseText = await response.text();
    console.log("[API /api/call] Webhook raw response:", responseText);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error("[API /api/call] Failed to parse response as JSON");
      return NextResponse.json(
        { success: false, call_uuid: "", message: `Non-JSON response: ${responseText.slice(0, 200)}` },
        { status: 502 }
      );
    }

    console.log("[API /api/call] Parsed response:", JSON.stringify(data, null, 2));
    return NextResponse.json(data);
  } catch (error) {
    console.error("[API /api/call] Error:", error);
    return NextResponse.json(
      { success: false, call_uuid: "", message: `Failed to initiate call: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
