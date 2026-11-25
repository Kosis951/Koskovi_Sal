import { NextResponse } from "next/server";
import { isEmailTaken, registerUser } from "@/lib/admin-users-db";
import { adminSessionCookie, createAdminSession, getAdminSessionCookieOptions } from "@/lib/auth";

// Letters (with diacritics), digits, space, dot, dash, underscore; 3–40 chars.
export const usernamePattern = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{2,39}$/u;
export const maxPasswordLength = 200;
export const maxEmailLength = 120;
export const maxDisplayNameLength = 60;

// A plain check: something@something.domain, no spaces.
export function isEmail(value: string) {
  return value.length <= maxEmailLength && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export function emailMessage() {
  return "Zadej platný e-mail, např. jana@seznam.cz.";
}

// Checks the registration form ({ username, password, displayName?, email? })
// and creates the dancer's account, signed in right away. `requireEmail` for
// registration without an invite.
export async function registerFromPayload(
  payload: Record<string, unknown> | null,
  options: { invitedBy?: string; requireEmail: boolean },
) {
  const text = (field: string) => (typeof payload?.[field] === "string" ? (payload[field] as string) : "");
  const username = text("username").trim();
  const password = text("password");
  const displayName = text("displayName").replace(/\s+/g, " ").trim();
  const email = text("email").trim().toLowerCase();

  if (!usernamePattern.test(username)) {
    return NextResponse.json(
      { message: "Přihlašovací jméno musí mít 3 až 40 znaků (písmena, číslice, mezera, tečka, pomlčka)." },
      { status: 400 },
    );
  }

  if (password.length < 8 || password.length > maxPasswordLength) {
    return NextResponse.json({ message: "Heslo musí mít aspoň 8 znaků." }, { status: 400 });
  }

  if (displayName.length > maxDisplayNameLength) {
    return NextResponse.json({ message: `Jméno může mít nejvýš ${maxDisplayNameLength} znaků.` }, { status: 400 });
  }

  if ((options.requireEmail || email) && !isEmail(email)) {
    return NextResponse.json({ message: emailMessage() }, { status: 400 });
  }

  if (email && isEmailTaken(email)) {
    return NextResponse.json({ message: "S tímto e-mailem už účet existuje. Přihlas se." }, { status: 409 });
  }

  const result = await registerUser({
    displayName: displayName || undefined,
    email: email || undefined,
    invitedBy: options.invitedBy,
    password,
    username,
  });

  if ("error" in result) {
    const message =
      result.error === "taken"
        ? "Toto přihlašovací jméno už někdo používá, zvol jiné."
        : result.error === "email"
          ? "S tímto e-mailem už účet existuje. Přihlas se."
          : "Registrace je teď pozastavená, ozvi se správcům sálu.";

    return NextResponse.json({ message }, { status: 409 });
  }

  const response = NextResponse.json({ registered: true, trainer: options.invitedBy ?? null, username: result.username });

  response.cookies.set(adminSessionCookie, createAdminSession(result.username), getAdminSessionCookieOptions());

  return response;
}
