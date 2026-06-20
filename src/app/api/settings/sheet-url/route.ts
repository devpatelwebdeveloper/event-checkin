import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";

// Simple single-row key/value settings table, created lazily here so we don't
// need a separate migration step for this optional feature.
async function ensureSettingsTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`
  );
}

// GET /api/settings/sheet-url - returns saved Google Sheet settings, if any
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if ("error" in auth) return auth.error;

  await ensureSettingsTable();
  const rows = await query<{ key: string; value: string }>(
    `SELECT key, value FROM app_settings WHERE key IN ('sheet_csv_url', 'export_sheet_id')`
  );
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return NextResponse.json({
    sheetCsvUrl: map["sheet_csv_url"] || null,
    exportSheetId: map["export_sheet_id"] || null,
  });
}

// POST /api/settings/sheet-url - saves the Google Sheet CSV URL and/or export sheet ID
export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if ("error" in auth) return auth.error;

  const { url, exportSheetId } = await req.json();

  await ensureSettingsTable();

  if (url && typeof url === "string") {
    await query(
      `INSERT INTO app_settings (key, value) VALUES ('sheet_csv_url', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [url.trim()]
    );
  }

  if (exportSheetId && typeof exportSheetId === "string") {
    await query(
      `INSERT INTO app_settings (key, value) VALUES ('export_sheet_id', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [exportSheetId.trim()]
    );
  }

  if (!url && !exportSheetId) {
    return NextResponse.json(
      { error: "Provide url and/or exportSheetId" },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
