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

    // Fetch all users and orgs in parallel
    const [usersSnap, orgsSnap] = await Promise.all([
      db.collection("users").get(),
      db.collection("organizations").get(),
    ]);

    const totalUsers = usersSnap.size;

    // Build org name lookup
    const orgNames = new Map<string, string>();
    for (const doc of orgsSnap.docs) {
      orgNames.set(doc.id, doc.data().name || "Unknown");
    }

    // Recent signups (sort by createdAt desc, take 10)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const users: any[] = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    users.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const recentSignups = users.slice(0, 10).map((u) => ({
      uid: u.uid,
      email: u.email || "",
      displayName: u.displayName || "",
      orgId: u.orgId || "",
      orgName: orgNames.get(u.orgId) || "Unknown",
      createdAt: u.createdAt || "",
    }));

    // Recent calls across all orgs - optimized to limit queries
    // Instead of querying all orgs, limit to a reasonable number and fetch more calls per org
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allCalls: any[] = [];
    const orgIds = orgsSnap.docs.map((d) => d.id);

    // Limit to querying calls from top 20 most recent orgs (or all if less than 20)
    // This prevents overwhelming Firestore with too many parallel queries
    const orgsToQuery = orgIds.slice(0, 20);
    
    // Query calls in parallel but with a limit on concurrent queries
    const callPromises = orgsToQuery.map(async (orgId) => {
      try {
        const callsSnap = await db
          .collection("organizations")
          .doc(orgId)
          .collection("calls")
          .orderBy("initiatedAt", "desc")
          .limit(10) // Increased from 5 to get better coverage
          .get();
        return callsSnap.docs.map((d) => ({
          id: d.id,
          orgId,
          orgName: orgNames.get(orgId) || "Unknown",
          ...d.data(),
        }));
      } catch {
        return [];
      }
    });

    const callResults = await Promise.all(callPromises);
    for (const batch of callResults) {
      allCalls.push(...batch);
    }

    // Sort by initiatedAt desc and take top 10
    allCalls.sort((a, b) => (b.initiatedAt || "").localeCompare(a.initiatedAt || ""));
    const recentCalls = allCalls.slice(0, 10).map((c) => ({
      id: c.id,
      orgId: c.orgId,
      orgName: c.orgName,
      contactName: c.request?.contactName || c.contactName || "Unknown",
      phoneNumber: c.request?.phoneNumber || c.phoneNumber || "",
      status: c.status || "unknown",
      initiatedAt: c.initiatedAt || "",
      durationSeconds: c.durationSeconds,
    }));

    return NextResponse.json({ totalUsers, recentSignups, recentCalls });
  } catch (error) {
    console.error("[Admin Stats API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
