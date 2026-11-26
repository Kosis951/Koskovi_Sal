import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { deleteAdminUser } from "@/lib/admin-users-db";
import {
  adminSessionCookie,
  getAdminRole,
  getAdminSessionCookieOptions,
  normalizeUsername,
  verifyAdminPassword,
} from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// DELETE { password } – the signed-in person deletes their own account (the
// App Store requires it for apps with sign-up). Their profile data goes, as do
// partnerships with other accounts; their phones stop getting their lesson
// reminders. Lessons already booked stay with the trainer.
export async function DELETE(request: NextRequest) {
  const auth = await requireSession();

  if (auth.error) {
    return auth.error;
  }

  const username = auth.access.username;
  const payload = (await request.json().catch(() => null)) as { password?: unknown } | null;

  if (getAdminRole(username) === "admin") {
    return NextResponse.json({ message: "Účet hlavního správce smazat nejde." }, { status: 400 });
  }

  if (typeof payload?.password !== "string" || !(await verifyAdminPassword(username, payload.password))) {
    return NextResponse.json({ message: "Heslo není správné." }, { status: 403 });
  }

  if (!(await deleteAdminUser({ actor: username, username }))) {
    return NextResponse.json({ message: "Účet nenalezen." }, { status: 404 });
  }

  const db = getDb();
  const key = normalizeUsername(username);
  const partnerships = db.prepare("SELECT id, from_user, to_user FROM partnerships").all() as {
    from_user: string;
    id: number;
    to_user: string;
  }[];
  const removePartnership = db.prepare("DELETE FROM partnerships WHERE id = ?");

  for (const row of partnerships) {
    if (normalizeUsername(row.from_user) === key || normalizeUsername(row.to_user) === key) {
      removePartnership.run(row.id);
    }
  }

  const devices = db.prepare("SELECT token, username FROM native_push_devices WHERE username IS NOT NULL").all() as {
    token: string;
    username: string;
  }[];
  const forgetOwner = db.prepare("UPDATE native_push_devices SET username = NULL, live_token = NULL WHERE token = ?");

  for (const device of devices) {
    if (normalizeUsername(device.username) === key) {
      forgetOwner.run(device.token);
    }
  }

  const response = NextResponse.json({ deleted: true, message: "Účet je smazaný." });
  response.cookies.set(adminSessionCookie, "", { ...getAdminSessionCookieOptions(), maxAge: 0 });
  return response;
}
