import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { query, queryOne } from "@/lib/db";

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
    objectionKeywords: config.objection_keywords || config.objectionKeywords || {},
  };
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    const body = await request.json();
    const { payload } = body;
    const orgId = authUser?.orgId || "";

    // Resolve bot config from PostgreSQL
    let botConfigPayload = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let configDoc: any = null;

    if (orgId) {
      // Try specific config if botConfigId provided
      if (payload.botConfigId) {
        configDoc = await queryOne(
          "SELECT * FROM bot_configs WHERE id = $1 AND org_id = $2",
          [payload.botConfigId, orgId]
        );
      }

      // Fall back to active config
      if (!configDoc) {
        configDoc = await queryOne(
          "SELECT * FROM bot_configs WHERE org_id = $1 AND is_active = true LIMIT 1",
          [orgId]
        );
      }

      if (configDoc) {
        botConfigPayload = transformBotConfig(configDoc);
      }
    }

    // Read persona, product, and social proof data if enabled
    let personaPayload: Record<string, unknown> = {};
    let productPayload: Record<string, unknown> = {};
    let socialProofPayload: Record<string, unknown> = {};

    if (orgId && configDoc) {
      if (configDoc.persona_engine_enabled) {
        const [personas, situations] = await Promise.all([
          query("SELECT * FROM personas WHERE org_id = $1", [orgId]),
          query("SELECT * FROM situations WHERE org_id = $1", [orgId]),
        ]);
        personaPayload = {
          personas,
          personaKeywords: personas.reduce((acc: Record<string, unknown[]>, p) => {
            acc[p.name as string] = (p.keywords as unknown[]) || [];
            return acc;
          }, {}),
          situations,
          situationKeywords: situations.reduce((acc: Record<string, unknown[]>, s) => {
            acc[s.name as string] = (s.keywords as unknown[]) || [];
            return acc;
          }, {}),
        };
      }

      if (configDoc.product_intelligence_enabled) {
        const productSections = await query(
          "SELECT * FROM product_sections WHERE org_id = $1",
          [orgId]
        );
        productPayload = {
          productSections,
          productKeywords: productSections.reduce((acc: Record<string, unknown[]>, s) => {
            acc[s.name as string] = (s.keywords as unknown[]) || [];
            return acc;
          }, {}),
        };
      }

      if (configDoc.social_proof_enabled) {
        const [companies, cities, roles] = await Promise.all([
          query("SELECT * FROM ui_social_proof_companies WHERE org_id = $1", [orgId]),
          query("SELECT * FROM ui_social_proof_cities WHERE org_id = $1", [orgId]),
          query("SELECT * FROM ui_social_proof_roles WHERE org_id = $1", [orgId]),
        ]);
        socialProofPayload = {
          socialProofCompanies: companies,
          socialProofCities: cities,
          socialProofRoles: roles,
        };
      }
    }

    // Fetch bot notes if memory recall is enabled and a leadId is provided
    let botNotes = "";
    if (configDoc?.memory_recall_enabled && payload.leadId) {
      const leadRow = await queryOne<{ bot_notes: string }>(
        "SELECT bot_notes FROM leads WHERE id = $1",
        [payload.leadId]
      );
      if (leadRow?.bot_notes) {
        botNotes = leadRow.bot_notes;
      }
    }

    // Build context
    const ctx = configDoc?.context_variables || configDoc?.contextVariables || {};
    const context = {
      customer_name: payload.contactName || "Customer",
      agent_name: ctx.agentName || payload.agentName || "Agent",
      company_name: ctx.companyName || payload.companyName || "",
      event_name: ctx.eventName || payload.eventName || "",
      event_host: ctx.eventHost || payload.eventHost || "",
      location: ctx.location || payload.location || "",
    };

    const host = request.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const callEndWebhookUrl = `${protocol}://${host}/api/call-ended${orgId ? `?orgId=${orgId}` : ""}`;

    // Read org settings (GHL + Plivo)
    let ghlWhatsappWebhookUrl = "";
    let ghlApiKey = "";
    let ghlLocationId = "";
    let plivoAuthId = "";
    let plivoAuthToken = "";
    let plivoPhoneNumber = "";
    if (orgId) {
      const orgRow = await queryOne<{ settings: Record<string, unknown> }>(
        "SELECT settings FROM organizations WHERE id = $1",
        [orgId]
      );
      if (orgRow) {
        const orgSettings = orgRow.settings as Record<string, string>;
        ghlWhatsappWebhookUrl = orgSettings?.ghlWhatsappWebhookUrl || "";
        ghlApiKey = orgSettings?.ghlApiKey || "";
        ghlLocationId = orgSettings?.ghlLocationId || "";
        plivoAuthId = orgSettings?.plivoAuthId || "";
        plivoAuthToken = orgSettings?.plivoAuthToken || "";
        plivoPhoneNumber = orgSettings?.plivoPhoneNumber || "";
      }
    }

    const callServerPayload: Record<string, unknown> = {
      phoneNumber: payload.phoneNumber,
      contactName: payload.contactName || "Customer",
      clientName: payload.clientName || "fwai",
      orgId,
      n8nWebhookUrl: N8N_TRANSCRIPT_WEBHOOK_URL,
      callEndWebhookUrl,
      context,
      ...botConfigPayload,
      ...personaPayload,
      ...productPayload,
      ...socialProofPayload,
      preResearchEnabled: configDoc?.pre_research_enabled ?? false,
      memoryRecallEnabled: configDoc?.memory_recall_enabled ?? false,
      ...(botNotes ? { botNotes } : {}),
      ...(payload.voice || configDoc?.voice ? { voice: payload.voice || configDoc?.voice } : {}),
    };

    if (ghlWhatsappWebhookUrl) callServerPayload.ghlWhatsappWebhookUrl = ghlWhatsappWebhookUrl;
    if (ghlApiKey) callServerPayload.ghlApiKey = ghlApiKey;
    if (ghlLocationId) callServerPayload.ghlLocationId = ghlLocationId;
    if (plivoAuthId && plivoAuthToken) {
      callServerPayload.plivoAuthId = plivoAuthId;
      callServerPayload.plivoAuthToken = plivoAuthToken;
    }
    if (plivoPhoneNumber) callServerPayload.plivoPhoneNumber = plivoPhoneNumber;

    const payloadJson = JSON.stringify(callServerPayload, null, 2);
    console.log("[API /api/call] Exact curl being sent:");
    console.log(`curl -X POST '${CALL_SERVER_URL}' -H 'Content-Type: application/json' -d '${JSON.stringify(callServerPayload)}'`);
    console.log("[API /api/call] Full payload:\n", payloadJson);

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
        callServerUrl: CALL_SERVER_URL,
        payloadSentToCallServer: callServerPayload,
        resolvedContext: context,
        botConfigFound: !!configDoc,
        contextVarsFromDb: ctx,
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
