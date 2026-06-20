import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { Stats } from "@/lib/types";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "registrar", "viewer"]);
  if ("error" in auth) return auth.error;

  const stats = await queryOne<{
    total_registrants: string;
    total_expected_people: string;
    checked_in_registrations: string;
    checked_in_people: string;
  }>(
    `SELECT
      COUNT(*) AS total_registrants,
      COALESCE(SUM(total_family_count), 0) AS total_expected_people,
      COALESCE(SUM(CASE WHEN checked_in = TRUE THEN 1 ELSE 0 END), 0) AS checked_in_registrations,
      COALESCE(SUM(CASE WHEN checked_in = TRUE THEN checked_in_count ELSE 0 END), 0) AS checked_in_people
     FROM registrants`
  );

  if (!stats) {
    return NextResponse.json(
      { error: "Could not compute stats" },
      { status: 500 }
    );
  }

  const total_registrants = parseInt(stats.total_registrants, 10);
  const checked_in_registrations = parseInt(stats.checked_in_registrations, 10);

  const result: Stats = {
    total_registrants,
    total_expected_people: parseInt(stats.total_expected_people, 10),
    checked_in_registrations,
    checked_in_people: parseInt(stats.checked_in_people, 10),
    pending_registrations: total_registrants - checked_in_registrations,
  };

  return NextResponse.json(result);
}
