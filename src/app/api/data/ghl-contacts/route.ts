import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

const GHL_API_BASE = "https://services.leadconnectorhq.com";

async function getUidAndOrg(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const idToken = authHeader.slice(7);
  const decoded = await getAdminAuth().verifyIdToken(idToken);
  const userDoc = await getAdminDb().collection("users").doc(decoded.uid).get();
  if (!userDoc.exists) throw new Error("User not found");
  const orgId = userDoc.data()!.orgId;
  return { uid: decoded.uid, orgId };
}

async function getOrgSettings(orgId: string) {
  const db = getAdminDb();
  const orgDoc = await db.collection("organizations").doc(orgId).get();
  return orgDoc.exists ? orgDoc.data()?.settings || {} : {};
}

export async function GET(request: NextRequest) {
  try {
    const { orgId } = await getUidAndOrg(request);
    const settings = await getOrgSettings(orgId);

    return NextResponse.json({
      configured: !!(settings.ghlApiKey && settings.ghlLocationId),
      ghlLocationId: settings.ghlLocationId || "",
      lastSyncAt: settings.ghlLastSyncAt || null,
    });
  } catch (error) {
    console.error("[GHL API] GET error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { orgId } = await getUidAndOrg(request);
    const body = await request.json();
    const { action } = body;

    const settings = await getOrgSettings(orgId);
    const ghlApiKey = settings.ghlApiKey;
    const ghlLocationId = settings.ghlLocationId;

    if (!ghlApiKey || !ghlLocationId) {
      return NextResponse.json(
        { success: false, message: "GHL API Key and Location ID must be configured in Settings" },
        { status: 400 }
      );
    }

    const headers = {
      Authorization: `Bearer ${ghlApiKey}`,
      Version: "2021-07-28",
      Accept: "application/json",
    };

    if (action === "fetchTags") {
      const res = await fetch(`${GHL_API_BASE}/locations/${ghlLocationId}/tags`, { headers });
      if (!res.ok) {
        return NextResponse.json({ success: false, message: `GHL API error: ${res.status}` }, { status: 502 });
      }
      const data = await res.json();
      return NextResponse.json({ success: true, tags: data.tags || [] });
    }

    if (action === "sync") {
      const db = getAdminDb();
      const leadsCol = db.collection("organizations").doc(orgId).collection("leads");

      // Fetch contacts from GHL with pagination
      let allContacts: Record<string, unknown>[] = [];
      let startAfterId: string | undefined;
      let hasMore = true;

      while (hasMore && allContacts.length < 1000) {
        const url = new URL(`${GHL_API_BASE}/contacts/`);
        url.searchParams.set("locationId", ghlLocationId);
        url.searchParams.set("limit", "100");
        if (startAfterId) url.searchParams.set("startAfterId", startAfterId);
        if (body.tags?.length) url.searchParams.set("query", body.tags.join(","));

        const res = await fetch(url.toString(), { headers });
        if (!res.ok) {
          return NextResponse.json(
            { success: false, message: `GHL API error: ${res.status}` },
            { status: 502 }
          );
        }

        const data = await res.json();
        const contacts = data.contacts || [];
        allContacts = allContacts.concat(contacts);

        if (contacts.length < 100) {
          hasMore = false;
        } else {
          startAfterId = contacts[contacts.length - 1].id;
        }
      }

      // Upsert contacts as leads in Firestore
      // First, build a map of existing GHL contacts to avoid duplicates
      const existingSnap = await leadsCol.where("source", "==", "ghl").get();
      const existingByGhlId = new Map<string, string>();
      for (const doc of existingSnap.docs) {
        const d = doc.data();
        if (d.ghlContactId) existingByGhlId.set(d.ghlContactId, doc.id);
      }

      let created = 0;
      let updated = 0;
      const BATCH_SIZE = 500;

      for (let i = 0; i < allContacts.length; i += BATCH_SIZE) {
        const chunk = allContacts.slice(i, i + BATCH_SIZE);
        const batch = db.batch();

        for (const contact of chunk) {
          const c = contact as Record<string, string | string[] | undefined>;
          const phone = c.phone as string || "";
          const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown";

          if (!phone) continue;

          const leadData = {
            phoneNumber: phone,
            contactName: name,
            email: c.email || "",
            company: c.companyName || "",
            tags: (c.tags as string[] | undefined) || [],
            source: "ghl" as const,
            ghlContactId: c.id as string,
            updatedAt: new Date().toISOString(),
          };

          const existingId = existingByGhlId.get(c.id as string);
          if (existingId) {
            batch.update(leadsCol.doc(existingId), leadData);
            updated++;
          } else {
            const ref = leadsCol.doc();
            batch.set(ref, {
              ...leadData,
              id: ref.id,
              status: "new",
              callCount: 0,
              createdAt: new Date().toISOString(),
            });
            created++;
          }
        }

        await batch.commit();
      }

      // Update last sync timestamp
      await db.collection("organizations").doc(orgId).update({
        "settings.ghlLastSyncAt": new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        totalFetched: allContacts.length,
        created,
        updated,
      });
    }

    return NextResponse.json({ success: false, message: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[GHL API] POST error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "GHL sync failed" },
      { status: 500 }
    );
  }
}
