import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

async function getUidAndOrg(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const idToken = authHeader.slice(7);
  const decoded = await getAdminAuth().verifyIdToken(idToken);
  const userDoc = await getAdminDb().collection("users").doc(decoded.uid).get();
  if (!userDoc.exists) throw new Error("User not found");
  const orgId = userDoc.data()!.orgId;
  return { uid: decoded.uid, orgId };
}

export async function GET(request: NextRequest) {
  try {
    const { orgId } = await getUidAndOrg(request);
    const db = getAdminDb();
    const snap = await db.collection("organizations").doc(orgId).collection("leads").orderBy("createdAt", "desc").get();
    const leads = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ leads });
  } catch (error) {
    console.error("[Leads API] GET error:", error);
    return NextResponse.json({ leads: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { uid, orgId } = await getUidAndOrg(request);
    const db = getAdminDb();
    const body = await request.json();
    const { action, ...data } = body;

    if (action === "add") {
      const ref = db.collection("organizations").doc(orgId).collection("leads").doc();
      const lead = {
        ...data.lead,
        id: ref.id,
        createdBy: uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await ref.set(lead);
      return NextResponse.json({ success: true, lead });
    }

    if (action === "addBulk") {
      const batch = db.batch();
      const leads: Record<string, unknown>[] = [];
      for (const item of data.leads) {
        const ref = db.collection("organizations").doc(orgId).collection("leads").doc();
        const lead = {
          ...item,
          id: ref.id,
          createdBy: uid,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        batch.set(ref, lead);
        leads.push(lead);
      }
      await batch.commit();
      return NextResponse.json({ success: true, leads });
    }

    if (action === "update") {
      const ref = db.collection("organizations").doc(orgId).collection("leads").doc(data.id);
      await ref.update({ ...data.updates, updatedAt: new Date().toISOString() });
      return NextResponse.json({ success: true });
    }

    if (action === "delete") {
      const batch = db.batch();
      for (const id of data.ids) {
        batch.delete(db.collection("organizations").doc(orgId).collection("leads").doc(id));
      }
      await batch.commit();
      return NextResponse.json({ success: true });
    }

    if (action === "incrementCallCount") {
      const { FieldValue } = await import("firebase-admin/firestore");
      const ref = db.collection("organizations").doc(orgId).collection("leads").doc(data.id);
      await ref.update({
        callCount: FieldValue.increment(1),
        lastCallDate: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, message: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[Leads API] POST error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
