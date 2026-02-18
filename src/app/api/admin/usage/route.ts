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

// Helper to batch promises and avoid overwhelming Firestore
async function batchProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 20
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  return results;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifySuperAdmin(request);
    if ("error" in auth) return auth.error;
    const { db } = auth;

    // Fetch organizations with limit for faster response
    const orgsSnap = await db
      .collection("organizations")
      .limit(50) // Only process first 50 orgs for speed
      .get();
    
    // Build org map
    const orgMap = new Map<string, { name: string }>();
    for (const doc of orgsSnap.docs) {
      const data = doc.data();
      orgMap.set(doc.id, {
        name: data.name || "Unknown",
      });
    }

    // Fetch usage records in smaller batches for faster response
    const period = getYearMonth();
    const orgDocs = orgsSnap.docs;
    
    // Process all fetched orgs (max 50)
    const usageRecords = await batchProcess(
      orgDocs,
      async (orgDoc) => {
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
              completedCalls: data?.completedCalls || 0,
              failedCalls: data?.failedCalls || 0,
            };
          }
          return {
            orgId: orgDoc.id,
            totalCalls: 0,
            totalMinutes: 0,
            completedCalls: 0,
            failedCalls: 0,
          };
        } catch {
          return {
            orgId: orgDoc.id,
            totalCalls: 0,
            totalMinutes: 0,
            completedCalls: 0,
            failedCalls: 0,
          };
        }
      },
      5 // Very small batch size: 5 at a time for fastest response
    );

    // Build result rows
    const rows = usageRecords.map((u) => {
      const org = orgMap.get(u.orgId);
      return {
        orgId: u.orgId,
        orgName: org?.name || "Unknown",
        totalCalls: u.totalCalls,
        totalMinutes: Math.round(u.totalMinutes * 100) / 100,
        completedCalls: u.completedCalls,
        failedCalls: u.failedCalls,
      };
    });

    // Sort by total calls descending
    rows.sort((a, b) => b.totalCalls - a.totalCalls);

    return NextResponse.json({ rows });
  } catch (error) {
    console.error("[Admin Usage API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
