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

    // Read current settings and merge to avoid overwriting existing fields
    const orgDoc = await db.collection("organizations").doc(orgId).get();
    const current = orgDoc.exists ? orgDoc.data()?.settings ?? {} : {};
    const merged = {
      ...current,
      ...settings,
      defaults: { ...(current.defaults ?? {}), ...(settings.defaults ?? {}) },
      appearance: { ...(current.appearance ?? {}), ...(settings.appearance ?? {}) },
      ai: { ...(current.ai ?? {}), ...(settings.ai ?? {}) },
    };

    await db.collection("organizations").doc(orgId).update({ settings: merged, updatedAt: new Date().toISOString() });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Settings API] POST error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
