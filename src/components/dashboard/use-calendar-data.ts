import { useCallback, useEffect, useRef, useState } from "react";
import { useRefreshHandler } from "@/components/pwa/pull-to-refresh";
import type {
  RecurringCancellationNotice,
  RecurringOverrideNotice,
} from "@/lib/bookings-db";
import type { Booking } from "@/lib/schedule";

const syncIntervalMs = 60000;

// Bookings and recurring-training notices, kept in sync with the server every
// minute and whenever the tab becomes visible again.
export function useCalendarData({
  initialBookings,
  initialRecurringCancellations,
  initialRecurringOverrides,
}: {
  initialBookings: Booking[];
  initialRecurringCancellations: RecurringCancellationNotice[];
  initialRecurringOverrides: RecurringOverrideNotice[];
}) {
  const [bookings, setBookings] = useState(initialBookings);
  const [recurringCancellations, setRecurringCancellations] = useState(
    initialRecurringCancellations,
  );
  const [recurringOverrides, setRecurringOverrides] = useState(
    initialRecurringOverrides,
  );
  const lastResponseRef = useRef<string | null>(null);

  const syncCalendar = useCallback(async () => {
    const response = await fetch("/api/availability", { cache: "no-store" });

    if (!response.ok) {
      return;
    }

    const responseText = await response.text();

    // Unchanged data would only produce new array identities and recompute
    // every slot, so skip the state update entirely.
    if (responseText === lastResponseRef.current) {
      return;
    }

    lastResponseRef.current = responseText;

    const data = JSON.parse(responseText) as {
      bookings: Booking[];
      recurringCancellations?: RecurringCancellationNotice[];
      recurringOverrides?: RecurringOverrideNotice[];
    };

    setBookings(data.bookings);
    setRecurringCancellations(data.recurringCancellations ?? []);
    setRecurringOverrides(data.recurringOverrides ?? []);
  }, []);

  // Shows a just-created booking before the follow-up sync returns.
  const addBooking = useCallback((booking: Booking) => {
    setBookings((current) =>
      [...current.filter((candidate) => candidate.id !== booking.id), booking].sort(
        (left, right) =>
          `${left.date}${left.start}`.localeCompare(`${right.date}${right.start}`),
      ),
    );
  }, []);

  useEffect(() => {
    function syncWhenVisible() {
      if (document.visibilityState === "visible") {
        void syncCalendar();
      }
    }

    const interval = window.setInterval(() => {
      void syncCalendar();
    }, syncIntervalMs);

    window.addEventListener("focus", syncWhenVisible);
    document.addEventListener("visibilitychange", syncWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncWhenVisible);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [syncCalendar]);

  // Pull-to-refresh in the installed app.
  useRefreshHandler(syncCalendar);

  return {
    addBooking,
    bookings,
    recurringCancellations,
    recurringOverrides,
    syncCalendar,
  };
}
