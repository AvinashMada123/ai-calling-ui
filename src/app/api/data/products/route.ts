import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

const BACKEND_BASE_URL = (
  process.env.CALL_SERVER_URL || "http://34.93.142.172:3001/call/conversational"
).replace(/\/call\/conversational$/, "");

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
      .collection("organizations").doc(orgId)
      .collection("productSections")
      .get();

    const sections = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ sections });
  } catch (error) {
    console.error("[Products API] GET error:", error);
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
      case "upload": {
        const { text } = body;
        // Proxy to backend for AI processing
        const res = await fetch(`${BACKEND_BASE_URL}/products/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, orgId }),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error("[Products API] Backend upload error:", res.status, errText);
          return NextResponse.json(
            { error: `Backend returned ${res.status}` },
            { status: 502 }
          );
        }

        const data = await res.json();
        const sections = data.sections || [];

        // Save each section to Firestore
        const batch = db.batch();
        for (const section of sections) {
          const id = section.id || `sec_${crypto.randomUUID().slice(0, 8)}`;
          const ref = orgRef.collection("productSections").doc(id);
          batch.set(ref, {
            ...section,
            id,
            updatedAt: new Date().toISOString(),
          });
        }
        await batch.commit();

        // Return the saved sections
        const snap = await orgRef.collection("productSections").get();
        const savedSections = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        return NextResponse.json({ success: true, sections: savedSections });
      }

      case "createSection": {
        const { section } = body;
        const ref = orgRef.collection("productSections").doc(section.id);
        await ref.set({ ...section, updatedAt: new Date().toISOString() });
        return NextResponse.json({ success: true });
      }

      case "updateSection": {
        const { sectionId, updates } = body;
        await orgRef.collection("productSections").doc(sectionId).update({
          ...updates,
          updatedAt: new Date().toISOString(),
        });
        return NextResponse.json({ success: true });
      }

      case "deleteSection": {
        const { sectionId } = body;
        await orgRef.collection("productSections").doc(sectionId).delete();
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("[Products API] POST error:", error);
    return NextResponse.json({ error: "Failed to process" }, { status: 500 });
  }
}
