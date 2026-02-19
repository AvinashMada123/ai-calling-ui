import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const maxDuration = 60;

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

    // Sync: fetch ONE page of 100 contacts, save, return cursor for next batch
    const filterTag: string | undefined = body.tag || undefined;
    const cursor: string | undefined = body.cursor || undefined;

    console.log(`[GHL Sync] Fetching batch for org: ${orgId}${filterTag ? ` (tag: "${filterTag}")` : ""}${cursor ? ` (cursor: ${cursor})` : " (first batch)"}`);

    // Fetch one page from GHL
    const params = new URLSearchParams({
      locationId: ghlLocationId,
      limit: String(GHL_PAGE_LIMIT),
    });
    if (cursor) {
      params.set("startAfterId", cursor);
    }

    const ghlRes = await fetch(`${GHL_API_BASE}/contacts/?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${ghlApiKey}`,
        Version: GHL_API_VERSION,
      },
    });

    if (!ghlRes.ok) {
      const errorText = await ghlRes.text();
      console.error(`[GHL Sync] API error: ${ghlRes.status} - ${errorText}`);
      throw new Error(`GHL API error ${ghlRes.status}: ${errorText}`);
    }

    const ghlData: GHLResponse = await ghlRes.json();
    const totalInGHL = ghlData.meta?.total ?? 0;

    // Filter by tag if specified
    const contacts = filterTag
      ? ghlData.contacts.filter((c) => c.tags?.includes(filterTag))
      : ghlData.contacts;

    console.log(`[GHL Sync] Got ${ghlData.contacts.length} contacts from GHL, ${contacts.length} matched${filterTag ? ` tag "${filterTag}"` : ""} (total in GHL: ${totalInGHL})`);

    // Load existing GHL leads for upsert
    const leadsRef = db.collection("organizations").doc(orgId).collection("leads");
    const existingByGhlId = new Map<string, string>();

    if (contacts.length > 0) {
      const ghlIds = contacts.map((c) => c.id);
      // Query in chunks of 30 (Firestore 'in' limit)
      for (let i = 0; i < ghlIds.length; i += 30) {
        const chunk = ghlIds.slice(i, i + 30);
        const snap = await leadsRef.where("ghlContactId", "in", chunk).get();
        for (const doc of snap.docs) {
          const data = doc.data();
          if (data.ghlContactId) {
            existingByGhlId.set(data.ghlContactId, doc.id);
          }
        }
      }
    }

    // Upsert contacts
    const now = new Date().toISOString();
    let synced = 0;

    if (contacts.length > 0) {
      const batch = db.batch();
      for (const contact of contacts) {
        const existingDocId = existingByGhlId.get(contact.id);
        const contactName =
          [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unknown";

        if (existingDocId) {
          batch.update(leadsRef.doc(existingDocId), {
            contactName,
            phoneNumber: contact.phone || "",
            email: contact.email || undefined,
            company: contact.companyName || undefined,
            location: contact.city || undefined,
            tags: contact.tags || [],
            updatedAt: now,
          });
        } else {
          const ref = leadsRef.doc();
          batch.set(ref, {
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
          });
        }
        synced++;
      }
      await batch.commit();
      console.log(`[GHL Sync] Saved ${synced} leads to Firestore`);
    }

    // Update last sync time
    await db.collection("organizations").doc(orgId).update({
      "settings.ghlLastSyncAt": now,
      updatedAt: now,
    });

    // Determine if there are more pages
    const hasMore = !!(ghlData.meta?.startAfterId && ghlData.contacts.length >= GHL_PAGE_LIMIT);
    const nextCursor = hasMore ? ghlData.meta!.startAfterId : null;

    console.log(`[GHL Sync] Batch done. Synced: ${synced}, hasMore: ${hasMore}`);

    return NextResponse.json({
      success: true,
      synced,
      totalInGHL,
      hasMore,
      nextCursor,
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
