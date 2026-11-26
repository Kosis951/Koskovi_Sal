import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  canAddBookings,
  canManageBookings,
  getAdminAccess,
  isMainAdmin,
  type AdminAccess,
} from "@/lib/auth";
import { can } from "@/lib/permissions";

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

// The signed-in account, if it may use that part (permissions.ts).
async function requirePermission(allowed: (access: AdminAccess) => boolean, message: string): Promise<AuthResult> {
  const result = await requireSession();

  if (result.error || allowed(result.access)) {
    return result;
  }

  return { error: NextResponse.json({ message }, { status: 403 }) };
}

// Every hall event, the regular trainings and the holidays.
export function requireHallManager() {
  return requirePermission(canManageBookings, "Tento účet nemá přístup ke správě akcí.");
}

// The visiting trainer's schedule and the dancers' requests about it.
export function requireScheduleEditor() {
  return requirePermission(can.editSchedule, "Tento účet nemůže upravovat rozpis.");
}

// The overview and the history of changes.
export function requireStatsViewer() {
  return requirePermission(can.seeStats, "Tento účet nemá přístup k historii změn.");
}

// Accounts, their sections and trainer requests.
export function requireUserManager() {
  return requirePermission(can.manageUsers, "Tento účet nemůže spravovat uživatele.");
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
