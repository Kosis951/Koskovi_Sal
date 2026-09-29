import { isRecurringBookingId } from "@/components/booking-dashboard-utils";
import type { RecurringCancellationNotice } from "@/lib/bookings-db";
import {
  formatDateKey,
  getCleanupEndDateTime,
  getOpeningHoursForDate,
  type Booking,
} from "@/lib/schedule";

export type CalendarItemKind = "training" | "event" | "busy" | "cleanup" | "cancelled";

export type CalendarItem = {
  booking?: Booking;
  end: number;
  id: string;
  kind: CalendarItemKind;
  // Horizontal position when items overlap: lane index out of `lanes`.
  lane: number;
  lanes: number;
  start: number;
  title: string;
  trainer?: string;
};

export type CalendarDay = {
  date: Date;
  dateKey: string;
  items: CalendarItem[];
  // Opening hours in minutes after midnight; null when the hall is closed.
  openEnd: number | null;
  openStart: number | null;
};

// Minutes before closing reserved for leaving the hall.
export const departureMinutes = 30;

export function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function getBookingKind(booking: Booking): CalendarItemKind {
  if (isRecurringBookingId(booking.id)) {
    return "training";
  }

  return booking.status === "maintenance" ? "busy" : "event";
}

export function buildCalendarDays({
  bookings,
  cancellations,
  days,
}: {
  bookings: Booking[];
  cancellations: RecurringCancellationNotice[];
  days: Date[];
}): CalendarDay[] {
  const bookingsByDate = new Map<string, Booking[]>();

  for (const booking of bookings) {
    const dateBookings = bookingsByDate.get(booking.date) ?? [];
    dateBookings.push(booking);
    bookingsByDate.set(booking.date, dateBookings);
  }

  const pendingCleanups = bookings
    .filter((booking) => booking.cleanupRequired && !booking.cleanedAt)
    .map((booking) => ({
      booking,
      end: getCleanupEndDateTime(booking, bookings),
      start: new Date(`${booking.date}T${booking.end}:00`),
    }));

  return days.map((date) => {
    const dateKey = formatDateKey(date);
    const openingHours = getOpeningHoursForDate(date);
    const openStart = openingHours ? timeToMinutes(openingHours.start) : null;
    const openEnd = openingHours ? timeToMinutes(openingHours.end) : null;
    const items: Omit<CalendarItem, "lane" | "lanes">[] = (
      bookingsByDate.get(dateKey) ?? []
    ).map((booking) => ({
      booking,
      end: timeToMinutes(booking.end),
      id: booking.id,
      kind: getBookingKind(booking),
      start: timeToMinutes(booking.start),
      title: booking.title,
      trainer: booking.trainer,
    }));

    if (openStart !== null && openEnd !== null) {
      const dayStart = new Date(`${dateKey}T00:00:00`).getTime();

      for (const cleanup of pendingCleanups) {
        const start = Math.max(
          (cleanup.start.getTime() - dayStart) / 60000,
          openStart,
        );
        const end = Math.min(
          cleanup.end ? (cleanup.end.getTime() - dayStart) / 60000 : Infinity,
          openEnd,
        );

        if (end > start) {
          items.push({
            booking: cleanup.booking,
            end,
            id: `cleanup-${cleanup.booking.id}-${dateKey}`,
            kind: "cleanup",
            start,
            title: `Úklid po: ${cleanup.booking.title}`,
          });
        }
      }
    }

    for (const cancellation of cancellations) {
      const start = timeToMinutes(cancellation.start);
      const end = timeToMinutes(cancellation.end);
      const isReplaced = items.some((item) => item.start < end && item.end > start);

      if (cancellation.date === dateKey && !isReplaced) {
        items.push({
          end,
          id: cancellation.id,
          kind: "cancelled",
          start,
          title: cancellation.title,
        });
      }
    }

    return { date, dateKey, items: assignLanes(items), openEnd, openStart };
  });
}

