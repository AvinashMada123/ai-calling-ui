import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

async function getOrgId(request: NextRequest): Promise<{ orgId: string; uid: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const idToken = authHeader.slice(7);
  const decoded = await getAdminAuth().verifyIdToken(idToken);
  const db = getAdminDb();
  const userDoc = await db.collection("users").doc(decoded.uid).get();
  if (!userDoc.exists) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return { orgId: userDoc.data()!.orgId as string, uid: decoded.uid };
}

export async function GET(request: NextRequest) {
  try {
    const result = await getOrgId(request);
    if (result instanceof NextResponse) return result;
    const { orgId } = result;

    const db = getAdminDb();
    const snap = await db
      .collection("organizations")
      .doc(orgId)
      .collection("botConfigs")
      .get();

    const configs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ configs });
  } catch (error) {
    console.error("[Bot Configs API] GET error:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await getOrgId(request);
    if (result instanceof NextResponse) return result;
    const { orgId } = result;

    const body = await request.json();
    const { action } = body;
    const db = getAdminDb();
    const configsCol = db.collection("organizations").doc(orgId).collection("botConfigs");

    switch (action) {
      case "create": {
        const { config } = body;
        await configsCol.doc(config.id).set(config);
        return NextResponse.json({ success: true });
      }

      case "update": {
        const { configId, updates } = body;
        await configsCol.doc(configId).update({
          ...updates,
          updatedAt: new Date().toISOString(),
        });
        return NextResponse.json({ success: true });
      }

      case "delete": {
        const { configId } = body;
        await configsCol.doc(configId).delete();
        return NextResponse.json({ success: true });
      }

      case "setActive": {
        const { configId } = body;
        // Get all configs and batch update
        const snap = await configsCol.get();
        const batch = db.batch();
        for (const doc of snap.docs) {
          batch.update(doc.ref, { isActive: doc.id === configId });
        }
        await batch.commit();
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("[Bot Configs API] POST error:", error);
    return NextResponse.json({ error: "Failed to process" }, { status: 500 });
  }
}
