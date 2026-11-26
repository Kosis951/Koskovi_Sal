import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUserProfile } from "@/lib/admin-users-db";
import { readStoredAdminUsersSync, normalizeUsername } from "@/lib/auth";
import { appSiteCors } from "@/lib/app-site";
import { createNameLookup, getAdminAccess } from "@/lib/auth";

export async function GET(request: Request) {
  const access = getAdminAccess(await cookies());

  return NextResponse.json(
    {
      authenticated: Boolean(access),
      // Profile name to show instead of the login.
      displayName: access ? createNameLookup().name(access.username) : null,
      // What the account may do, section by section (permissions.ts).
      permissions: access?.permissions ?? null,
      role: access?.role ?? null,
      trainerRequest: access ? trainerRequestOf(access.username) : null,
      // How the dancer is written in the visiting trainer's schedule.
      scheduleName: access ? getUserProfile(access.username).scheduleName ?? null : null,
      username: access?.username ?? null,
    },
    { headers: { ...appSiteCors(request), "Cache-Control": "no-store" } },
  );
}

function trainerRequestOf(username: string) {
  const key = normalizeUsername(username);
  return readStoredAdminUsersSync().find((user) => normalizeUsername(user.username) === key)?.trainerRequest ?? null;
}
