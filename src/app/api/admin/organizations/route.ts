import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { DEFAULT_BOT_CONFIG } from "@/lib/default-bot-config";

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

export async function POST(request: NextRequest) {
  try {
    const auth = await verifySuperAdmin(request);
    if ("error" in auth) return auth.error;
    const { uid, db } = auth;

    const body = await request.json();
    const { action } = body;

    switch (action) {
      case "create": {
        const { orgName, plan, adminEmail } = body;
        if (!orgName?.trim()) {
          return NextResponse.json({ error: "Organization name is required" }, { status: 400 });
        }

        const now = new Date().toISOString();
        const orgSlug = orgName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

        const orgRef = db.collection("organizations").doc();
        const orgId = orgRef.id;

        await orgRef.set({
          name: orgName.trim(),
          slug: orgSlug,
          plan: plan || "free",
          status: "active",
          webhookUrl: "",
          createdBy: uid,
          createdAt: now,
          updatedAt: now,
          settings: {
            defaults: {
              clientName: orgSlug,
              agentName: "Agent",
              companyName: orgName.trim(),
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

        // Seed default bot config
        const botConfigId = crypto.randomUUID();
        await db
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

        // Optionally invite an admin
        let inviteId: string | undefined;
        if (adminEmail?.trim()) {
          inviteId = crypto.randomUUID();
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          await db.collection("invites").doc(inviteId).set({
            email: adminEmail.trim().toLowerCase(),
            orgId,
            orgName: orgName.trim(),
            role: "client_admin",
            invitedBy: uid,
            status: "pending",
            createdAt: now,
            expiresAt: expiresAt.toISOString(),
          });
        }

        return NextResponse.json({ success: true, orgId, inviteId });
      }

      case "update": {
        const { orgId, updates } = body;
        if (!orgId) {
          return NextResponse.json({ error: "orgId is required" }, { status: 400 });
        }

        // Only allow plan and status updates
        const allowed: Record<string, unknown> = {};
        if (updates?.plan) allowed.plan = updates.plan;
        if (updates?.status) allowed.status = updates.status;

        await db.collection("organizations").doc(orgId).update({
          ...allowed,
          updatedAt: new Date().toISOString(),
        });

        return NextResponse.json({ success: true });
      }

      case "invite": {
        const { orgId, email, role } = body;
        if (!orgId || !email?.trim()) {
          return NextResponse.json({ error: "orgId and email are required" }, { status: 400 });
        }

        const orgDoc = await db.collection("organizations").doc(orgId).get();
        const orgName = orgDoc.exists ? orgDoc.data()?.name ?? "Organization" : "Organization";

        const inviteId = crypto.randomUUID();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        await db.collection("invites").doc(inviteId).set({
          email: email.trim().toLowerCase(),
          orgId,
          orgName,
          role: role || "client_user",
          invitedBy: uid,
          status: "pending",
          createdAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
        });

        return NextResponse.json({ success: true, inviteId });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("[Admin Org API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
