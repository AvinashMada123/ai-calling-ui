import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

async function getOrgId(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const idToken = authHeader.slice(7);
  const decoded = await getAdminAuth().verifyIdToken(idToken);
  const userDoc = await getAdminDb().collection("users").doc(decoded.uid).get();
  if (!userDoc.exists) throw new Error("User not found");
  return userDoc.data()!.orgId as string;
}

export async function GET(request: NextRequest) {
  try {
    const orgId = await getOrgId(request);
    const db = getAdminDb();
    const orgDoc = await db.collection("organizations").doc(orgId).get();
    const settings = orgDoc.exists ? orgDoc.data()?.settings || {} : {};
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("[Settings API] GET error:", error);
    return NextResponse.json({ settings: {} }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getOrgId(request);
    const db = getAdminDb();
    const { settings } = await request.json();

    // Firestore rejects undefined values — strip them before saving
    const clean = JSON.parse(JSON.stringify(settings));

    // Use set with merge to handle cases where the org doc may not have a settings field yet
    await db.collection("organizations").doc(orgId).set(
      { settings: clean, updatedAt: new Date().toISOString() },
      { merge: true }
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Settings API] POST error:", msg, error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
