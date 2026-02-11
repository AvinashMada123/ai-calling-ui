import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { adminDb } from "@/lib/firebase-admin";

const CALL_SERVER_URL =
  process.env.CALL_SERVER_URL ||
  "http://34.93.142.172:3001/call/conversational";

const N8N_TRANSCRIPT_WEBHOOK_URL =
  process.env.N8N_TRANSCRIPT_WEBHOOK_URL ||
  "https://n8n.srv1100770.hstgr.cloud/webhook/fwai-transcript";

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

    // Resolve bot config from Firestore
    let botConfigPayload = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let configDoc: any = null;
    if (orgId) {
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

    // Build context: bot config context variables take priority (form fields are
    // hidden when a bot config is selected, so payload values are stale defaults)
    const ctx = configDoc?.contextVariables || {};
    const context = {
      customer_name: payload.contactName || "Customer",
      agent_name: ctx.agentName || payload.agentName || "Agent",
      company_name: ctx.companyName || payload.companyName || "",
      event_name: ctx.eventName || payload.eventName || "",
      event_host: ctx.eventHost || payload.eventHost || "",
      location: ctx.location || payload.location || "",
    };

    // Determine the public URL for the call-ended callback.
    // Encode orgId in the URL so we don't depend on the call server passing it
    // through in the callback body (most call servers only return call data).
    const host = request.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const callEndWebhookUrl = `${protocol}://${host}/api/call-ended${orgId ? `?orgId=${orgId}` : ""}`;

    // Build payload matching the exact format the call server expects.
    // orgId is included so the call server can pass it back in the call-ended
    // callback, allowing /api/call-ended to update the correct org in Firestore.
    const callServerPayload = {
      phoneNumber: payload.phoneNumber,
      contactName: payload.contactName || "Customer",
      clientName: payload.clientName || "fwai",
      orgId,
      n8nWebhookUrl: N8N_TRANSCRIPT_WEBHOOK_URL,
      callEndWebhookUrl,
      context,
      ...botConfigPayload,
    };

    console.log("[API /api/call] Call server URL:", CALL_SERVER_URL);
    console.log("[API /api/call] Prompt being sent:", callServerPayload.prompt ?? "(no prompt resolved)");
    console.log("[API /api/call] Full payload:", JSON.stringify(callServerPayload, null, 2));

    const response = await fetch(CALL_SERVER_URL, {
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

    return NextResponse.json({
      ...data,
      _debug: {
        resolvedContext: context,
        botConfigFound: !!configDoc,
        contextVarsFromFirestore: ctx,
      },
    });
  } catch (error) {
    console.error("[API /api/call] Error:", error);
    return NextResponse.json(
      { success: false, call_uuid: "", message: `Failed to initiate call: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
