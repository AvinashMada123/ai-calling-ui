import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

// Extend Vercel serverless timeout (Pro: 300s, Hobby: 60s)
export const maxDuration = 300;

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";
const GHL_PAGE_LIMIT = 100;
const FIRESTORE_BATCH_LIMIT = 500;

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

async function fetchGHLTags(
  apiKey: string,
  locationId: string
): Promise<string[]> {
  console.log("[GHL Tags] Fetching tags for location:", locationId);
  const res = await fetch(
    `${GHL_API_BASE}/locations/${locationId}/tags`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: GHL_API_VERSION,
      },
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[GHL Tags] API error: ${res.status} - ${errorText}`);
    throw new Error(`GHL Tags API error ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  const tags: string[] = (data.tags ?? []).map(
    (t: { name?: string } | string) => (typeof t === "string" ? t : t.name ?? "")
  ).filter(Boolean);
  console.log(`[GHL Tags] Found ${tags.length} tags`);
  return tags;
}

function buildLead(
  contact: GHLContact,
  refId: string,
  existingDocId: string | undefined,
  now: string
) {
  const contactName =
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unknown";

  if (existingDocId) {
    return {
      isUpdate: true as const,
      docId: existingDocId,
      data: {
        contactName,
        phoneNumber: contact.phone || "",
        email: contact.email || undefined,
        company: contact.companyName || undefined,
        location: contact.city || undefined,
        tags: contact.tags || [],
        updatedAt: now,
      },
    };
  }

  return {
    isUpdate: false as const,
    docId: refId,
    data: {
      id: refId,
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
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const { orgId } = await getUidAndOrg(request);
    const db = getAdminDb();
    const body = await request.json();

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
          message: "GHL API Key and Location ID must be configured in Settings",
        },
        { status: 400 }
      );
    }

    // Fetch available tags from GHL
    if (body.action === "fetchTags") {
      const tags = await fetchGHLTags(ghlApiKey, ghlLocationId);
      return NextResponse.json({ success: true, tags });
    }

    if (body.action !== "sync") {
      return NextResponse.json(
        { success: false, message: "Unknown action" },
        { status: 400 }
      );
    }

    const filterTag: string | undefined = body.tag || undefined;
    console.log(`[GHL Sync] Starting sync for org: ${orgId}${filterTag ? ` (tag: "${filterTag}")` : " (all contacts)"}`);

    // Load existing GHL leads index for upsert (do this once upfront)
    const leadsRef = db.collection("organizations").doc(orgId).collection("leads");
    const existingSnap = await leadsRef.where("source", "==", "ghl").get();
    const existingByGhlId = new Map<string, string>();
    for (const doc of existingSnap.docs) {
      const data = doc.data();
      if (data.ghlContactId) {
        existingByGhlId.set(data.ghlContactId, doc.id);
      }
    }
    console.log(`[GHL Sync] Found ${existingByGhlId.size} existing GHL leads in Firestore`);

    // Process page-by-page: fetch a page from GHL → upsert to Firestore → next page
    const now = new Date().toISOString();
    let startAfterId: string | undefined;
    let page = 0;
    let synced = 0;
    let totalFetched = 0;
    let pendingWrites: { isUpdate: boolean; docId: string; data: Record<string, unknown> }[] = [];

    const flushBatch = async () => {
      if (pendingWrites.length === 0) return;
      const batch = db.batch();
      for (const write of pendingWrites) {
        const ref = leadsRef.doc(write.docId);
        if (write.isUpdate) {
          batch.update(ref, write.data);
        } else {
          batch.set(ref, write.data);
        }
      }
      await batch.commit();
      console.log(`[GHL Sync] Flushed ${pendingWrites.length} writes to Firestore (total synced: ${synced})`);
      pendingWrites = [];
    };

    while (true) {
      page++;
      const params = new URLSearchParams({
        locationId: ghlLocationId,
        limit: String(GHL_PAGE_LIMIT),
      });
      if (startAfterId) {
        params.set("startAfterId", startAfterId);
      }

      console.log(`[GHL Sync] Fetching page ${page}...`);

      const res = await fetch(`${GHL_API_BASE}/contacts/?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${ghlApiKey}`,
          Version: GHL_API_VERSION,
        },
      });

      if (!res.ok) {
        // Flush whatever we have so far before failing
        await flushBatch();
        const errorText = await res.text();
        console.error(`[GHL Sync] API error on page ${page}: ${res.status} - ${errorText}`);
        throw new Error(`GHL API error ${res.status}: ${errorText}`);
      }

      const data: GHLResponse = await res.json();
      totalFetched += data.contacts.length;

      // Filter by tag if specified
      const pageContacts = filterTag
        ? data.contacts.filter((c) => c.tags?.includes(filterTag))
        : data.contacts;

      console.log(`[GHL Sync] Page ${page}: ${data.contacts.length} contacts fetched, ${pageContacts.length} matched${filterTag ? ` tag "${filterTag}"` : ""} (total API: ${data.meta?.total ?? "?"})`);

      // Build leads and add to pending writes
      for (const contact of pageContacts) {
        const existingDocId = existingByGhlId.get(contact.id);
        const refId = existingDocId || leadsRef.doc().id;
        const lead = buildLead(contact, refId, existingDocId, now);
        pendingWrites.push(lead);
        synced++;

        // Flush when we hit the Firestore batch limit
        if (pendingWrites.length >= FIRESTORE_BATCH_LIMIT) {
          await flushBatch();
        }
      }

      // Check if there are more pages
      if (!data.meta?.startAfterId || data.contacts.length < GHL_PAGE_LIMIT) {
        break;
      }

      startAfterId = data.meta.startAfterId;
    }

    // Flush remaining writes
    await flushBatch();

    console.log(`[GHL Sync] Complete. Synced ${synced} leads from ${totalFetched} total contacts (${page} pages).`);

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
      total: totalFetched,
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
