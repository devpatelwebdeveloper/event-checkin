import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const user = getSessionFromRequest(req);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  return NextResponse.json({ user });
}
