import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { Registrant } from "@/lib/types";

// DELETE /api/registrants/:id — admin only
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(req, ["admin"]);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const registrantId = parseInt(id, 10);
  if (isNaN(registrantId)) {
    return NextResponse.json({ error: "Invalid registrant id" }, { status: 400 });
  }

  try {
    const existing = await queryOne<Registrant>(
      `SELECT id FROM registrants WHERE id = $1`,
      [registrantId]
    );
    if (!existing) {
      return NextResponse.json({ error: "Registrant not found" }, { status: 404 });
    }

    // checkin_log has no ON DELETE CASCADE — remove it first
    await query(`DELETE FROM checkin_log WHERE registrant_id = $1`, [registrantId]);
    // family_members has ON DELETE CASCADE but deleting explicitly is fine too
    await query(`DELETE FROM family_members WHERE registrant_id = $1`, [registrantId]);
    await query(`DELETE FROM registrants WHERE id = $1`, [registrantId]);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[registrants DELETE] error", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
