import { AlertCircle, Check, Send } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { isRecurringBookingId } from "@/components/booking-dashboard-utils";
import { buttonPrimary, chipClass, noticeTone } from "@/components/ui/styles";
import {
  getOpeningHoursForDate,
  type Booking,
  type BookingRequest,
} from "@/lib/schedule";

type BookingChoice = "seminar" | "soustredeni" | "obsazeno" | "custom";

const choices: Array<{ label: string; value: BookingChoice }> = [
  { label: "Seminář", value: "seminar" },
  { label: "Soustředění", value: "soustredeni" },
  { label: "Obsazeno", value: "obsazeno" },
  { label: "Vlastní…", value: "custom" },
];

const choiceEventType: Record<BookingChoice, BookingRequest["eventType"]> = {
  custom: "soustredeni",
  obsazeno: "obsazeno",
  seminar: "seminar",
  soustredeni: "soustredeni",
};

// New hall booking. The type chips replace the old separate "name" and "type"
// fields; the availability line checks the chosen time before saving.
export function BookingForm({
  availableTrainers,
  bookings,
  isSubmitting,
  onRequestPatch,
  onSetWholeDay,
  onSubmit,
  request,
  submitMessage,
}: {
  availableTrainers: string[];
  bookings: Booking[];
  isSubmitting: boolean;
  onRequestPatch: (patch: Partial<BookingRequest>) => void;
  onSetWholeDay: () => void;
  onSubmit: (bookingName: string) => void;
  request: BookingRequest;
  submitMessage: string;
}) {
  const [choice, setChoice] = useState<BookingChoice>("seminar");
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const availability = useMemo(
    () => checkAvailability(request, bookings),
    [bookings, request],
  );
  const isSaved = submitMessage === "Rezervace je uložena v databázi.";

  function selectChoice(nextChoice: BookingChoice) {
    setChoice(nextChoice);
    onRequestPatch({
      eventType: choiceEventType[nextChoice],
      name: "",
      trainer: nextChoice === "seminar" ? request.trainer : "",
    });

    if (nextChoice === "custom" || nextChoice === "obsazeno") {
      window.setTimeout(() => nameInputRef.current?.focus(), 0);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = request.name.trim();

    onSubmit(
      choice === "custom"
        ? name
        : choice === "obsazeno"
          ? name || "Obsazeno"
          : choices.find((option) => option.value === choice)?.label ?? name,
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <fieldset>
        <legend className="field-label mb-2">Co se bude konat</legend>
        <div className="flex flex-wrap gap-2">
          {choices.map((option) => (
            <button
              aria-pressed={choice === option.value}
              className={chipClass(choice === option.value)}
              key={option.value}
              onClick={() => selectChoice(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      {choice === "custom" || choice === "obsazeno" ? (
        <label className="field-label">
          {choice === "custom" ? "Název akce" : "Důvod (nepovinné)"}
          <input
            className="field-input mt-1"
            onChange={(event) => onRequestPatch({ name: event.target.value })}
            placeholder={
              choice === "custom" ? "Workshop salsy" : "Oprava podlahy"
            }
            ref={nameInputRef}
            required={choice === "custom"}
            value={request.name}
          />
        </label>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <label className="field-label col-span-2">
          Datum
          <input
            className="field-input mt-1"
            onChange={(event) => onRequestPatch({ date: event.target.value })}
            required
            type="date"
            value={request.date}
          />
        </label>
        <label className="field-label">
          Od
          <input
            className="field-input mt-1"
            onChange={(event) => onRequestPatch({ start: event.target.value })}
            required
            type="time"
            value={request.start}
          />
        </label>
        <label className="field-label">
          Do
          <input
            className="field-input mt-1"
            onChange={(event) => onRequestPatch({ end: event.target.value })}
            required
            type="time"
            value={request.end}
          />
        </label>
        <div className="col-span-2 flex flex-wrap items-center justify-between gap-2">
          {availability ? (
            <p
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${noticeTone[availability.tone]}`}
            >
              {availability.tone === "success" ? <Check size={13} /> : <AlertCircle size={13} />}
              {availability.message}
            </p>
          ) : (
            <span />
          )}
          <button
            className="text-xs font-semibold text-brand hover:underline"
            onClick={onSetWholeDay}
            type="button"
          >
            Celý den podle otevírací doby
          </button>
        </div>
      </div>

      {choice === "seminar" ? (
        <label className="field-label">
          Trenér (nepovinné)
          <select
            className="field-input mt-1"
            onChange={(event) => onRequestPatch({ trainer: event.target.value })}
            value={request.trainer}
          >
            <option value="">Bez trenéra</option>
            {availableTrainers.map((trainer) => (
              <option key={trainer} value={trainer}>
                {trainer}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="field-label">
        Poznámka (nepovinné)
        <textarea
          className="field-input mt-1 min-h-20 resize-none"
          onChange={(event) => onRequestPatch({ note: event.target.value })}
          placeholder="Počet lidí, příprava sálu, technika…"
          value={request.note}
        />
      </label>

      <label className="flex items-start gap-3 rounded-lg border border-line bg-subtle p-3 text-sm font-semibold text-ink">
        <input
          checked={Boolean(request.cleanupRequired)}
          className="mt-0.5 h-4 w-4 accent-[var(--k-brand)]"
          onChange={(event) => onRequestPatch({ cleanupRequired: event.target.checked })}
          type="checkbox"
        />
        <span>
          Po akci bude potřeba sál uklidit
          <span className="mt-0.5 block text-xs font-normal text-ink-muted">
            Do potvrzení úklidu se v kalendáři místo volna ukáže „Čeká na úklid“.
          </span>
        </span>
      </label>

      {submitMessage ? (
        <p
          className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
            isSaved ? noticeTone.success : noticeTone.error
          }`}
        >
          {submitMessage}
        </p>
      ) : null}

      <button
        className={`${buttonPrimary} h-11 w-full`}
        disabled={isSubmitting || availability?.tone === "error"}
        type="submit"
      >
        <Send size={16} />
        {isSubmitting ? "Ukládám…" : "Uložit akci"}
      </button>
    </form>
  );
}

function checkAvailability(
  request: BookingRequest,
  bookings: Booking[],
): { message: string; tone: keyof typeof noticeTone } | null {
  const { date, end, start } = request;

  if (!date || !start || !end) {
    return null;
  }

  if (start >= end) {
    return { message: "Konec musí být později než začátek.", tone: "error" };
  }

  const conflicts = bookings.filter(
    (booking) => booking.date === date && booking.start < end && booking.end > start,
  );
  // "Obsazeno" replaces regular trainings at that time; other bookings cannot.
  const replacesTrainings = request.eventType === "obsazeno";
  const blocking = conflicts.filter(
    (booking) => !(replacesTrainings && isRecurringBookingId(booking.id)),
  );

  if (blocking.length > 0) {
    return {
      message: `Koliduje s: ${blocking
        .map((booking) => `${booking.title} ${booking.start}–${booking.end}`)
        .join(", ")}`,
      tone: "error",
    };
  }

  if (conflicts.length > 0) {
    return {
      message: `Zruší trénink: ${conflicts.map((booking) => booking.title).join(", ")}`,
      tone: "warning",
    };
  }

  const openingHours = getOpeningHoursForDate(new Date(`${date}T12:00:00`));

  if (!openingHours) {
    return { message: "V tento den je sál zavřený.", tone: "warning" };
  }

  if (start < openingHours.start || end > openingHours.end) {
    return {
      message: `Mimo otevírací dobu ${openingHours.start}–${openingHours.end}.`,
      tone: "warning",
    };
  }

  return { message: "Čas je volný", tone: "success" };
}
