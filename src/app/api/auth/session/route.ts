import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUserProfile } from "@/lib/admin-users-db";
import { createNameLookup, getAdminAccess } from "@/lib/auth";

export async function GET() {
  const access = getAdminAccess(await cookies());

  return NextResponse.json(
    {
      authenticated: Boolean(access),
      // Profile name to show instead of the login.
      displayName: access ? createNameLookup().name(access.username) : null,
      role: access?.role ?? null,
      // How the dancer is written in the visiting trainer's schedule.
      scheduleName: access ? getUserProfile(access.username).scheduleName ?? null : null,
      username: access?.username ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
