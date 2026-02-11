import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { adminDb } from "@/lib/firebase-admin";

const DEFAULT_CALL_SERVER_URL =
  process.env.CALL_SERVER_URL ||
  "http://34.93.142.172:3001/call/conversational";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformBotConfig(config: any) {
  const questions = (config.questions || [])
    .sort((a: { order: number }, b: { order: number }) => a.order - b.order)
    .map((q: { id: string; prompt: string }) => ({ id: q.id, prompt: q.prompt }));

  const objections: Record<string, string> = {};
  for (const o of config.objections || []) {
    objections[o.key] = o.response;
  }

  return {
    prompt: config.prompt,
    questions,
    objections,
    objectionKeywords: config.objectionKeywords || {},
  };
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    const body = await request.json();
    const { payload } = body;
    const orgId = authUser?.orgId || "";

    // Determine the app's public URL for callbacks
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
      || request.headers.get("origin")
      || "https://wavelength-flax.vercel.app";

    // Get org-specific call server URL from Firestore (or use default)
    let callServerUrl = DEFAULT_CALL_SERVER_URL;
    if (orgId) {
      const orgDoc = await adminDb.collection("organizations").doc(orgId).get();
      if (orgDoc.exists) {
        const orgWebhook = orgDoc.data()?.webhookUrl;
        if (orgWebhook) callServerUrl = orgWebhook;
      }
    }

    // Resolve bot config from Firestore
    let botConfigPayload = {};
    if (orgId) {
      let configDoc = null;

      // Try specific config if botConfigId provided
      if (payload.botConfigId) {
        const snap = await adminDb
          .collection("organizations").doc(orgId)
          .collection("botConfigs").doc(payload.botConfigId)
          .get();
        if (snap.exists) configDoc = snap.data();
      }

      // Fall back to active config
      if (!configDoc) {
        const activeSnap = await adminDb
          .collection("organizations").doc(orgId)
          .collection("botConfigs")
          .where("isActive", "==", true)
          .limit(1)
          .get();
        if (!activeSnap.empty) configDoc = activeSnap.docs[0].data();
      }

      if (configDoc) {
        botConfigPayload = transformBotConfig(configDoc);
      }
    }

    // Build context from payload fields (matches call server's expected format)
    const context = {
      customer_name: payload.contactName || "Customer",
      agent_name: payload.agentName || "Agent",
      company_name: payload.companyName || "",
      event_host: payload.eventHost || "",
      location: payload.location || "",
    };

    // Build the call server payload
    const { botConfigId: _removed, ...payloadWithoutBotConfigId } = payload;
    const callServerPayload = {
      ...payloadWithoutBotConfigId,
      orgId,
      context,
      callEndWebhookUrl: `${appUrl}/api/call-ended`,
      ...botConfigPayload,
    };

    console.log("[API /api/call] Call server URL:", callServerUrl);
    console.log("[API /api/call] Payload keys:", Object.keys(callServerPayload));

    const response = await fetch(callServerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(callServerPayload),
    });

    console.log("[API /api/call] Call server response status:", response.status);

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error("[API /api/call] Non-JSON response:", response.status, responseText.slice(0, 500));
      return NextResponse.json(
        { success: false, call_uuid: "", message: `Call server returned ${response.status}: ${responseText.slice(0, 200) || "(empty body)"}` },
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
