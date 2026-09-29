import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import {
  adminSessionCookie,
  createAdminSession,
  getAdminSessionCookieOptions,
  verifyAdminPassword,
} from "@/lib/auth";
import { upsertAdminUserPassword } from "@/lib/admin-users-db";

export const dynamic = "force-dynamic";

const maxPasswordLength = 200;

export async function POST(request: NextRequest) {
  const auth = await requireSession();

  if (auth.error) {
    return auth.error;
  }

  const actor = auth.access.username;
  const payload = (await request.json()) as {
    currentPassword?: unknown;
    newPassword?: unknown;
  };

  if (
    typeof payload.newPassword !== "string" ||
    payload.newPassword.length < 8 ||
    payload.newPassword.length > maxPasswordLength
  ) {
    return NextResponse.json(
      { message: "Nové heslo musí mít 8 až 200 znaků." },
      { status: 400 },
    );
  }

  // Required for every account, so a stolen session cookie alone cannot be
  // turned into a permanent account takeover.
  if (
    typeof payload.currentPassword !== "string" ||
    !(await verifyAdminPassword(actor, payload.currentPassword))
  ) {
    return NextResponse.json(
      { message: "Současné heslo není správné." },
      { status: 403 },
    );
  }

  await upsertAdminUserPassword({
    actor,
    password: payload.newPassword,
    username: actor,
  });

  // The password change invalidates all existing sessions, including this one.
  const response = NextResponse.json({ message: "Heslo je změněné." });
  response.cookies.set(
    adminSessionCookie,
    createAdminSession(actor),
    getAdminSessionCookieOptions(),
  );

  return response;
}
