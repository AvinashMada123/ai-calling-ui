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
    const snap = await db.collection("organizations").doc(orgId).collection("calls").orderBy("initiatedAt", "desc").get();
    const calls = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ calls });
  } catch (error) {
    console.error("[Calls API] GET error:", error);
    return NextResponse.json({ calls: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { uid, orgId } = await getUidAndOrg(request);
    const db = getAdminDb();
    const body = await request.json();
    const { action, ...data } = body;

    if (action === "add") {
      const ref = db.collection("organizations").doc(orgId).collection("calls").doc(data.call.id || undefined);
      const call = { ...data.call, initiatedBy: uid };
      await ref.set(call);
      return NextResponse.json({ success: true });
    }

    if (action === "update") {
      const ref = db.collection("organizations").doc(orgId).collection("calls").doc(data.id);
      await ref.update(data.updates);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, message: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[Calls API] POST error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
