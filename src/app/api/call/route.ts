import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { adminDb } from "@/lib/firebase-admin";

const DEFAULT_WEBHOOK_URL =
  process.env.N8N_WEBHOOK_URL ||
  "https://n8n.srv1100770.hstgr.cloud/webhook/start-call";

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    const body = await request.json();
    const { payload } = body;

    // Get org webhook URL from Firestore (or use default)
    let webhookUrl = DEFAULT_WEBHOOK_URL;
    if (authUser?.orgId) {
      const orgDoc = await adminDb.collection("organizations").doc(authUser.orgId).get();
      if (orgDoc.exists) {
        const orgWebhook = orgDoc.data()?.webhookUrl;
        if (orgWebhook) webhookUrl = orgWebhook;
      }
    }

    // Include orgId in payload for call-ended routing
    const enrichedPayload = {
      ...payload,
      orgId: authUser?.orgId || "",
    };

    console.log("[API /api/call] Webhook URL:", webhookUrl);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(enrichedPayload),
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return NextResponse.json(
        { success: false, call_uuid: "", message: `Non-JSON response: ${responseText.slice(0, 200)}` },
        { status: 502 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[API /api/call] Error:", error);
    return NextResponse.json(
      { success: false, call_uuid: "", message: `Failed to initiate call: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
