import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  canAddBookings,
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

// Hall managers and trainers may add bookings to the hall calendar.
export async function requireBookingAuthor(): Promise<AuthResult> {
  const result = await requireSession();

  if (result.error || canAddBookings(result.access)) {
    return result;
  }

  return {
    error: NextResponse.json(
      { message: "Tento účet nemůže přidávat akce do kalendáře sálu." },
      { status: 403 },
    ),
  };
}

// Like requireBookingAuthor, but for changing one existing booking: managers
// may change any, a trainer only the ones that trainer added (and never the
// regular trainings).
export async function requireBookingEditor(
  booking: { createdBy?: string; id: string } | undefined,
): Promise<AuthResult> {
  const result = await requireBookingAuthor();

  if (result.error || canManageBookings(result.access) || !booking) {
    return result;
  }

  if (
    !booking.id.startsWith("recurring-") &&
    booking.createdBy !== undefined &&
    booking.createdBy.toLowerCase() === result.access.username.toLowerCase()
  ) {
    return result;
  }

  return {
    error: NextResponse.json(
      { message: "Upravit nebo smazat jde jen akce, které jsi přidal(a)." },
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
