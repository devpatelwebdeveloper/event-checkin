import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { hashPassword } from "@/lib/auth";
import { UserRow } from "@/lib/types";

// GET /api/users - admin lists all volunteer accounts
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if ("error" in auth) return auth.error;

  const users = await query<UserRow>(
    `SELECT id, name, email, role, created_at FROM users ORDER BY role, name`
  );

  return NextResponse.json({ users });
}

// POST /api/users - admin creates a new volunteer account
export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if ("error" in auth) return auth.error;

  try {
    const { name, email, password, role } = await req.json();

    if (!name || !email || !password || !role) {
      return NextResponse.json(
        { error: "name, email, password, and role are required" },
        { status: 400 }
      );
    }

    if (!["admin", "registrar", "viewer"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);

    const rows = await query<{ id: number }>(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [name.trim(), email.trim().toLowerCase(), passwordHash, role]
    );

    return NextResponse.json({ id: rows[0].id }, { status: 201 });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      );
    }
    console.error("[users POST] error", err);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
