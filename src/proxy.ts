import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

const PROTECTED_PREFIXES: Record<string, Array<"admin" | "registrar" | "viewer">> = {
  "/admin": ["admin"],
  "/registrar": ["admin", "registrar"],
  "/viewer": ["admin", "registrar", "viewer"],
};

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const matchedPrefix = Object.keys(PROTECTED_PREFIXES).find((prefix) =>
    pathname.startsWith(prefix)
  );

  if (!matchedPrefix) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = token ? verifySessionToken(token) : null;

  if (!user) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  const allowedRoles = PROTECTED_PREFIXES[matchedPrefix];
  if (!allowedRoles.includes(user.role)) {
    // Logged in, but wrong role - send them to their own home instead of an error page
    const home =
      user.role === "admin" ? "/admin" : user.role === "registrar" ? "/registrar" : "/viewer";
    return NextResponse.redirect(new URL(home, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/registrar/:path*", "/viewer/:path*"],
};
