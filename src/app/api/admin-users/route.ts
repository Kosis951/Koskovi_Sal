import { NextRequest, NextResponse } from "next/server";
import { requireMainAdmin } from "@/lib/api-auth";
import { normalizeUsername, sanitizeLessonFilter, sanitizeRole } from "@/lib/auth";
import {
  getAdminUsers,
  upsertAdminUserLessonFilter,
  upsertAdminUserPassword,
  upsertAdminUserRole,
} from "@/lib/admin-users-db";

export const dynamic = "force-dynamic";

const maxUsernameLength = 60;
const maxPasswordLength = 200;

export async function GET() {
  const auth = await requireMainAdmin();

  if (auth.error) {
    return auth.error;
  }

  return NextResponse.json(
    { users: await getAdminUsers() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireMainAdmin();

  if (auth.error) {
    return auth.error;
  }

  const actor = auth.access.username;
  const payload = (await request.json()) as {
    lessonFilter?: {
      type?: "all" | "dancer" | "trainer";
      value?: string;
    };
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

    if (payload.lessonFilter) {
      await upsertAdminUserLessonFilter({
        actor,
        lessonFilter: sanitizeLessonFilter(payload.lessonFilter),
        username,
      });
    }

    if (role) {
      await upsertAdminUserRole({ actor, role, username });
    }

    return NextResponse.json({ message: "Uživatel je uložený.", user });
  }

  if (role) {
    const user = await upsertAdminUserRole({ actor, role, username });

    return NextResponse.json({ message: "Role je uložená.", user });
  }

  const user = await upsertAdminUserLessonFilter({
    actor,
    lessonFilter: sanitizeLessonFilter(payload.lessonFilter),
    username,
  });

  return NextResponse.json({ message: "Filtr soustředění je uložený.", user });
}
