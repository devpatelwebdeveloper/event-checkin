import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { Registrant } from "@/lib/types";

// GET /api/registrants?q=search+term&limit=25
// Search by name, email, or contact number. Used by registrars to find someone to check in,
// and by admin for the full management table.
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "registrar"]);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const limit = Math.min(parseInt(searchParams.get("limit") || "25", 10) || 25, 100);

  let rows: Registrant[];

  if (q.length === 0) {
    // No query: return most recently updated first (useful for admin table default view)
    rows = await query<Registrant>(
      `SELECT r.*, u.name AS checked_in_by_name
       FROM registrants r
       LEFT JOIN users u ON u.id = r.checked_in_by
       ORDER BY r.full_name ASC
       LIMIT $1`,
      [limit]
    );
  } else {
    const likeTerm = `%${q.toLowerCase()}%`;
    rows = await query<Registrant>(
      `SELECT r.*, u.name AS checked_in_by_name
       FROM registrants r
       LEFT JOIN users u ON u.id = r.checked_in_by
       WHERE LOWER(r.full_name) LIKE $1
          OR LOWER(r.email) LIKE $1
          OR r.contact_number LIKE $1
       ORDER BY
         CASE WHEN LOWER(r.full_name) LIKE $2 THEN 0 ELSE 1 END,
         r.full_name ASC
       LIMIT $3`,
      [likeTerm, `${q.toLowerCase()}%`, limit]
    );
  }

  return NextResponse.json({ registrants: rows });
}

// POST /api/registrants - add a walk-in registrant (admin or registrar)
export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "registrar"]);
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const {
      full_name,
      email,
      contact_number,
      address,
      total_family_count,
      family_member_names,
    } = body;

    if (!full_name || typeof full_name !== "string" || full_name.trim().length === 0) {
      return NextResponse.json({ error: "Full name is required" }, { status: 400 });
    }

    const rows = await query<{ id: number }>(
      `INSERT INTO registrants
        (full_name, email, contact_number, address, total_family_count, family_member_names, is_walkin)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING id`,
      [
        full_name.trim(),
        email || null,
        contact_number || null,
        address || null,
        total_family_count && total_family_count > 0 ? total_family_count : 1,
        family_member_names || null,
      ]
    );

    return NextResponse.json({ id: rows[0].id }, { status: 201 });
  } catch (err) {
    console.error("[registrants POST] error", err);
    return NextResponse.json({ error: "Failed to add registrant" }, { status: 500 });
  }
}
