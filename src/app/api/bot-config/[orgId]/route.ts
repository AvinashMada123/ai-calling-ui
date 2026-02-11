import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;

    // Simple API key auth (from query param)
    const apiKey = request.nextUrl.searchParams.get("apiKey");

    // Fetch org to verify it exists
    const orgDoc = await adminDb.collection("organizations").doc(orgId).get();
    if (!orgDoc.exists) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // Fetch active bot config
    const configsSnap = await adminDb
      .collection("organizations")
      .doc(orgId)
      .collection("botConfigs")
      .where("isActive", "==", true)
      .limit(1)
      .get();

    if (configsSnap.empty) {
      return NextResponse.json({ error: "No active bot config" }, { status: 404 });
    }

    const config = configsSnap.docs[0].data();
    const orgData = orgDoc.data();
    const settings = orgData?.settings?.defaults || {};

    // Format for n8n consumption
    const response = {
      prompt: config.prompt,
      questions: config.questions.sort((a: any, b: any) => a.order - b.order).map((q: any) => ({
        id: q.id,
        prompt: q.prompt,
      })),
      objections: Object.fromEntries(
        (config.objections || []).map((o: any) => [o.key, o.response])
      ),
      objectionKeywords: config.objectionKeywords || Object.fromEntries(
        (config.objections || []).map((o: any) => [o.key, o.keywords])
      ),
      context: {
        agent_name: settings.agentName || "Agent",
        company_name: settings.companyName || orgData?.name || "",
        event_host: settings.eventHost || "",
        location: settings.location || "",
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[API /api/bot-config] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch bot config" },
      { status: 500 }
    );
  }
}
