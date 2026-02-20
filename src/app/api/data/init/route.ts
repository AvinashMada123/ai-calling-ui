import { NextRequest, NextResponse } from "next/server";
import { requireUidAndOrg, query } from "@/lib/db";

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
        tags JSONB DEFAULT [],
        status TEXT DEFAULT new,
        call_count INTEGER DEFAULT 0,
        last_call_date TIMESTAMP WITH TIME ZONE,
        source TEXT DEFAULT manual,
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
    console.error("[Init API] Error:", error);
    return NextResponse.json(
      { success: false, message: String(error) },
      { status: 500 }
    );
  }
}
