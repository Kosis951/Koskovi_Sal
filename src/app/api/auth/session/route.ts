import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createNameLookup, getAdminAccess } from "@/lib/auth";

export async function GET() {
  const access = getAdminAccess(await cookies());

  return NextResponse.json(
    {
      authenticated: Boolean(access),
      // Profile name to show instead of the login.
      displayName: access ? createNameLookup().name(access.username) : null,
      role: access?.role ?? null,
      username: access?.username ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
