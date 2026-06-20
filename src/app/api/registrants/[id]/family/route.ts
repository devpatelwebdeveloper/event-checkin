import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { Registrant, FamilyMember } from "@/lib/types";

async function ensureFamilyMembers(registrant: Registrant) {
  const existing = await query<{ id: number }>(
    `SELECT id FROM family_members WHERE registrant_id = $1 LIMIT 1`,
    [registrant.id]
  );
  if (existing.length > 0) return;

  await query(
    `INSERT INTO family_members (registrant_id, name, phone, is_primary)
     VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (registrant_id) WHERE is_primary = TRUE DO NOTHING`,
    [registrant.id, registrant.full_name, registrant.contact_number]
  );

  const names: string[] = [];
  if (registrant.family_member_names) {
    names.push(
      ...registrant.family_member_names
        .split(",")
        .map((n) => n.trim())
        .filter((n) => n.length > 0)
    );
  }
  const total = registrant.total_family_count || 1;
  for (let i = names.length + 2; i <= total; i++) {
    names.push(`Member ${i}`);
  }
  for (const name of names) {
    await query(
      `INSERT INTO family_members (registrant_id, name, is_primary)
       VALUES ($1, $2, FALSE)
       ON CONFLICT (registrant_id, LOWER(name)) WHERE is_primary = FALSE DO NOTHING`,
      [registrant.id, name]
    );
  }
}

// GET /api/registrants/:id/family
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(req, ["admin", "registrar"]);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const registrantId = parseInt(id, 10);
  if (isNaN(registrantId)) {
    return NextResponse.json({ error: "Invalid registrant id" }, { status: 400 });
  }

  const registrant = await queryOne<Registrant>(
    `SELECT * FROM registrants WHERE id = $1`,
    [registrantId]
  );
  if (!registrant) {
    return NextResponse.json({ error: "Registrant not found" }, { status: 404 });
  }

  await ensureFamilyMembers(registrant);

  const members = await query<FamilyMember>(
    `SELECT * FROM family_members WHERE registrant_id = $1 ORDER BY is_primary DESC, id ASC`,
    [registrantId]
  );

  return NextResponse.json({ members });
}
