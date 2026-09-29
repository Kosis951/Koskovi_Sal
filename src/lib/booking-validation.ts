import type { BookingInput } from "@/lib/bookings-db";
import type { BookingKind, BookingStatus, HallEventType } from "@/lib/schedule";

export const maxBookingTitleLength = 120;
export const maxBookingNoteLength = 1000;
export const maxTrainerLength = 60;

const hallEventTypes: HallEventType[] = ["soustredeni", "seminar", "obsazeno"];

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isTimeValue(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

// Returns an error message for the user, or null when the time range is valid.
export function getTimeRangeError(start: unknown, end: unknown) {
  if (!isTimeValue(start) || !isTimeValue(end)) {
    return "Vyplň platný čas začátku a konce.";
  }

  if (start >= end) {
    return "Konec akce musí být později než začátek.";
  }

  return null;
}

// Builds a booking only from known fields, so clients cannot set internal
// ones such as cleanedAt, createdBy or id.
export function parseBookingInput(
  payload: unknown,
): { error: string; ok: false } | { input: BookingInput; ok: true } {
  const value = (payload ?? {}) as Record<string, unknown>;
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const organizer =
    typeof value.organizer === "string" ? value.organizer.trim() : title;
  const note = typeof value.note === "string" ? value.note.trim() : "";
  const trainer = typeof value.trainer === "string" ? value.trainer.trim() : "";

  if (!title || title.length > maxBookingTitleLength) {
    return { ok: false, error: `Název akce musí mít 1 až ${maxBookingTitleLength} znaků.` };
  }

  if (organizer.length > maxBookingTitleLength) {
    return { ok: false, error: "Pořadatel je příliš dlouhý." };
  }

  if (note.length > maxBookingNoteLength) {
    return { ok: false, error: `Poznámka může mít nejvýš ${maxBookingNoteLength} znaků.` };
  }

  if (trainer.length > maxTrainerLength) {
    return { ok: false, error: "Jméno trenéra je příliš dlouhé." };
  }

  if (!isDateKey(value.date)) {
    return { ok: false, error: "Vyplň platné datum." };
  }

  const timeError = getTimeRangeError(value.start, value.end);

  if (timeError) {
    return { ok: false, error: timeError };
  }

  const status: BookingStatus =
    value.status === "maintenance" ? "maintenance" : "confirmed";
  const bookingKind: BookingKind =
    value.bookingKind === "individual-lesson" ? "individual-lesson" : "hall";
  const eventType = hallEventTypes.includes(value.eventType as HallEventType)
    ? (value.eventType as HallEventType)
    : undefined;

  return {
    ok: true,
    input: {
      bookingKind,
      cleanupRequired: value.cleanupRequired === true,
      date: value.date,
      end: value.end as string,
      eventType,
      note: note || undefined,
      organizer: organizer || title,
      start: value.start as string,
      status,
      title,
      trainer: trainer || undefined,
    },
  };
}
