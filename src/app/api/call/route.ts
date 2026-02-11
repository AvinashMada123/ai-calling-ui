import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { adminDb } from "@/lib/firebase-admin";

const DEFAULT_WEBHOOK_URL =
  process.env.N8N_WEBHOOK_URL ||
  "https://n8n.srv1100770.hstgr.cloud/webhook/start-call";

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

    // Get org webhook URL from Firestore (or use default)
    let webhookUrl = DEFAULT_WEBHOOK_URL;
    if (orgId) {
      const orgDoc = await adminDb.collection("organizations").doc(orgId).get();
      if (orgDoc.exists) {
        const orgWebhook = orgDoc.data()?.webhookUrl;
        if (orgWebhook) webhookUrl = orgWebhook;
      }
    }

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

    // Build context: payload fields override bot config context variables
    const ctx = configDoc?.contextVariables || {};
    const context = {
      customer_name: payload.contactName || "Customer",
      agent_name: payload.agentName || ctx.agentName || "Agent",
      company_name: payload.companyName || ctx.companyName || "",
      event_name: payload.eventName || ctx.eventName || "",
      event_host: payload.eventHost || ctx.eventHost || "",
      location: payload.location || ctx.location || "",
    };

    // Build enriched payload — bot config fields + context + original fields
    const { botConfigId: _removed, ...payloadWithoutBotConfigId } = payload;
    const enrichedPayload = {
      ...payloadWithoutBotConfigId,
      orgId,
      context,
      ...botConfigPayload,
    };

    console.log("[API /api/call] Webhook URL:", webhookUrl);
    console.log("[API /api/call] Payload keys:", Object.keys(enrichedPayload));

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(enrichedPayload),
    });

    console.log("[API /api/call] Webhook response status:", response.status);

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error("[API /api/call] Non-JSON response:", response.status, responseText.slice(0, 500));
      return NextResponse.json(
        { success: false, call_uuid: "", message: `Webhook returned ${response.status}: ${responseText.slice(0, 200) || "(empty body)"}` },
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
