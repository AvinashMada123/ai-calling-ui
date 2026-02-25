/**
 * Temporary admin endpoint to update bot config.
 * REMOVE THIS FILE after use.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get("x-admin-secret");
    if (secret !== "eph-temp-update-2026") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orgId, updates } = await request.json();
    const db = getAdminDb();

    // Find the active bot config for this org
    const snap = await db
      .collection("organizations")
      .doc(orgId)
      .collection("botConfigs")
      .where("isActive", "==", true)
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json({ error: "No active bot config found" }, { status: 404 });
    }

    const configRef = snap.docs[0].ref;
    const configId = snap.docs[0].id;

    // Strip undefined values
    const clean = JSON.parse(JSON.stringify(updates));

    // Get existing data and merge with updates, then set entirely
    const existing = snap.docs[0].data();
    const merged = { ...existing, ...clean, updatedAt: new Date().toISOString() };

    await configRef.set(merged);

    return NextResponse.json({ success: true, configId, fieldsUpdated: Object.keys(clean) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Admin Update Bot Config] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
