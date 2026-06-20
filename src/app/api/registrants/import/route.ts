import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { importRegistrantsFromCsv } from "@/lib/import-csv";

// POST /api/registrants/import
// Body: { csv: string }  -- raw CSV text pasted/uploaded from a Google Sheets export
//
// SAFE TO RE-RUN: this is an upsert, not a blind insert. Re-importing the same sheet
// (e.g. after new registrations come in) will add new registrants, update details for
// existing ones (matched by email, or by name+phone if no email), and will NEVER touch
// checked_in / checked_in_by / checked_in_at for someone already checked in.
export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if ("error" in auth) return auth.error;

  try {
    const { csv } = await req.json();
    if (!csv || typeof csv !== "string") {
      return NextResponse.json({ error: "csv text is required" }, { status: 400 });
    }

    const result = await importRegistrantsFromCsv(csv);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[import] error", err);
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