// Splits overlapping items into side-by-side lanes, like a calendar app.
function assignLanes(items: Omit<CalendarItem, "lane" | "lanes">[]) {
  const sorted = [...items].sort(
    (left, right) => left.start - right.start || right.end - left.end,
  );
  const result: CalendarItem[] = [];
  let cluster: CalendarItem[] = [];
  let clusterEnd = -Infinity;

  function closeCluster() {
    const lanes = Math.max(1, ...cluster.map((item) => item.lane + 1));

    for (const item of cluster) {
      item.lanes = lanes;
    }

    result.push(...cluster);
    cluster = [];
  }

  for (const item of sorted) {
    if (item.start >= clusterEnd) {
      closeCluster();
      clusterEnd = -Infinity;
    }

    const usedLanes = new Set(
      cluster.filter((other) => other.end > item.start).map((other) => other.lane),
    );
    let lane = 0;

    while (usedLanes.has(lane)) {
      lane += 1;
    }

    cluster.push({ ...item, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, item.end);
  }

  closeCluster();

  return result;
}

// Hour range covering the opening hours and every item of the given days.
export function getVisibleRange(days: CalendarDay[]) {
  let start = Infinity;
  let end = -Infinity;

  for (const day of days) {
    if (day.openStart !== null && day.openEnd !== null) {
      start = Math.min(start, day.openStart);
      end = Math.max(end, day.openEnd);
    }

    for (const item of day.items) {
      start = Math.min(start, item.start);
      end = Math.max(end, item.end);
    }
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { end: 22 * 60, start: 10 * 60 };
  }

  return {
    end: Math.min(24 * 60, Math.ceil(end / 60) * 60),
    start: Math.floor(start / 60) * 60,
  };
}

export type HallStatus = {
  detail: string;
  title: string;
  tone: "free" | "busy" | "cleanup" | "closed";
};

// What someone opening the page wants to know first: can I use the hall now?
export function getHallStatus(today: CalendarDay, nowMinutes: number): HallStatus {
  const { openEnd, openStart } = today;
  const activeItems = today.items
    .filter((item) => item.kind !== "cancelled")
    .sort((left, right) => left.start - right.start);

  if (openStart === null || openEnd === null) {
    return { detail: "Dnes je sál zavřený.", title: "Sál je dnes zavřený", tone: "closed" };
  }

  if (nowMinutes < openStart) {
    return {
      detail: `Otevírá se dnes v ${minutesToTime(openStart)}.`,
      title: "Sál je zatím zavřený",
      tone: "closed",
    };
  }

  if (nowMinutes >= openEnd) {
    return {
      detail: `Dnes bylo otevřeno do ${minutesToTime(openEnd)}.`,
      title: "Sál je už zavřený",
      tone: "closed",
    };
  }

  const windows = getFreeWindows(today);
  const usableEnd = openEnd - departureMinutes;
  const nextWindow = windows.find((window) => window.end > nowMinutes);
  const freeLater = nextWindow
    ? `Volno od ${minutesToTime(Math.max(nextWindow.start, nowMinutes))}.`
    : "Dnes už volno nebude.";
  const current = activeItems.find(
    (item) => item.start <= nowMinutes && item.end > nowMinutes,
  );

  if (current?.kind === "cleanup") {
    return {
      detail: "Po skončené akci je potřeba sál uklidit.",
      title: "Sál čeká na úklid",
      tone: "cleanup",
    };
  }

  if (current) {
    return {
      detail: freeLater,
      title: `Teď obsazeno: ${current.title} do ${minutesToTime(current.end)}`,
      tone: "busy",
    };
  }

  if (nowMinutes >= usableEnd) {
    return {
      detail: `Posledních ${departureMinutes} minut před zavíračkou (${minutesToTime(
        openEnd,
      )}) je na odchod ze sálu.`,
      title: "Sál se zavírá",
      tone: "closed",
    };
  }

  const next = activeItems.find((item) => item.start > nowMinutes);
  const nextLabel = next
    ? `${next.kind === "cleanup" ? "úklid" : next.title} (${minutesToTime(
        next.start,
      )}–${minutesToTime(next.end)})`
    : "";

  // A gap of 45 minutes or less is too short to count as free time.
  if (nextWindow && nextWindow.start <= nowMinutes) {
    return next && next.start < usableEnd
      ? {
          detail: `Pak ${nextLabel}.`,
          title: `Sál je teď volný do ${minutesToTime(next.start)}`,
          tone: "free",
        }
      : {
          detail: `Otevřeno do ${minutesToTime(openEnd)}.`,
          title: "Sál je teď volný až do konce dne",
          tone: "free",
        };
  }

  return {
    detail: freeLater,
    title: next
      ? `Jen krátká pauza do ${minutesToTime(next.start)}, pak ${nextLabel}`
      : "Jen krátká pauza před zavíračkou",
    tone: "busy",
  };
}

// Only gaps longer than this count as free time (status bar and free hours).
export const minimumFreeMinutes = 45;

// Periods within opening hours (minus the departure window) with nothing
// booked, longer than `minimumFreeMinutes`.
export function getFreeWindows(day: CalendarDay) {
  if (day.openStart === null || day.openEnd === null) {
    return [];
  }

  const usableEnd = day.openEnd - departureMinutes;
  const busy = day.items
    .filter((item) => item.kind !== "cancelled")
    .map((item) => [item.start, item.end])
    .sort((left, right) => left[0] - right[0]);
  const windows: Array<{ end: number; start: number }> = [];
  let cursor = day.openStart;

  for (const [start, end] of [...busy, [usableEnd, usableEnd]]) {
    const windowEnd = Math.min(start, usableEnd);

    if (windowEnd - cursor > minimumFreeMinutes) {
      windows.push({ end: windowEnd, start: cursor });
    }

    cursor = Math.max(cursor, end);

    if (cursor >= usableEnd) {
      break;
    }
  }

  return windows;
}

export function getFreeMinutes(day: CalendarDay) {
  return getFreeWindows(day).reduce((total, window) => total + window.end - window.start, 0);
}
