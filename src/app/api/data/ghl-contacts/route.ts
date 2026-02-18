import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";
const GHL_PAGE_LIMIT = 100;

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

interface GHLContact {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  companyName?: string;
  city?: string;
}

interface GHLResponse {
  contacts: GHLContact[];
  meta: { startAfterId?: string; total?: number };
}

async function fetchAllGHLContacts(
  apiKey: string,
  locationId: string
): Promise<{ contacts: GHLContact[]; total: number }> {
  const allContacts: GHLContact[] = [];
  let startAfterId: string | undefined;
  let page = 0;

  console.log("[GHL Sync] Starting to fetch contacts from GHL...");

  while (true) {
    page++;
    const params = new URLSearchParams({
      locationId,
      limit: String(GHL_PAGE_LIMIT),
    });
    if (startAfterId) {
      params.set("startAfterId", startAfterId);
    }

    console.log(`[GHL Sync] Fetching page ${page} (${allContacts.length} contacts so far)...`);

    const res = await fetch(`${GHL_API_BASE}/contacts/?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: GHL_API_VERSION,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[GHL Sync] API error on page ${page}: ${res.status} - ${errorText}`);
      throw new Error(`GHL API error ${res.status}: ${errorText}`);
    }

    const data: GHLResponse = await res.json();
    console.log(`[GHL Sync] Page ${page}: got ${data.contacts.length} contacts (total from API: ${data.meta?.total ?? "unknown"})`);
    allContacts.push(...data.contacts);

    if (
      !data.meta?.startAfterId ||
      data.contacts.length < GHL_PAGE_LIMIT
    ) {
      break;
    }

    startAfterId = data.meta.startAfterId;
  }

  console.log(`[GHL Sync] Finished fetching. Total contacts: ${allContacts.length}`);
  return { contacts: allContacts, total: allContacts.length };
}

export async function POST(request: NextRequest) {
  try {
    const { orgId } = await getUidAndOrg(request);
    const db = getAdminDb();
    const body = await request.json();

    if (body.action !== "sync") {
      return NextResponse.json(
        { success: false, message: "Unknown action" },
        { status: 400 }
      );
    }

    // Read GHL credentials from org settings
    const orgDoc = await db.collection("organizations").doc(orgId).get();
    if (!orgDoc.exists) {
      return NextResponse.json(
        { success: false, message: "Organization not found" },
        { status: 404 }
      );
    }

    const settings = orgDoc.data()?.settings ?? {};
    const ghlApiKey = settings.ghlApiKey;
    const ghlLocationId = settings.ghlLocationId;

    if (!ghlApiKey || !ghlLocationId) {
      console.error("[GHL Sync] Missing credentials - apiKey:", !!ghlApiKey, "locationId:", !!ghlLocationId);
      return NextResponse.json(
        {
          success: false,
          message:
            "GHL API Key and Location ID must be configured in Settings",
        },
        { status: 400 }
      );
    }

    console.log("[GHL Sync] Credentials found. Starting sync for org:", orgId);

    // Fetch all contacts from GHL
    const { contacts } = await fetchAllGHLContacts(ghlApiKey, ghlLocationId);

    console.log(`[GHL Sync] Fetched ${contacts.length} contacts from GHL. Now upserting to Firestore...`);

    // Load existing GHL leads to support upsert
    const leadsRef = db
      .collection("organizations")
      .doc(orgId)
      .collection("leads");
    const existingSnap = await leadsRef
      .where("source", "==", "ghl")
      .get();
    const existingByGhlId = new Map<string, string>();
    for (const doc of existingSnap.docs) {
      const data = doc.data();
      if (data.ghlContactId) {
        existingByGhlId.set(data.ghlContactId, doc.id);
      }
    }

    // Upsert contacts as leads in batches of 500 (Firestore limit)
    const now = new Date().toISOString();
    let synced = 0;
    const BATCH_SIZE = 500;
    const allLeads: Record<string, unknown>[] = [];

    for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
      const chunk = contacts.slice(i, i + BATCH_SIZE);
      const batch = db.batch();

      for (const contact of chunk) {
        const existingDocId = existingByGhlId.get(contact.id);
        const contactName = [contact.firstName, contact.lastName]
          .filter(Boolean)
          .join(" ") || "Unknown";

        if (existingDocId) {
          // Update existing lead (preserve status, callCount, etc.)
          const ref = leadsRef.doc(existingDocId);
          const updates = {
            contactName,
            phoneNumber: contact.phone || "",
            email: contact.email || undefined,
            company: contact.companyName || undefined,
            location: contact.city || undefined,
            tags: contact.tags || [],
            updatedAt: now,
          };
          batch.update(ref, updates);
          allLeads.push({ id: existingDocId, ...updates, source: "ghl", ghlContactId: contact.id });
        } else {
          // Create new lead
          const ref = leadsRef.doc();
          const lead = {
            id: ref.id,
            contactName,
            phoneNumber: contact.phone || "",
            email: contact.email || undefined,
            company: contact.companyName || undefined,
            location: contact.city || undefined,
            tags: contact.tags || [],
            status: "new",
            callCount: 0,
            source: "ghl",
            ghlContactId: contact.id,
            createdAt: now,
            updatedAt: now,
          };
          batch.set(ref, lead);
          allLeads.push(lead);
        }
        synced++;
      }

      await batch.commit();
      console.log(`[GHL Sync] Committed batch ${Math.floor(i / BATCH_SIZE) + 1} (${Math.min(i + BATCH_SIZE, contacts.length)}/${contacts.length})`);
    }

    console.log(`[GHL Sync] Upsert complete. Synced ${synced} leads. Updating sync timestamp...`);

    // Update last sync time in org settings
    await db
      .collection("organizations")
      .doc(orgId)
      .update({
        "settings.ghlLastSyncAt": now,
        updatedAt: now,
      });

    return NextResponse.json({
      success: true,
      synced,
      total: contacts.length,
      ghlLastSyncAt: now,
    });
  } catch (error) {
    console.error("[GHL Contacts API] POST error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { orgId } = await getUidAndOrg(request);
    const db = getAdminDb();

    const orgDoc = await db.collection("organizations").doc(orgId).get();
    const settings = orgDoc.data()?.settings ?? {};

    return NextResponse.json({
      ghlSyncEnabled: settings.ghlSyncEnabled ?? false,
      ghlLastSyncAt: settings.ghlLastSyncAt ?? "",
      ghlConfigured: !!(settings.ghlApiKey && settings.ghlLocationId),
    });
  } catch (error) {
    console.error("[GHL Contacts API] GET error:", error);
    return NextResponse.json(
      { ghlSyncEnabled: false, ghlLastSyncAt: "", ghlConfigured: false },
      { status: 500 }
    );
  }
}
