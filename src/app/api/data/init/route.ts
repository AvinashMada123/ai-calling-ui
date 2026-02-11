import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const db = getAdminDb();

    // Get user profile
    const userDoc = await db.collection("users").doc(decoded.uid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const profile = { uid: decoded.uid, ...userDoc.data() };
    const orgId = userDoc.data()!.orgId as string;

    // Fetch org settings, leads, and calls in parallel
    const [orgDoc, leadsSnap, callsSnap] = await Promise.all([
      db.collection("organizations").doc(orgId).get(),
      db.collection("organizations").doc(orgId).collection("leads").orderBy("createdAt", "desc").get(),
      db.collection("organizations").doc(orgId).collection("calls").orderBy("initiatedAt", "desc").get(),
    ]);

    const settings = orgDoc.exists ? orgDoc.data()?.settings || {} : {};
    const leads = leadsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const calls = callsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ profile, settings, leads, calls });
  } catch (error) {
    console.error("[Init API] Error:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}
