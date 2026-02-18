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

const COST_PER_MINUTE = 0.10;

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

    // Fetch organizations (single query, fast)
    const orgsSnap = await db.collection("organizations").get();
    
    // Build org map with plan info
    const orgMap = new Map<string, { name: string; plan: string }>();
    for (const doc of orgsSnap.docs) {
      const data = doc.data();
      orgMap.set(doc.id, {
        name: data.name || "Unknown",
        plan: data.plan || "free",
      });
    }

    // Fetch usage records in batches
    const period = getYearMonth();
    const orgDocs = orgsSnap.docs;
    
    // Limit to prevent timeout
    const maxOrgs = 200;
    const orgsToProcess = orgDocs.slice(0, maxOrgs);
    
    const usageRecords = await batchProcess(
      orgsToProcess,
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
              totalMinutes: data?.totalMinutes || 0,
            };
          }
          return { orgId: orgDoc.id, totalMinutes: 0 };
        } catch {
          return { orgId: orgDoc.id, totalMinutes: 0 };
        }
      },
      20
    );

    // Build result rows
    const rows = usageRecords.map((u) => {
      const org = orgMap.get(u.orgId);
      const minutes = Math.round(u.totalMinutes * 100) / 100;
      return {
        orgId: u.orgId,
        orgName: org?.name || "Unknown",
        plan: org?.plan || "free",
        minutesUsed: minutes,
        estimatedCost: Math.round(minutes * COST_PER_MINUTE * 100) / 100,
      };
    });

    // Sort by estimated cost descending
    rows.sort((a, b) => b.estimatedCost - a.estimatedCost);

    return NextResponse.json({ rows });
  } catch (error) {
    console.error("[Admin Billing API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

