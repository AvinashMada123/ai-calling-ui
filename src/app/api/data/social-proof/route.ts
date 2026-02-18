import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

async function getOrgId(request: NextRequest): Promise<{ orgId: string; uid: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const idToken = authHeader.slice(7);
  const decoded = await getAdminAuth().verifyIdToken(idToken);
  const db = getAdminDb();
  const userDoc = await db.collection("users").doc(decoded.uid).get();
  if (!userDoc.exists) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return { orgId: userDoc.data()!.orgId as string, uid: decoded.uid };
}

export async function GET(request: NextRequest) {
  try {
    const result = await getOrgId(request);
    if (result instanceof NextResponse) return result;
    const { orgId } = result;

    const db = getAdminDb();
    const spRef = db.collection("organizations").doc(orgId).collection("socialProof");

    const [companiesDoc, citiesDoc, rolesDoc] = await Promise.all([
      spRef.doc("companies").get(),
      spRef.doc("cities").get(),
      spRef.doc("roles").get(),
    ]);

    return NextResponse.json({
      companies: companiesDoc.exists ? (companiesDoc.data()?.items || []) : [],
      cities: citiesDoc.exists ? (citiesDoc.data()?.items || []) : [],
      roles: rolesDoc.exists ? (rolesDoc.data()?.items || []) : [],
    });
  } catch (error) {
    console.error("[Social Proof API] GET error:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await getOrgId(request);
    if (result instanceof NextResponse) return result;
    const { orgId } = result;

    const body = await request.json();
    const { action } = body;
    const db = getAdminDb();
    const spRef = db.collection("organizations").doc(orgId).collection("socialProof");

    switch (action) {
      case "upsertCompany": {
        const { company } = body;
        const docRef = spRef.doc("companies");
        const doc = await docRef.get();
        const items = doc.exists ? (doc.data()?.items || []) : [];
        const idx = items.findIndex((c: { id: string }) => c.id === company.id);
        if (idx >= 0) {
          items[idx] = company;
        } else {
          items.push(company);
        }
        await docRef.set({ items });
        return NextResponse.json({ success: true });
      }
      case "deleteCompany": {
        const { companyId } = body;
        const docRef = spRef.doc("companies");
        const doc = await docRef.get();
        const items = (doc.exists ? (doc.data()?.items || []) : [])
          .filter((c: { id: string }) => c.id !== companyId);
        await docRef.set({ items });
        return NextResponse.json({ success: true });
      }

      case "upsertCity": {
        const { city } = body;
        const docRef = spRef.doc("cities");
        const doc = await docRef.get();
        const items = doc.exists ? (doc.data()?.items || []) : [];
        const idx = items.findIndex((c: { id: string }) => c.id === city.id);
        if (idx >= 0) {
          items[idx] = city;
        } else {
          items.push(city);
        }
        await docRef.set({ items });
        return NextResponse.json({ success: true });
      }
      case "deleteCity": {
        const { cityId } = body;
        const docRef = spRef.doc("cities");
        const doc = await docRef.get();
        const items = (doc.exists ? (doc.data()?.items || []) : [])
          .filter((c: { id: string }) => c.id !== cityId);
        await docRef.set({ items });
        return NextResponse.json({ success: true });
      }

      case "upsertRole": {
        const { role } = body;
        const docRef = spRef.doc("roles");
        const doc = await docRef.get();
        const items = doc.exists ? (doc.data()?.items || []) : [];
        const idx = items.findIndex((r: { id: string }) => r.id === role.id);
        if (idx >= 0) {
          items[idx] = role;
        } else {
          items.push(role);
        }
        await docRef.set({ items });
        return NextResponse.json({ success: true });
      }
      case "deleteRole": {
        const { roleId } = body;
        const docRef = spRef.doc("roles");
        const doc = await docRef.get();
        const items = (doc.exists ? (doc.data()?.items || []) : [])
          .filter((r: { id: string }) => r.id !== roleId);
        await docRef.set({ items });
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("[Social Proof API] POST error:", error);
    return NextResponse.json({ error: "Failed to process" }, { status: 500 });
  }
}
