import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminAccess } from "@/lib/auth";
import {
  getBookings,
  getRecurringCancellationNotices,
  getRecurringOverrideNotices,
} from "@/lib/bookings-db";
import { getVisibleBookings, hallSettings } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export async function GET() {
  const isSignedIn = Boolean(getAdminAccess(await cookies()));
  const [bookings, recurringCancellations, recurringOverrides] =
    await Promise.all([
      getBookings(),
      getRecurringCancellationNotices(),
      getRecurringOverrideNotices(),
    ]);

  return NextResponse.json(
    {
      source: "database",
      hall: hallSettings,
      bookings: getVisibleBookings(bookings, isSignedIn),
      recurringCancellations,
      recurringOverrides,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
