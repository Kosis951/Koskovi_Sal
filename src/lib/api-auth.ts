import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  canManageBookings,
  getAdminAccess,
  isMainAdmin,
  type AdminAccess,
} from "@/lib/auth";

type AuthResult =
  | { access: AdminAccess; error?: never }
  | { access?: never; error: NextResponse };

// Every API route must authorize on the server: the UI hiding a button is not
// a permission check.
export async function requireSession(): Promise<AuthResult> {
  const access = getAdminAccess(await cookies());

  if (!access) {
    return {
      error: NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 }),
    };
  }

  return { access };
}

export async function requireManager(): Promise<AuthResult> {
  const result = await requireSession();

  if (result.error || canManageBookings(result.access)) {
    return result;
  }

  return {
    error: NextResponse.json(
      { message: "Tento účet nemá přístup ke správě akcí." },
      { status: 403 },
    ),
  };
}

export async function requireMainAdmin(): Promise<AuthResult> {
  const result = await requireSession();

  if (result.error || isMainAdmin(result.access)) {
    return result;
  }

  return {
    error: NextResponse.json(
      { message: "Přístup má jen hlavní správce." },
      { status: 403 },
    ),
  };
}
