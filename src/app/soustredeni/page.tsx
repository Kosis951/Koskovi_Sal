import { BookingDashboard } from "@/components/booking-dashboard";
import { getAdminAccess } from "@/lib/auth";
import {
  getBookings,
  getRecurringCancellationNotices,
  getRecurringOverrideNotices,
} from "@/lib/bookings-db";
import { getPragueDateKey, getVisibleBookings } from "@/lib/schedule";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function SoustredeniPage() {
  const access = getAdminAccess(await cookies());
  const [
    initialBookings,
    initialRecurringCancellations,
    initialRecurringOverrides,
  ] = await Promise.all([
    getBookings(),
    getRecurringCancellationNotices(),
    getRecurringOverrideNotices(),
  ]);

  return (
    <BookingDashboard
      initialAppMode="lessons"
      initialBookings={getVisibleBookings(initialBookings, Boolean(access))}
      initialDate={getPragueDateKey()}
      initialRecurringCancellations={initialRecurringCancellations}
      initialRecurringOverrides={initialRecurringOverrides}
      initialSession={{
        authenticated: Boolean(access),
        lessonFilter: access?.lessonFilter,
        role: access?.role ?? null,
        username: access?.username ?? null,
      }}
    />
  );
}
