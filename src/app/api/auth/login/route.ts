import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

const SESSION_COOKIE_NAME = "__session";
const SESSION_EXPIRY = 60 * 60 * 24 * 14 * 1000; // 14 days

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json(
        { success: false, message: "Missing ID token" },
        { status: 400 }
      );
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);

    // Fetch profile + update last login in parallel
    const adminDb = getAdminDb();
    const userRef = adminDb.collection("users").doc(decoded.uid);
    const [userDoc, sessionCookie] = await Promise.all([
      userRef.get(),
      adminAuth.createSessionCookie(idToken, { expiresIn: SESSION_EXPIRY }),
    ]);

    // Update last login (fire-and-forget)
    userRef.update({ lastLoginAt: new Date().toISOString() }).catch(() => {});

    if (!userDoc.exists) {
      return NextResponse.json(
        { success: false, message: "Account setup incomplete. Please sign up or ask your admin to send an invite." },
        { status: 403 }
      );
    }

    const profile = { uid: decoded.uid, ...userDoc.data() };

    const response = NextResponse.json({ success: true, profile });

    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_EXPIRY / 1000,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[Login API] Error:", error);
    const message =
      error instanceof Error ? error.message : "Login failed";
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
