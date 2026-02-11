import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ profile: null }, { status: 401 });
    }

    const idToken = authHeader.slice(7);
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);

    const adminDb = getAdminDb();
    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();

    if (!userDoc.exists) {
      return NextResponse.json({ profile: null });
    }

    return NextResponse.json({
      profile: { uid: decoded.uid, ...userDoc.data() },
    });
  } catch (error) {
    console.error("[Auth/Me] Error:", error);
    return NextResponse.json({ profile: null }, { status: 401 });
  }
}
