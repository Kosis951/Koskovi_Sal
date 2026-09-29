import { NextResponse } from "next/server";
import { adminSessionCookie, getAdminSessionCookieOptions } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(adminSessionCookie, "", {
    ...getAdminSessionCookieOptions(),
    maxAge: 0,
  });

  return response;
}
