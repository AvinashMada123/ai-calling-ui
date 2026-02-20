import { NextRequest, NextResponse } from "next/server";
import { requireUidAndOrg, query, queryOne, toCamel, toCamelRows } from "@/lib/db";

/**
 * GET /api/data/init
 * Returns all bootstrap data for the authenticated user in a single round-trip.
 * Called by fetchInit() in auth-context on login and page refresh.
 */
export async function GET(request: NextRequest) {
  try {
    const { uid, orgId } = await requireUidAndOrg(request);

    // Fetch everything in parallel
    const [userRow, orgRow, leads, calls, botConfigs, team] = await Promise.all([
      queryOne(
        "SELECT uid, email, display_name, role, org_id, status, created_at, last_login_at, invited_by FROM users WHERE uid = $1",
        [uid]
      ),
      queryOne<{ settings: Record<string, unknown> }>(
        "SELECT settings FROM organizations WHERE id = $1",
        [orgId]
      ),
      query(
        "SELECT * FROM leads WHERE org_id = $1 ORDER BY created_at DESC",
        [orgId]
      ),
      query(
        "SELECT * FROM calls WHERE org_id = $1 ORDER BY initiated_at DESC LIMIT 200",
        [orgId]
      ),
      query(
        "SELECT * FROM bot_configs WHERE org_id = $1 ORDER BY created_at DESC",
        [orgId]
      ),
      query(
        "SELECT uid, email, display_name, role, org_id, status, created_at, invited_by FROM users WHERE org_id = $1",
        [orgId]
      ),
    ]);

    if (!userRow) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      profile: toCamel(userRow),
      settings: orgRow?.settings || {},
      leads: toCamelRows(leads),
      calls: toCamelRows(calls),
      botConfigs: toCamelRows(botConfigs),
      team: toCamelRows(team),
    });
  } catch (error) {
    console.error("[Init API] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/data/init
 * One-time DB migration: ensures tables exist with correct schema.
 */
export async function POST(request: NextRequest) {
  try {
    await requireUidAndOrg(request);

    // Create leads table with all columns including bot_notes
    await query(`
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        org_id TEXT REFERENCES organizations(id),
        phone_number TEXT NOT NULL,
        contact_name TEXT,
        email TEXT,
        company TEXT,
        location TEXT,
        tags JSONB DEFAULT '[]',
        status TEXT DEFAULT 'new',
        call_count INTEGER DEFAULT 0,
        last_call_date TIMESTAMP WITH TIME ZONE,
        source TEXT DEFAULT 'manual',
        ghl_contact_id TEXT,
        qualification_level TEXT,
        qualification_confidence INTEGER,
        last_qualified_at TIMESTAMP WITH TIME ZONE,
        bot_notes TEXT,
        created_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Add bot_notes column if it does not exist
    await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS bot_notes TEXT`);

    return NextResponse.json({ success: true, message: "Database initialized" });
  } catch (error) {
    console.error("[Init API] POST error:", error);
    return NextResponse.json(
      { success: false, message: String(error) },
      { status: 500 }
    );
  }
}
