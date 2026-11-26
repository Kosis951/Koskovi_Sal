import { NextResponse } from "next/server";
import { appSiteCors } from "@/lib/app-site";
import { adminSessionCookie, getAdminSessionCookieOptions } from "@/lib/auth";

export async function POST(request: Request) {
  const response = NextResponse.json({ authenticated: false }, { headers: appSiteCors(request) });
  response.cookies.set(adminSessionCookie, "", {
    ...getAdminSessionCookieOptions(),
    maxAge: 0,
  });

  return response;
}
