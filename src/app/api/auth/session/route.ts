import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminAccess } from "@/lib/auth";

export async function GET() {
  const access = getAdminAccess(await cookies());

  return NextResponse.json(
    {
      authenticated: Boolean(access),
      role: access?.role ?? null,
      username: access?.username ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
