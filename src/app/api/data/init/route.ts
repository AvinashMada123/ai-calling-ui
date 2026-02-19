import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { query, queryOne, toCamel, toCamelRows } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    const decoded = await getAdminAuth().verifyIdToken(idToken);

    // Get user profile
    const userRow = await queryOne(
      "SELECT uid, email, display_name, role, org_id, status, created_at, last_login_at, invited_by FROM users WHERE uid = $1",
      [decoded.uid]
    );
    if (!userRow) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const profile = toCamel(userRow);
    const orgId = userRow.org_id as string;

    // Fetch org settings, leads, calls, bot configs, and team in parallel
    const [orgRow, leadsRows, callsRows, botConfigsRows, teamRows] = await Promise.all([
      queryOne("SELECT settings FROM organizations WHERE id = $1", [orgId]),
      query(
        "SELECT * FROM leads WHERE org_id = $1 ORDER BY created_at DESC",
        [orgId]
      ),
      query(
        "SELECT * FROM ui_calls WHERE org_id = $1 ORDER BY initiated_at DESC",
        [orgId]
      ),
      query(
        "SELECT * FROM bot_configs WHERE org_id = $1",
        [orgId]
      ),
      query(
        "SELECT uid, email, display_name, role, org_id, status, created_at, last_login_at FROM users WHERE org_id = $1",
        [orgId]
      ),
    ]);

    const settings = orgRow?.settings || {};
    const leads = toCamelRows(leadsRows);
    const calls = toCamelRows(callsRows);
    const botConfigs = toCamelRows(botConfigsRows);
    const team = toCamelRows(teamRows);

    return NextResponse.json({ profile, settings, leads, calls, botConfigs, team });
  } catch (error) {
    console.error("[Init API] Error:", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}
