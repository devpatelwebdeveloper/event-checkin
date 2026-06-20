import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { Registrant } from "@/lib/types";
import { getSheetsClient, extractSheetId } from "@/lib/google-sheets";

// POST /api/registrants/push-to-sheet
// Writes the current full registrant + check-in data to a tab named "Check-In Results"
// in the admin-configured Google Sheet, overwriting that tab's contents each time
// (safe to click repeatedly - it's not appending duplicates, it's a full refresh).
//
// Requires: GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY env vars,
// and an export sheet ID saved via /api/settings/sheet-url. The sheet must be shared
// with the service account's email as an Editor.
export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if ("error" in auth) return auth.error;

  try {
    await query(
      `CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)`
    );
    const setting = await queryOne<{ value: string }>(
      `SELECT value FROM app_settings WHERE key = 'export_sheet_id'`
    );

    if (!setting?.value) {
      return NextResponse.json(
        {
          error:
            "No export target sheet configured. Go to Admin → Import and set the Google Sheet to write results to.",
        },
        { status: 400 }
      );
    }

    const sheetId = extractSheetId(setting.value);
    const sheets = getSheetsClient();

    const rows = await query<Registrant>(
      `SELECT r.*, u.name AS checked_in_by_name
       FROM registrants r
       LEFT JOIN users u ON u.id = r.checked_in_by
       ORDER BY r.full_name ASC`
    );

    const header = [
      "Full Name",
      "Email",
      "Contact Number",
      "Address",
      "Total Family Count",
      "Family Member Names",
      "Checked In",
      "Party Size Arrived",
      "Checked In By",
      "Checked In At",
      "Walk-in",
    ];

    const values = [
      header,
      ...rows.map((r) => [
        r.full_name,
        r.email || "",
        r.contact_number || "",
        r.address || "",
        String(r.total_family_count),
        r.family_member_names || "",
        r.checked_in ? "Yes" : "No",
        r.checked_in_count != null ? String(r.checked_in_count) : "",
        r.checked_in_by_name || "",
        r.checked_in_at || "",
        r.is_walkin ? "Yes" : "No",
      ]),
    ];

    const TAB_NAME = "Check-In Results";

    // Ensure the tab exists; create it if this is the first push.
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const existingTab = spreadsheet.data.sheets?.find(
      (s) => s.properties?.title === TAB_NAME
    );

    if (!existingTab) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: TAB_NAME } } }],
        },
      });
    } else {
      // Clear previous contents before writing fresh data (full refresh, not append).
      await sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: `${TAB_NAME}`,
      });
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${TAB_NAME}!A1`,
      valueInputOption: "RAW",
      requestBody: { values },
    });

    return NextResponse.json({ ok: true, rowsWritten: rows.length });
  } catch (err) {
    console.error("[push-to-sheet] error", err);
    const message = err instanceof Error ? err.message : "Push to sheet failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
