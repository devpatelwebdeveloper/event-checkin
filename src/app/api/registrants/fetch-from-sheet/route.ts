import { NextRequest, NextResponse } from "next/server";
import { queryOne, query } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { importRegistrantsFromCsv } from "@/lib/import-csv";

function isAuthorizedCronCall(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // cron auth not configured - falls back to admin-session auth only
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}

// POST /api/registrants/fetch-from-sheet
// Fetches the CSV from the admin-configured Google Sheet URL and upserts registrants.
// The sheet must be shared as "Anyone with the link can view" (or published to the web) -
// no Google login/token is needed for this, since it's a plain HTTP GET of a public CSV export.
//
// Can be called two ways:
//   1. By a logged-in admin (manual button click, or the browser-tab auto-poller)
//   2. By an external scheduler (e.g. cron-job.org, or Vercel Pro cron) sending
//      `Authorization: Bearer <CRON_SECRET>` - this is what makes "automatic, even if
//      no one has the admin page open" actually work. See README for setup.
export async function POST(req: NextRequest) {
  const isCron = isAuthorizedCronCall(req);

  if (!isCron) {
    const auth = requireRole(req, ["admin"]);
    if ("error" in auth) return auth.error;
  }

  await query(
    `CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)`
  );

  const setting = await queryOne<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = 'sheet_csv_url'`
  );

  if (!setting?.value) {
    return NextResponse.json(
      {
        error:
          "No Google Sheet URL configured yet. Go to Admin → Import → set your sheet's CSV link first.",
      },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(setting.value, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EventCheckinApp/1.0)" },
    });

    if (!res.ok) {
      return NextResponse.json(
        {
          error: `Google Sheets returned an error (HTTP ${res.status}). Make sure the sheet is shared as "Anyone with the link can view".`,
        },
        { status: 502 }
      );
    }

    const contentType = res.headers.get("content-type") || "";
    const csv = await res.text();

    // Google sometimes returns an HTML login/error page instead of CSV if the sheet
    // isn't actually public - detect that case with a friendlier error than a parse failure.
    if (contentType.includes("text/html") || csv.trim().startsWith("<")) {
      return NextResponse.json(
        {
          error:
            'That URL returned a webpage instead of CSV data. Make sure the sheet is shared as "Anyone with the link can view" and that you used the CSV export link, not the normal sheet link.',
        },
        { status: 400 }
      );
    }

    const result = await importRegistrantsFromCsv(csv);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[fetch-from-sheet] error", err);
    const message = err instanceof Error ? err.message : "Fetch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
