import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { DEFAULT_BOT_CONFIG } from "@/lib/default-bot-config";

const SESSION_COOKIE_NAME = "__session";
const SESSION_EXPIRY = 60 * 60 * 24 * 14 * 1000; // 14 days

export async function POST(request: NextRequest) {
  try {
    const { idToken, displayName, orgName, inviteId } = await request.json();

    if (!idToken || !displayName) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify the ID token to get user info
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;
    const email = decoded.email || "";

    const adminDb = getAdminDb();
    const now = new Date().toISOString();
    let orgId: string;
    let role = "client_admin";

    if (inviteId) {
      // Invite flow: join existing org
      const inviteDoc = await adminDb.collection("invites").doc(inviteId).get();
      if (!inviteDoc.exists) {
        return NextResponse.json(
          { success: false, message: "Invite not found" },
          { status: 400 }
        );
      }
      const invite = inviteDoc.data()!;
      if (invite.status !== "pending") {
        return NextResponse.json(
          { success: false, message: "Invite already used" },
          { status: 400 }
        );
      }
      if (invite.email !== email) {
        return NextResponse.json(
          { success: false, message: "Email does not match invite" },
          { status: 400 }
        );
      }
      orgId = invite.orgId;
      role = invite.role || "client_user";

      // Mark invite as accepted
      await adminDb.collection("invites").doc(inviteId).update({
        status: "accepted",
        acceptedAt: now,
      });

      // Create user profile
      await adminDb.collection("users").doc(uid).set({
        email,
        displayName,
        role,
        orgId,
        status: "active",
        createdAt: now,
        lastLoginAt: now,
        invitedBy: invite.invitedBy,
      });
    } else {
      // Normal signup: create new org
      if (!orgName) {
        return NextResponse.json(
          { success: false, message: "Organization name is required" },
          { status: 400 }
        );
      }

      const orgSlug = orgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      const orgRef = adminDb.collection("organizations").doc();
      orgId = orgRef.id;

      await orgRef.set({
        name: orgName,
        slug: orgSlug,
        plan: "free",
        status: "active",
        webhookUrl: "",
        createdBy: uid,
        createdAt: now,
        updatedAt: now,
        settings: {
          defaults: {
            clientName: orgSlug,
            agentName: "Agent",
            companyName: orgName,
            eventName: "",
            eventHost: "",
            voice: "Puck",
            location: "",
          },
          appearance: {
            sidebarCollapsed: false,
            animationsEnabled: true,
          },
          ai: {
            autoQualify: true,
          },
        },
      });

      // Create user profile
      await adminDb.collection("users").doc(uid).set({
        email,
        displayName,
        role,
        orgId,
        status: "active",
        createdAt: now,
        lastLoginAt: now,
      });

      // Seed default bot config for the new organization
      const botConfigId = crypto.randomUUID();
      await adminDb
        .collection("organizations")
        .doc(orgId)
        .collection("botConfigs")
        .doc(botConfigId)
        .set({
          ...DEFAULT_BOT_CONFIG,
          id: botConfigId,
          createdAt: now,
          updatedAt: now,
          createdBy: uid,
        });
    }

    // Create session cookie
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRY,
    });

    const profile = {
      uid,
      email,
      displayName,
      role,
      orgId,
      status: "active",
      createdAt: now,
      lastLoginAt: now,
    };

    const response = NextResponse.json({
      success: true,
      orgId,
      profile,
    });

    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_EXPIRY / 1000,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[Signup API] Error:", error);
    const message =
      error instanceof Error ? error.message : "Signup failed";
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
