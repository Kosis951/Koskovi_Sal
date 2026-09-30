"use client";

import { ChevronDown, Pencil, Save, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDateCz, useAdminBookings } from "@/components/admin/admin-data";
import { isRecurringBookingId } from "@/components/booking-dashboard-utils";
import { getBookingKind } from "@/components/dashboard/calendar-events";
import { useBookingActions, type BookingActions } from "@/components/dashboard/use-booking-actions";
import { chipClass, noticeTone } from "@/components/ui/styles";
import { trainerOptions, type Booking } from "@/lib/schedule";

type Filter = "all" | "events" | "trainings" | "busy" | "cleanup" | "lessons";

const filters: Array<{ label: string; value: Filter }> = [
  { label: "Vše", value: "all" },
  { label: "Akce", value: "events" },
  { label: "Tréninky", value: "trainings" },
  { label: "Obsazeno", value: "busy" },
  { label: "Čeká na úklid", value: "cleanup" },
  { label: "Lekce", value: "lessons" },
];

const pageSize = 40;

function matchesFilter(booking: Booking, filter: Filter) {
  const isLesson = booking.bookingKind === "individual-lesson";
  const kind = getBookingKind(booking);

  switch (filter) {
    case "all":
      return true;
    case "events":
      return !isLesson && kind === "event";
    case "trainings":
      return kind === "training";
    case "busy":
      return kind === "busy";
    case "cleanup":
      return Boolean(booking.cleanupRequired && !booking.cleanedAt);
    case "lessons":
      return isLesson;
  }
}

