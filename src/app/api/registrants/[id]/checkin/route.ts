import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { Registrant, CheckinMember } from "@/lib/types";

// POST /api/registrants/:id/checkin
// Body: { members: Array<{ id: number; present: boolean; phone: string | null }> }
export async function POST(
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

  try {
    const body = await req.json();
    const members: CheckinMember[] = body.members;

    if (!Array.isArray(members) || members.length === 0) {
      return NextResponse.json({ error: "members array is required" }, { status: 400 });
    }

    const existing = await queryOne<Registrant>(
      `SELECT * FROM registrants WHERE id = $1`,
      [registrantId]
    );
    if (!existing) {
      return NextResponse.json({ error: "Registrant not found" }, { status: 404 });
    }
    if (existing.checked_in) {
      return NextResponse.json({ error: "Already checked in", existing }, { status: 409 });
    }

    const presentCount = members.filter((m) => m.present).length;
    if (presentCount === 0) {
      return NextResponse.json(
        { error: "At least one member must be present" },
        { status: 400 }
      );
    }

    for (const m of members) {
      const phone = m.phone ? m.phone.replace(/[^0-9]/g, "") || null : null;
      if (m.id === null) {
        // New member added at check-in time — insert and optionally mark checked in
        const name = m.name?.trim();
        if (!name) continue;
        await query(
          `INSERT INTO family_members
             (registrant_id, name, phone, is_primary, checked_in, checked_in_at, checked_in_by)
           VALUES ($1, $2, $3, FALSE, $4,
             CASE WHEN $4 THEN now() ELSE NULL END,
             CASE WHEN $4 THEN $5::integer ELSE NULL END)
           ON CONFLICT (registrant_id, LOWER(name)) WHERE is_primary = FALSE
           DO UPDATE SET
             phone = COALESCE(EXCLUDED.phone, family_members.phone),
             checked_in = EXCLUDED.checked_in,
             checked_in_at = EXCLUDED.checked_in_at,
             checked_in_by = EXCLUDED.checked_in_by`,
          [registrantId, name, phone, m.present, auth.user.id]
        );
      } else {
        const memberName = m.name?.trim() || null;
        await query(
          `UPDATE family_members
           SET checked_in = $1,
               name = CASE WHEN NOT is_primary AND $6::text IS NOT NULL THEN $6 ELSE name END,
               phone = CASE WHEN $2::text IS NOT NULL THEN $2 ELSE phone END,
               checked_in_at = CASE WHEN $1 THEN now() ELSE NULL END,
               checked_in_by = CASE WHEN $1 THEN $3::integer ELSE NULL END
           WHERE id = $4 AND registrant_id = $5`,
          [m.present, phone, auth.user.id, m.id, registrantId, memberName]
        );
      }
    }

    const updated = await queryOne<Registrant>(
      `UPDATE registrants
       SET checked_in = TRUE,
           checked_in_count = $1,
           checked_in_by = $2,
           checked_in_at = now(),
           updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [presentCount, auth.user.id, registrantId]
    );

    await query(
      `INSERT INTO checkin_log (registrant_id, user_id, action, party_count)
       VALUES ($1, $2, 'checkin', $3)`,
      [registrantId, auth.user.id, presentCount]
    );

    return NextResponse.json({ registrant: updated });
  } catch (err) {
    console.error("[checkin] error", err);
    return NextResponse.json({ error: "Check-in failed" }, { status: 500 });
  }
}
