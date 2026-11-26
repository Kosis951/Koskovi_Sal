import { NextRequest, NextResponse } from "next/server";
import { requireUserManager } from "@/lib/api-auth";
import { getAdminRole, isMainAdmin, normalizeUsername, sanitizeRole } from "@/lib/auth";
import {
  decideTrainerRequest,
  deleteAdminUser,
  getAdminUsers,
  getTrainerRequests,
  setUserPermissions,
  upsertAdminUserPassword,
  upsertAdminUserRole,
} from "@/lib/admin-users-db";
import { rolePermissions, sanitizePermissions } from "@/lib/permissions";
import { sendToUsers } from "@/lib/push";

export const dynamic = "force-dynamic";

const maxUsernameLength = 60;
const maxPasswordLength = 200;

export async function GET() {
  const auth = await requireUserManager();

  if (auth.error) {
    return auth.error;
  }

  return NextResponse.json(
    { trainerRequests: getTrainerRequests(), users: await getAdminUsers() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// { username, role, permissions } – the account's sections (role: the preset
// it is based on); or { username, trainerRequest: "approve" | "decline" }.
// The main administrator's account and one's own stay as they are.
export async function PATCH(request: NextRequest) {
  const auth = await requireUserManager();

  if (auth.error) {
    return auth.error;
  }

  const actor = auth.access.username;
  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const username = typeof payload?.username === "string" ? payload.username.trim() : "";

  if (!username) {
    return NextResponse.json({ message: "Zadej uživatele." }, { status: 400 });
  }

  if (getAdminRole(username) === "admin" || normalizeUsername(username) === normalizeUsername(actor)) {
    return NextResponse.json({ message: "Práva hlavního správce ani svoje měnit nejde." }, { status: 400 });
  }

  if (payload?.trainerRequest === "approve" || payload?.trainerRequest === "decline") {
    const approve = payload.trainerRequest === "approve";
    const decided = await decideTrainerRequest({ actor, approve, username });

    if (!decided) {
      return NextResponse.json({ message: "Žádost už nečeká." }, { status: 404 });
    }

    // Tell the trainer on their phone (when they have the app).
    void sendToUsers([decided.username], {
      body: approve
        ? "Máš svůj kalendář lekcí: v záložce Lekce nastav časy výuky."
        : "Žádost o trenérský účet nebyla schválena. Účet ti zůstává jako tanečníkovi.",
      tag: "trainer-request",
      title: approve ? "Jsi trenér v TK Koškovi" : "Trenérský účet",
      url: "/lekce",
    }).catch(() => undefined);

    return NextResponse.json({
      message: approve ? `${decided.username} je teď trenér.` : `Žádost ${decided.username} je zamítnutá.`,
    });
  }

  const role = sanitizeRole(payload?.role);

  if (!role) {
    return NextResponse.json({ message: "Neplatná role." }, { status: 400 });
  }

  const permissions = sanitizePermissions(payload?.permissions, rolePermissions(role));
  const user = await setUserPermissions({ actor, permissions, role, username });

  return NextResponse.json({ message: "Práva jsou uložená.", user });
}

export async function POST(request: NextRequest) {
  const auth = await requireUserManager();

  if (auth.error) {
    return auth.error;
  }

  const actor = auth.access.username;
  const payload = (await request.json()) as {
    password?: unknown;
    role?: unknown;
    username?: unknown;
  };
  const username =
    typeof payload.username === "string" ? payload.username.trim() : "";

  if (!username || username.length > maxUsernameLength) {
    return NextResponse.json(
      { message: "Zadej jméno uživatele (max. 60 znaků)." },
      { status: 400 },
    );
  }

  const role = payload.role === undefined ? undefined : sanitizeRole(payload.role);

  if (payload.role !== undefined && !role) {
    return NextResponse.json({ message: "Neplatná role." }, { status: 400 });
  }

  // Only the main administrator may touch their own account.
  if (getAdminRole(username) === "admin" && !isMainAdmin(auth.access)) {
    return NextResponse.json({ message: "Účet hlavního správce měnit nejde." }, { status: 403 });
  }

  if (role && normalizeUsername(username) === normalizeUsername(actor)) {
    return NextResponse.json(
      { message: "Hlavnímu správci nejde změnit roli." },
      { status: 400 },
    );
  }

  if (payload.password !== undefined) {
    if (
      typeof payload.password !== "string" ||
      payload.password.length < 8 ||
      payload.password.length > maxPasswordLength
    ) {
      return NextResponse.json(
        { message: "Heslo musí mít 8 až 200 znaků." },
        { status: 400 },
      );
    }

    const user = await upsertAdminUserPassword({
      actor,
      password: payload.password,
      username,
    });

    if (role) {
      await upsertAdminUserRole({ actor, role, username });
    }

    return NextResponse.json({ message: "Uživatel je uložený.", user });
  }

  if (role) {
    const user = await upsertAdminUserRole({ actor, role, username });

    return NextResponse.json({ message: "Role je uložená.", user });
  }

  return NextResponse.json({ message: "Není co uložit." }, { status: 400 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUserManager();

  if (auth.error) {
    return auth.error;
  }

  const actor = auth.access.username;
  const payload = (await request.json()) as { username?: unknown };
  const username = typeof payload.username === "string" ? payload.username.trim() : "";

  if (!username) {
    return NextResponse.json({ message: "Zadej uživatele." }, { status: 400 });
  }

  if (getAdminRole(username) === "admin" || normalizeUsername(username) === normalizeUsername(actor)) {
    return NextResponse.json(
      { message: "Hlavního správce ani sebe smazat nejde." },
      { status: 400 },
    );
  }

  if (!(await deleteAdminUser({ actor, username }))) {
    return NextResponse.json({ message: "Uživatel nenalezen." }, { status: 404 });
  }

  return NextResponse.json({ deleted: true, message: `Uživatel ${username} je smazaný.` });
}
