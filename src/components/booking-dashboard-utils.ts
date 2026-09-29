import {
  createTimeSlots,
  getOpeningHoursForDate,
  getPendingCleanupBooking,
  hallSettings,
  isDepartureSlot,
  isSlotBooked,
  isSlotOpen,
  type Booking,
} from "@/lib/schedule";

export const longDateFormatter = new Intl.DateTimeFormat("cs-CZ", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

export const monthLabelFormatter = new Intl.DateTimeFormat("cs-CZ", {
  month: "long",
  year: "numeric",
});

export const cancellationDateFormatter = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "numeric",
});

export type DayAvailabilitySegment =
  | {
      description?: string;
      end: string;
      kind: "free" | "closed" | "cleanup" | "departure";
      cleanupBookingId?: string;
      start: string;
      title: string;
    }
  | {
      description: string;
      end: string;
      kind: "booked";
      bookingId: string;
      start: string;
      status: Booking["status"];
      title: string;
      trainer?: string;
    };

export function getMonthDays(dateKey: string) {
  const base = new Date(`${dateKey}T12:00:00`);
  const firstDay = new Date(base.getFullYear(), base.getMonth(), 1, 12);
  const month = firstDay.getMonth();
  const days: Date[] = [];

  for (
    const day = new Date(firstDay);
    day.getMonth() === month;
    day.setDate(day.getDate() + 1)
  ) {
    days.push(new Date(day));
  }

  return days;
}

export function getWeekStartDate(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);

  return date;
}

export function formatEventCount(count: number) {
  if (count >= 5 || count === 0) {
    return `${count} akcí`;
  }

  return `${count} akce`;
}

// Cleaning entries are housekeeping, not events people come to.
export function isCountableEvent(booking: Booking) {
  const normalizedTitle = normalizeText(booking.title);

  return !normalizedTitle.includes("uklid") && !normalizedTitle.includes("neuklizen");
}

export function isRecurringBookingId(bookingId: string) {
  return bookingId.startsWith("recurring-");
}

// The selected day as consecutive free / booked / cleanup / departure
// periods, used by the day agenda.
export function getDayAvailabilitySegments(
  dateKey: string,
  bookingList: Booking[],
  slotMinutes = hallSettings.slotMinutes,
): DayAvailabilitySegment[] {
  const date = new Date(`${dateKey}T12:00:00`);
  const openingHours = getOpeningHoursForDate(date);
  const dayBookings = bookingList.filter((booking) => booking.date === dateKey);
  const closedDay: DayAvailabilitySegment[] = [
    { end: "23:59", kind: "closed", start: "00:00", title: "Zavřeno" },
  ];

  if (!openingHours && dayBookings.length === 0) {
    return closedDay;
  }

  const segments: DayAvailabilitySegment[] = [];
  const slots = createTimeSlots(
    slotMinutes,
    dayBookings.map((booking) => ({ end: booking.end, start: booking.start })),
  );

  for (const slot of slots) {
    const isOpen = isSlotOpen(date, slot);
    const rawSlotEnd = addMinutes(slot, slotMinutes);
    const booking = isSlotBooked(bookingList, dateKey, slot, slotMinutes);
    const isDeparture = isDepartureSlot(date, slot, slotMinutes);
    const cleanupBooking =
      isOpen && !booking
        ? getPendingCleanupBooking(bookingList, dateKey, slot, slotMinutes)
        : undefined;

    if (!isOpen && !booking && !cleanupBooking) {
      continue;
    }

    const slotEnd =
      isOpen && openingHours ? minTime(rawSlotEnd, openingHours.end) : rawSlotEnd;
    const nextSegment: DayAvailabilitySegment = booking
      ? {
          bookingId: booking.id,
          description: formatBookingDescription(booking),
          end: minTime(booking.end, slotEnd),
          kind: "booked",
          start: maxTime(booking.start, slot),
          status: booking.status,
          title: booking.title,
          trainer: booking.trainer,
        }
      : cleanupBooking
        ? {
            cleanupBookingId: cleanupBooking.id,
            description: `Po akci: ${cleanupBooking.title}`,
            end: slotEnd,
            kind: "cleanup",
            start: slot,
            title: "Čeká na úklid",
          }
        : isDeparture
          ? { end: slotEnd, kind: "departure", start: slot, title: "Odchod ze sálu" }
          : { end: slotEnd, kind: "free", start: slot, title: "Volno" };

    const previousSegment = segments[segments.length - 1];

    if (canMergeSegments(previousSegment, nextSegment)) {
      previousSegment.end = nextSegment.end;
      continue;
    }

    segments.push(nextSegment);
  }

  if (segments.length > 0) {
    return segments;
  }

  return openingHours
    ? [
        {
          end: openingHours.end,
          kind: "free",
          start: openingHours.start,
          title: "Volno celý den",
        },
      ]
    : closedDay;
}

function formatBookingDescription(booking: Booking) {
  return booking.trainer
    ? `${booking.organizer} · Trenér: ${booking.trainer}`
    : booking.organizer;
}

function canMergeSegments(
  previousSegment: DayAvailabilitySegment | undefined,
  nextSegment: DayAvailabilitySegment,
) {
  if (!previousSegment || previousSegment.kind !== nextSegment.kind) {
    return false;
  }

  if (previousSegment.kind === "booked" && nextSegment.kind === "booked") {
    return (
      previousSegment.title === nextSegment.title &&
      previousSegment.description === nextSegment.description &&
      previousSegment.bookingId === nextSegment.bookingId &&
      previousSegment.status === nextSegment.status
    );
  }

  if (previousSegment.kind === "cleanup" && nextSegment.kind === "cleanup") {
    return (
      previousSegment.title === nextSegment.title &&
      previousSegment.description === nextSegment.description &&
      previousSegment.cleanupBookingId === nextSegment.cleanupBookingId
    );
  }

  return (
    previousSegment.title === nextSegment.title &&
    previousSegment.description === nextSegment.description
  );
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function addMinutes(time: string, minutes: number) {
  return minutesToTime(timeToMinutes(time) + minutes);
}

function minTime(left: string, right: string) {
  return timeToMinutes(left) <= timeToMinutes(right) ? left : right;
}

function maxTime(left: string, right: string) {
  return timeToMinutes(left) >= timeToMinutes(right) ? left : right;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