export function AdminBookingsList() {
  const { data: bookings, error, isLoading, reload } = useAdminBookings();
  const actions = useBookingActions(reload);
  const [filter, setFilter] = useState<Filter>("events");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(pageSize);
  const [expandedId, setExpandedId] = useState("");
  const availableTrainers = useMemo(() => {
    const trainers = new Set(trainerOptions);

    for (const booking of bookings) {
      if (booking.trainer) {
        trainers.add(booking.trainer);
      }
    }

    return [...trainers];
  }, [bookings]);
  const filtered = useMemo(() => {
    const normalizedQuery = normalize(query);

    return bookings.filter(
      (booking) =>
        matchesFilter(booking, filter) &&
        (!normalizedQuery ||
          normalize(
            `${booking.title} ${booking.organizer} ${booking.trainer ?? ""} ${booking.createdBy ?? ""}`,
          ).includes(normalizedQuery)),
    );
  }, [bookings, filter, query]);
  const visible = filtered.slice(0, limit);
  const groups = useMemo(() => {
    const byDate = new Map<string, Booking[]>();

    for (const booking of visible) {
      byDate.set(booking.date, [...(byDate.get(booking.date) ?? []), booking]);
    }

    return [...byDate.entries()];
  }, [visible]);
  const message = Object.values(actions.messages).find(Boolean);

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 sm:flex-row sm:items-center">
        <label className="relative block sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" size={16} />
          <input
            aria-label="Hledat"
            className="field-input min-h-10"
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(pageSize);
            }}
            placeholder="Hledat název, trenéra, autora"
            // .field-input sets its own padding, which a utility class cannot override.
            style={{ paddingLeft: "2.25rem" }}
            value={query}
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {filters.map((option) => (
            <button
              aria-pressed={filter === option.value}
              className={chipClass(filter === option.value)}
              key={option.value}
              onClick={() => {
                setFilter(option.value);
                setLimit(pageSize);
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className={`rounded-lg border px-3 py-2 text-sm ${noticeTone.error}`}>{error}</p> : null}
      {message ? (
        <p className={`rounded-lg border px-3 py-2 text-sm ${noticeTone.info}`}>{message}</p>
      ) : null}

      <div className="rounded-xl border border-line bg-surface">
        {isLoading ? (
          <p className="px-4 py-6 text-sm text-ink-muted">Načítám…</p>
        ) : groups.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-muted">Žádná akce neodpovídá filtru.</p>
        ) : (
          groups.map(([date, dateBookings]) => (
            <div key={date}>
              <h2 className="sticky top-[var(--app-header-h)] z-10 border-b border-line bg-subtle px-4 py-2 text-xs font-semibold uppercase text-ink-muted">
                {formatDateCz(date)}
              </h2>
              <ul className="divide-y divide-line">
                {dateBookings.map((booking) => (
                  <BookingRow
                    actions={actions}
                    availableTrainers={availableTrainers}
                    booking={booking}
                    isExpanded={expandedId === booking.id}
                    key={booking.id}
                    onToggle={() => setExpandedId((current) => (current === booking.id ? "" : booking.id))}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      {filtered.length > limit ? (
        <button
          className="mx-auto h-10 rounded-md border border-line-strong px-4 text-sm font-semibold text-ink transition hover:bg-subtle"
          onClick={() => setLimit((current) => current + pageSize)}
          type="button"
        >
          Zobrazit další ({filtered.length - limit})
        </button>
      ) : null}
    </div>
  );
}

const kindLabel = {
  busy: { className: "bg-busy text-busy-ink", label: "Obsazeno" },
  cancelled: { className: "", label: "" },
  cleanup: { className: "", label: "" },
  event: { className: "bg-event text-event-ink", label: "Akce" },
  lesson: { className: "bg-free text-free-ink", label: "Lekce" },
  training: { className: "bg-training text-training-ink", label: "Trénink" },
};

function BookingRow({
  actions,
  availableTrainers,
  booking,
  isExpanded,
  onToggle,
}: {
  actions: BookingActions;
  availableTrainers: string[];
  booking: Booking;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const badge =
    kindLabel[booking.bookingKind === "individual-lesson" ? "lesson" : getBookingKind(booking)];

  return (
    <li>
      <button
        aria-expanded={isExpanded}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-subtle"
        onClick={onToggle}
        type="button"
      >
        <span className="w-24 shrink-0 text-sm tabular-nums text-ink-muted">
          {booking.start}–{booking.end}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-ink">{booking.title}</span>
          <span className="block truncate text-xs text-ink-muted">
            {[
              booking.trainer ? `Trenér: ${booking.trainer}` : null,
              booking.createdBy ? `přidal ${booking.createdBy}` : null,
              booking.updatedBy ? `upravil ${booking.updatedBy}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || booking.organizer}
          </span>
        </span>
        {booking.cleanupRequired ? (
          <span
            className={`hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold sm:inline ${
              booking.cleanedAt ? "bg-free text-free-ink" : "bg-cleanup text-cleanup-ink"
            }`}
          >
            {booking.cleanedAt ? "Uklizeno" : "Čeká na úklid"}
          </span>
        ) : null}
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>
          {badge.label}
        </span>
        {isExpanded ? (
          <ChevronDown className="shrink-0 rotate-180 text-ink-soft" size={16} />
        ) : (
          <Pencil className="shrink-0 text-ink-soft" size={15} />
        )}
      </button>
      {isExpanded ? (
        <BookingEditor actions={actions} availableTrainers={availableTrainers} booking={booking} />
      ) : null}
    </li>
  );
}

function BookingEditor({
  actions,
  availableTrainers,
  booking,
}: {
  actions: BookingActions;
  availableTrainers: string[];
  booking: Booking;
}) {
  const [title, setTitle] = useState(booking.title);
  const [time, setTime] = useState({ end: booking.end, start: booking.start });
  const { pendingId } = actions;
  const smallButton =
    "inline-flex h-10 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="grid grid-cols-1 gap-3 border-t border-line bg-subtle px-4 py-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
      <label className="field-label">
        Trenér
        <select
          className="field-input mt-1 min-h-10"
          disabled={pendingId.trainer === booking.id}
          onChange={(event) => actions.updateTrainer(booking.id, event.target.value)}
          value={booking.trainer ?? ""}
        >
          <option value="">Bez trenéra</option>
          {availableTrainers.map((trainer) => (
            <option key={trainer} value={trainer}>
              {trainer}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-end gap-2">
        <label className="field-label flex-1">
          Název
          <input
            className="field-input mt-1 min-h-10"
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
        </label>
        <button
          aria-label="Uložit název"
          className={`${smallButton} bg-brand text-on-brand hover:bg-brand-hover`}
          disabled={title.trim() === booking.title || pendingId.title === booking.id}
          onClick={() => actions.updateTitle(booking.id, title, booking.title)}
          type="button"
        >
          <Save size={15} />
        </button>
      </div>
      <div className="flex items-end gap-2">
        <label className="field-label">
          Od
          <input
            className="field-input mt-1 min-h-10"
            onChange={(event) => setTime({ ...time, start: event.target.value })}
            type="time"
            value={time.start}
          />
        </label>
        <label className="field-label">
          Do
          <input
            className="field-input mt-1 min-h-10"
            onChange={(event) => setTime({ ...time, end: event.target.value })}
            type="time"
            value={time.end}
          />
        </label>
        <button
          aria-label="Uložit čas"
          className={`${smallButton} bg-brand text-on-brand hover:bg-brand-hover`}
          disabled={
            (time.start === booking.start && time.end === booking.end) ||
            pendingId.time === booking.id
          }
          onClick={() =>
            actions.updateTime(booking.id, time, { end: booking.end, start: booking.start })
          }
          type="button"
        >
          <Save size={15} />
        </button>
      </div>
      <button
        className={`${smallButton} border border-busy-line bg-busy text-busy-ink hover:brightness-95`}
        disabled={pendingId.deleting === booking.id}
        onClick={() => actions.deleteBooking(booking.id, booking.title)}
        type="button"
      >
        <Trash2 size={15} />
        {isRecurringBookingId(booking.id) ? "Zrušit termín" : "Smazat"}
      </button>
    </div>
  );
}

function normalize(value: string) {
  return value
    .toLocaleLowerCase("cs-CZ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
