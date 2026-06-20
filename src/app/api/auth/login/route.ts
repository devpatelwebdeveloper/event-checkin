import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { verifyPassword, signSession, SESSION_COOKIE_NAME } from "@/lib/auth";

interface UserAuthRow {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: "admin" | "registrar" | "viewer";
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const user = await queryOne<UserAuthRow>(
      `SELECT id, name, email, password_hash, role FROM users WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const sessionUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
    const token = signSession(sessionUser);

    const res = NextResponse.json({ user: sessionUser });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12, // 12 hours
    });
    return res;
  } catch (err) {
    console.error("[login] error", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
