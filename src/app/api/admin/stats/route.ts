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

function getYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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
    const totalOrgs = orgsSnap.size;

    // Build org name and plan lookup
    const orgMap = new Map<string, { name: string; plan: string }>();
    for (const doc of orgsSnap.docs) {
      const data = doc.data();
      orgMap.set(doc.id, {
        name: data.name || "Unknown",
        plan: data.plan || "free",
      });
    }

    // Recent signups (sort by createdAt desc, take 10)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const users: any[] = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    users.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const recentSignups = users.slice(0, 10).map((u) => {
      const org = orgMap.get(u.orgId || "");
      return {
        uid: u.uid,
        email: u.email || "",
        displayName: u.displayName || "",
        orgId: u.orgId || "",
        orgName: org?.name || "Unknown",
        createdAt: u.createdAt || "",
      };
    });

    // Fetch usage records for current month in parallel (server-side, much faster)
    const period = getYearMonth();
    const usagePromises = orgsSnap.docs.map(async (orgDoc) => {
      try {
        const usageSnap = await db
          .collection("organizations")
          .doc(orgDoc.id)
          .collection("usage")
          .doc(period)
          .get();
        if (usageSnap.exists()) {
          const data = usageSnap.data();
          return {
            orgId: orgDoc.id,
            totalCalls: data?.totalCalls || 0,
            totalMinutes: data?.totalMinutes || 0,
          };
        }
        return { orgId: orgDoc.id, totalCalls: 0, totalMinutes: 0 };
      } catch {
        return { orgId: orgDoc.id, totalCalls: 0, totalMinutes: 0 };
      }
    });

    const usageRecords = await Promise.all(usagePromises);
    const totalCalls = usageRecords.reduce((sum, u) => sum + (u.totalCalls || 0), 0);
    const totalMinutes = usageRecords.reduce((sum, u) => sum + (u.totalMinutes || 0), 0);

    // Build top clients
    const topClients = usageRecords
      .filter((u) => u.totalCalls > 0)
      .sort((a, b) => b.totalCalls - a.totalCalls)
      .slice(0, 5)
      .map((u) => {
        const org = orgMap.get(u.orgId);
        return {
          orgId: u.orgId,
          name: org?.name || "Unknown",
          totalCalls: u.totalCalls,
          totalMinutes: Math.round((u.totalMinutes || 0) * 100) / 100,
          plan: org?.plan || "free",
        };
      });

    // Recent calls - only query from top 10 orgs by call count to save time
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allCalls: any[] = [];
    const topOrgIds = usageRecords
      .filter((u) => u.totalCalls > 0)
      .sort((a, b) => b.totalCalls - a.totalCalls)
      .slice(0, 10)
      .map((u) => u.orgId);

    // Query calls from top orgs only (limit to 5 calls per org for speed)
    const callPromises = topOrgIds.map(async (orgId) => {
      try {
        const callsSnap = await db
          .collection("organizations")
          .doc(orgId)
          .collection("calls")
          .orderBy("initiatedAt", "desc")
          .limit(5)
          .get();
        const org = orgMap.get(orgId);
        return callsSnap.docs.map((d) => ({
          id: d.id,
          orgId,
          orgName: org?.name || "Unknown",
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

    return NextResponse.json({
      totalUsers,
      totalOrgs,
      totalCallsThisMonth: totalCalls,
      totalMinutesThisMonth: Math.round(totalMinutes * 100) / 100,
      recentSignups,
      recentCalls,
      topClients,
    });
  } catch (error) {
    console.error("[Admin Stats API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
