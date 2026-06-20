import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
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

  const existing = await queryOne<Registrant>(
    `SELECT id FROM registrants WHERE id = $1`,
    [registrantId]
  );
  if (!existing) {
    return NextResponse.json({ error: "Registrant not found" }, { status: 404 });
  }

  await queryOne(
    `DELETE FROM registrants WHERE id = $1`,
    [registrantId]
  );

  return NextResponse.json({ success: true });
}
