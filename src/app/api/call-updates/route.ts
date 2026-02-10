import { NextResponse } from "next/server";
import { getPendingUpdates } from "@/lib/call-updates-store";

export async function GET() {
  const updates = getPendingUpdates();
  return NextResponse.json({ updates });
}
