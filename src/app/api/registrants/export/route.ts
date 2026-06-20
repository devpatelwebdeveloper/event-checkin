import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { Registrant } from "@/lib/types";
import Papa from "papaparse";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if ("error" in auth) return auth.error;

  const rows = await query<Registrant>(
    `SELECT r.*, u.name AS checked_in_by_name
     FROM registrants r
     LEFT JOIN users u ON u.id = r.checked_in_by
     ORDER BY r.full_name ASC`
  );

  const csvRows = rows.map((r) => ({
    "Full Name": r.full_name,
    Email: r.email || "",
    "Contact Number": r.contact_number || "",
    Address: r.address || "",
    "Total Family Count": r.total_family_count,
    "Family Member Names": r.family_member_names || "",
    "Checked In": r.checked_in ? "Yes" : "No",
    "Party Size Arrived": r.checked_in_count ?? "",
    "Checked In By": r.checked_in_by_name || "",
    "Checked In At": r.checked_in_at || "",
    "Walk-in": r.is_walkin ? "Yes" : "No",
  }));

  const csv = Papa.unparse(csvRows);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="checkin-results-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
