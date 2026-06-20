import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { Registrant } from "@/lib/types";

// POST /api/registrants/:id/checkin
// Body: { party_count: number }  -- how many of the registered party actually showed up
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
    const partyCount = parseInt(body.party_count, 10);

    if (isNaN(partyCount) || partyCount < 1) {
      return NextResponse.json(
        { error: "party_count must be a positive number" },
        { status: 400 }
      );
    }

    const existing = await queryOne<Registrant>(
      `SELECT * FROM registrants WHERE id = $1`,
      [registrantId]
    );

    if (!existing) {
      return NextResponse.json({ error: "Registrant not found" }, { status: 404 });
    }

    if (existing.checked_in) {
      return NextResponse.json(
        {
          error: "Already checked in",
          checked_in_by_name: null,
          existing,
        },
        { status: 409 }
      );
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
      [partyCount, auth.user.id, registrantId]
    );

    await query(
      `INSERT INTO checkin_log (registrant_id, user_id, action, party_count)
       VALUES ($1, $2, 'checkin', $3)`,
      [registrantId, auth.user.id, partyCount]
    );

    return NextResponse.json({ registrant: updated });
  } catch (err) {
    console.error("[checkin] error", err);
    return NextResponse.json({ error: "Check-in failed" }, { status: 500 });
  }
}
