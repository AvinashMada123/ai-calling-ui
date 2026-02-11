import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { getPendingUpdates } from "@/lib/call-updates-store";

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser(request);
  const orgId = authUser?.orgId || "";
  const updates = getPendingUpdates(orgId);
  return NextResponse.json({ updates });
}
