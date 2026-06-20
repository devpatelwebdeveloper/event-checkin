import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken, Role, SessionUser } from "./auth";

export function getSessionFromRequest(req: NextRequest): SessionUser | null {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Use at the top of any API route handler to enforce role access.
 * Returns the session user if allowed, or a NextResponse to return early if not.
 */
export function requireRole(
  req: NextRequest,
  allowed: Role[]
): { user: SessionUser } | { error: NextResponse } {
  const user = getSessionFromRequest(req);
  if (!user) {
    return {
      error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }
  if (!allowed.includes(user.role)) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { user };
}
