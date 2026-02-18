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
    const orgRef = db.collection("organizations").doc(orgId);

    const [personasSnap, situationsSnap] = await Promise.all([
      orgRef.collection("personas").get(),
      orgRef.collection("situations").get(),
    ]);

    const personas = personasSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const situations = situationsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ personas, situations });
  } catch (error) {
    console.error("[Personas API] GET error:", error);
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
    const orgRef = db.collection("organizations").doc(orgId);

    switch (action) {
      case "createPersona": {
        const { persona } = body;
        const ref = orgRef.collection("personas").doc(persona.id);
        await ref.set({ ...persona, updatedAt: new Date().toISOString() });
        return NextResponse.json({ success: true });
      }
      case "updatePersona": {
        const { personaId, updates } = body;
        await orgRef.collection("personas").doc(personaId).update({
          ...updates,
          updatedAt: new Date().toISOString(),
        });
        return NextResponse.json({ success: true });
      }
      case "deletePersona": {
        const { personaId } = body;
        await orgRef.collection("personas").doc(personaId).delete();
        return NextResponse.json({ success: true });
      }
      case "createSituation": {
        const { situation } = body;
        const ref = orgRef.collection("situations").doc(situation.id);
        await ref.set({ ...situation, updatedAt: new Date().toISOString() });
        return NextResponse.json({ success: true });
      }
      case "updateSituation": {
        const { situationId, updates } = body;
        await orgRef.collection("situations").doc(situationId).update({
          ...updates,
          updatedAt: new Date().toISOString(),
        });
        return NextResponse.json({ success: true });
      }
      case "deleteSituation": {
        const { situationId } = body;
        await orgRef.collection("situations").doc(situationId).delete();
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("[Personas API] POST error:", error);
    return NextResponse.json({ error: "Failed to process" }, { status: 500 });
  }
}
