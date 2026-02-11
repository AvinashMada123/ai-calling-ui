import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { getAdminDb } from "@/lib/firebase-admin";

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  if (!authUser?.orgId) {
    return NextResponse.json({ updates: [] });
  }

  // Get active call UUIDs from query params
  const uuids = request.nextUrl.searchParams.get("uuids");
  if (!uuids) {
    return NextResponse.json({ updates: [] });
  }

  const callUuids = uuids.split(",").filter(Boolean);
  if (callUuids.length === 0) {
    return NextResponse.json({ updates: [] });
  }

  try {
    const db = getAdminDb();
    const callsCol = db
      .collection("organizations")
      .doc(authUser.orgId)
      .collection("calls");

    // Query Firestore for these specific calls (max 30 per 'in' query)
    const batch = callUuids.slice(0, 30);
    const snap = await callsCol.where("callUuid", "in", batch).get();

    const updates = snap.docs
      .map((doc) => {
        const data = doc.data();
        // Only return calls that have endedData (completed by webhook)
        if (!data.endedData) return null;
        return {
          callUuid: data.callUuid,
          data: data.endedData,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ updates });
  } catch (error) {
    console.error("[call-updates] Firestore query error:", error);
    return NextResponse.json({ updates: [] });
  }
}
