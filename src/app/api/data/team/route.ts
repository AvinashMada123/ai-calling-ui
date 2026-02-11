import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

async function getOrgId(request: NextRequest): Promise<{ orgId: string; uid: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const idToken = authHeader.slice(7);
  const decoded = await getAdminAuth().verifyIdToken(idToken);
  const db = getAdminDb();
  const userDoc = await db.collection("users").doc(decoded.uid).get();
  if (!userDoc.exists) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return { orgId: userDoc.data()!.orgId as string, uid: decoded.uid };
}

export async function GET(request: NextRequest) {
  try {
    const result = await getOrgId(request);
    if (result instanceof NextResponse) return result;
    const { orgId } = result;

    const db = getAdminDb();
    const snap = await db
      .collection("users")
      .where("orgId", "==", orgId)
      .get();

    const members = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    return NextResponse.json({ members });
  } catch (error) {
    console.error("[Team API] GET error:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await getOrgId(request);
    if (result instanceof NextResponse) return result;
    const { orgId, uid } = result;

    const body = await request.json();
    const { action } = body;
    const db = getAdminDb();

    switch (action) {
      case "invite": {
        const { email, role } = body;
        // Get org name
        const orgDoc = await db.collection("organizations").doc(orgId).get();
        const orgName = orgDoc.exists ? orgDoc.data()?.name ?? "Organization" : "Organization";

        const inviteId = crypto.randomUUID();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

        await db.collection("invites").doc(inviteId).set({
          email: email.trim().toLowerCase(),
          orgId,
          orgName,
          role,
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
    console.error("[Team API] POST error:", error);
    return NextResponse.json({ error: "Failed to process" }, { status: 500 });
  }
}
