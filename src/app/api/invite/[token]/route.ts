import { NextRequest, NextResponse } from "next/server";
import { registerInvitedUser } from "@/lib/admin-users-db";
import {
  adminSessionCookie,
  createAdminSession,
  getAdminSessionCookieOptions,
} from "@/lib/auth";
import { findTrainerByInvite } from "@/lib/lessons-db";
import { getClientIp } from "@/lib/login-rate-limit";
import { isRateLimited } from "@/lib/simple-rate-limit";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };

// Letters (with diacritics), digits, space, dot, dash, underscore; 3–40 chars.
const usernamePattern = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{2,39}$/u;
const maxPasswordLength = 200;

// Register through the invite: { username, password }. Creates a read-only
// account and signs it in. Without a valid invite there is no registration.
export async function POST(request: NextRequest, context: RouteContext) {
  if (isRateLimited(`register:${getClientIp(request.headers)}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json(
      { message: "Příliš mnoho registrací z jednoho místa, zkus to později." },
      { status: 429 },
    );
  }

  const trainer = await findTrainerByInvite((await context.params).token);

  if (!trainer) {
    return NextResponse.json({ message: "Pozvánka neplatí." }, { status: 404 });
  }

  const payload = (await request.json().catch(() => null)) as {
    password?: unknown;
    username?: unknown;
  } | null;
  const username = typeof payload?.username === "string" ? payload.username.trim() : "";
  const password = typeof payload?.password === "string" ? payload.password : "";

  if (!usernamePattern.test(username)) {
    return NextResponse.json(
      { message: "Jméno musí mít 3 až 40 znaků (písmena, číslice, mezera, tečka, pomlčka)." },
      { status: 400 },
    );
  }

  if (password.length < 8 || password.length > maxPasswordLength) {
    return NextResponse.json({ message: "Heslo musí mít aspoň 8 znaků." }, { status: 400 });
  }

  const result = await registerInvitedUser({ invitedBy: trainer, password, username });

  if ("error" in result) {
    return NextResponse.json(
      {
        message:
          result.error === "taken"
            ? "Toto jméno už někdo používá, zvol jiné."
            : "Registrace je teď pozastavená, ozvi se trenérovi.",
      },
      { status: 409 },
    );
  }

  const response = NextResponse.json({ registered: true, trainer, username: result.username });

  response.cookies.set(
    adminSessionCookie,
    createAdminSession(result.username),
    getAdminSessionCookieOptions(),
  );

  return response;
}
