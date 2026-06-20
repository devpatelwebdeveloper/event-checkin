import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { Registrant } from "@/lib/types";

// POST /api/registrants/:id/undo
// Registrars may only undo a check-in they performed themselves.
// Admins may undo any check-in.
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
    const existing = await queryOne<Registrant>(
      `SELECT * FROM registrants WHERE id = $1`,
      [registrantId]
    );

    if (!existing) {
      return NextResponse.json({ error: "Registrant not found" }, { status: 404 });
    }

    if (!existing.checked_in) {
      return NextResponse.json({ error: "Not checked in" }, { status: 400 });
    }

    if (auth.user.role === "registrar" && existing.checked_in_by !== auth.user.id) {
      return NextResponse.json(
        { error: "You can only undo check-ins you performed yourself" },
        { status: 403 }
      );
    }

    const updated = await queryOne<Registrant>(
      `UPDATE registrants
       SET checked_in = FALSE,
           checked_in_count = NULL,
           checked_in_by = NULL,
           checked_in_at = NULL,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [registrantId]
    );

    await query(
      `INSERT INTO checkin_log (registrant_id, user_id, action, party_count)
       VALUES ($1, $2, 'undo', $3)`,
      [registrantId, auth.user.id, existing.checked_in_count]
    );

    return NextResponse.json({ registrant: updated });
  } catch (err) {
    console.error("[undo] error", err);
    return NextResponse.json({ error: "Undo failed" }, { status: 500 });
  }
}
