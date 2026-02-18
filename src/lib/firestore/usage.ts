import { doc, getDoc, setDoc, updateDoc, collection, getDocs, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { UsageRecord } from "@/types/billing";

function getYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

export async function getMonthlyUsage(orgId: string, yearMonth?: string): Promise<UsageRecord | null> {
  const period = yearMonth || getYearMonth();
  const snap = await getDoc(doc(db, "organizations", orgId, "usage", period));
  if (!snap.exists()) return null;
  return snap.data() as UsageRecord;
}

export async function getUsageRange(orgId: string, months: string[]): Promise<UsageRecord[]> {
  const results: UsageRecord[] = [];
  for (const m of months) {
    const usage = await getMonthlyUsage(orgId, m);
    if (usage) results.push(usage);
  }
  return results;
}

export async function getAllOrgsUsage(yearMonth?: string): Promise<UsageRecord[]> {
  // This reads all organizations then their usage for the given month
  const orgsSnap = await getDocs(collection(db, "organizations"));
  const period = yearMonth || getYearMonth();
  
  // Fetch all usage records in parallel instead of sequentially
  const usagePromises = orgsSnap.docs.map(async (orgDoc) => {
    const usageSnap = await getDoc(doc(db, "organizations", orgDoc.id, "usage", period));
    if (usageSnap.exists()) {
      return { orgId: orgDoc.id, ...usageSnap.data() } as UsageRecord;
    }
    return null;
  });
  
  const results = await Promise.all(usagePromises);
  return results.filter((r): r is UsageRecord => r !== null);
}

export async function incrementUsage(
  orgId: string,
  durationSeconds: number,
  qualification?: "HOT" | "WARM" | "COLD"
): Promise<void> {
  const period = getYearMonth();
  const today = getToday();
  const ref = doc(db, "organizations", orgId, "usage", period);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    // Create new usage doc
    const newUsage: UsageRecord = {
      orgId,
      period,
      totalCalls: 1,
      completedCalls: 1,
      failedCalls: 0,
      totalSeconds: durationSeconds,
      totalMinutes: Math.round((durationSeconds / 60) * 100) / 100,
      hotLeads: qualification === "HOT" ? 1 : 0,
      warmLeads: qualification === "WARM" ? 1 : 0,
      coldLeads: qualification === "COLD" ? 1 : 0,
      dailyBreakdown: {
        [today]: { calls: 1, minutes: Math.round((durationSeconds / 60) * 100) / 100, completed: 1 },
      },
      updatedAt: new Date().toISOString(),
    };
    await setDoc(ref, newUsage);
  } else {
    // Increment existing
    const updates: Record<string, unknown> = {
      totalCalls: increment(1),
      completedCalls: increment(1),
      totalSeconds: increment(durationSeconds),
      totalMinutes: increment(Math.round((durationSeconds / 60) * 100) / 100),
      updatedAt: new Date().toISOString(),
      [`dailyBreakdown.${today}.calls`]: increment(1),
      [`dailyBreakdown.${today}.minutes`]: increment(Math.round((durationSeconds / 60) * 100) / 100),
      [`dailyBreakdown.${today}.completed`]: increment(1),
    };
    if (qualification === "HOT") updates.hotLeads = increment(1);
    else if (qualification === "WARM") updates.warmLeads = increment(1);
    else if (qualification === "COLD") updates.coldLeads = increment(1);
    await updateDoc(ref, updates);
  }
}
