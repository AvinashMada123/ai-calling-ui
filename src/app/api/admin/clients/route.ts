import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

async function verifySuperAdmin(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const idToken = authHeader.slice(7);
  const decoded = await getAdminAuth().verifyIdToken(idToken);
  const db = getAdminDb();
  const userDoc = await db.collection("users").doc(decoded.uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== "super_admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { uid: decoded.uid, db };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifySuperAdmin(request);
    if ("error" in auth) return auth.error;
    const { db } = auth;

    // Fetch organizations with limit for faster response
    // Use limit to prevent loading too many at once
    const orgsSnap = await db
      .collection("organizations")
      .orderBy("createdAt", "desc")
      .limit(500) // Limit to 500 for performance
      .get();
    
    const orgs = orgsSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || "Unknown",
        slug: data.slug || "",
        plan: data.plan || "free",
        status: data.status || "active",
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
      };
    });

    return NextResponse.json({ orgs });
  } catch (error) {
    console.error("[Admin Clients API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
