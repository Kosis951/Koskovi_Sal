import { Check, ChevronDown, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  isRecurringBookingId,
  longDateFormatter,
  type DayAvailabilitySegment,
} from "@/components/booking-dashboard-utils";
import type { BookingActions } from "@/components/dashboard/use-booking-actions";
import { buttonSecondary, noticeTone } from "@/components/ui/styles";
import type { RecurringCancellationNotice } from "@/lib/bookings-db";
import type { Booking } from "@/lib/schedule";

type BookedSegment = Extract<DayAvailabilitySegment, { kind: "booked" }>;

const segmentBarClass = {
  cleanup: "bg-cleanup-line",
  closed: "bg-line-strong",
  departure: "bg-cleanup-line",
  free: "bg-free-line",
};

function getBookedBarClass(segment: BookedSegment) {
  if (isRecurringBookingId(segment.bookingId)) {
    return "bg-training-line";
  }

  return segment.status === "maintenance" ? "bg-busy-line" : "bg-event-line";
}

// Agenda of the selected day: free and booked periods in order, with inline
// editing for hall managers.
export function DayDetailPanel({
  actions,
  availableTrainers,
  bookings,
  canManageBookings,
  cancellations,
  currentDateKey,
  currentTimeMinutes,
  expandedBookingId,
  onAddBooking,
  onExpandedBookingChange,
  segments,
  selectedDate,
}: {
  actions: BookingActions;
  availableTrainers: string[];
  bookings: Booking[];
  canManageBookings: boolean;
  cancellations: RecurringCancellationNotice[];
  currentDateKey: string;
  currentTimeMinutes: number | null;
  expandedBookingId: string;
  onAddBooking: () => void;
  onExpandedBookingChange: (bookingId: string) => void;
  segments: DayAvailabilitySegment[];
  selectedDate: string;
}) {
  const { messages } = actions;
  const dayCancellations = cancellations.filter(
    (cancellation) => cancellation.date === selectedDate,
  );

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-semibold uppercase text-ink-muted">Vybraný den</p>
      <h2 className="mt-0.5 text-xl font-semibold capitalize text-ink">
        {longDateFormatter.format(new Date(`${selectedDate}T12:00:00`))}
      </h2>

      <ol className="mt-4 grid gap-1.5">
        {segments.map((segment) => {
          const isBooked = segment.kind === "booked";
          const isExpanded = isBooked && expandedBookingId === segment.bookingId;

          return (
            <li
              className={`overflow-hidden rounded-lg border ${
                isExpanded ? "border-line-strong" : "border-transparent"
              }`}
              key={`${segment.kind}-${segment.start}-${segment.end}-${segment.title}`}
            >
              <div className="flex items-stretch gap-3 px-1 py-1.5">
                <span
                  className={`w-1 shrink-0 rounded-full ${
                    isBooked ? getBookedBarClass(segment) : segmentBarClass[segment.kind]
                  }`}
                />
                <span className="w-24 shrink-0 pt-0.5 text-sm tabular-nums text-ink-muted">
                  {segment.start}–{segment.end}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-semibold ${
                      segment.kind === "free"
                        ? "text-free-ink"
                        : segment.kind === "closed"
                          ? "text-ink-soft"
                          : "text-ink"
                    }`}
                  >
                    {segment.title}
                  </p>
                  {segment.description ? (
                    <p className="truncate text-xs text-ink-muted">{segment.description}</p>
                  ) : null}
                  {segment.kind === "cleanup" && segment.cleanupBookingId ? (
                    <CleanupButton
                      actions={actions}
                      booking={bookings.find(
                        (booking) => booking.id === segment.cleanupBookingId,
                      )}
                      currentDateKey={currentDateKey}
                      currentTimeMinutes={currentTimeMinutes}
                    />
                  ) : null}
                </div>
                {isBooked && canManageBookings ? (
                  <button
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? "Skrýt úpravy" : "Upravit"}
                    className="inline-flex h-8 shrink-0 items-center gap-1 self-center rounded-md px-2 text-xs font-semibold text-ink-muted transition hover:bg-subtle hover:text-ink"
                    onClick={() =>
                      onExpandedBookingChange(isExpanded ? "" : segment.bookingId)
                    }
                    type="button"
                  >
                    {isExpanded ? <ChevronDown className="rotate-180" size={14} /> : <Pencil size={13} />}
                    {isExpanded ? "Skrýt" : "Upravit"}
                  </button>
                ) : null}
              </div>
              {isBooked && isExpanded && canManageBookings ? (
                <SegmentEditor
                  actions={actions}
                  availableTrainers={availableTrainers}
                  onDeleted={() => onExpandedBookingChange("")}
                  segment={segment}
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      {dayCancellations.length > 0 ? (
        <div className="mt-3 grid gap-1.5 border-t border-line pt-3">
          {dayCancellations.map((cancellation) => (
            <div className="flex items-center gap-3 px-1 text-sm" key={cancellation.id}>
              <span className="w-1 self-stretch rounded-full border border-dashed border-line-strong" />
              <span className="w-24 shrink-0 tabular-nums text-ink-soft">
                {cancellation.start}–{cancellation.end}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink-soft line-through">
                {cancellation.title}
              </span>
              {canManageBookings ? (
                <button
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-brand transition hover:bg-subtle disabled:opacity-60"
                  disabled={actions.pendingId.reinstating === cancellation.id}
                  onClick={() => actions.reinstate(cancellation.id)}
                  type="button"
                >
                  {actions.pendingId.reinstating === cancellation.id ? "Obnovuji…" : "Obnovit"}
                </button>
              ) : (
                <span className="shrink-0 text-xs text-ink-soft">zrušeno</span>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <button className={`${buttonSecondary} mt-4 w-full`} onClick={onAddBooking} type="button">
        <Plus size={16} />
        Přidat akci na tento den
      </button>

      <StatusMessage tone="warning">{messages.cleanup}</StatusMessage>
      <StatusMessage tone="error">{messages.delete}</StatusMessage>
      <StatusMessage tone="success">{messages.trainer}</StatusMessage>
      <StatusMessage tone="warning">{messages.time}</StatusMessage>
      <StatusMessage tone="warning">{messages.title}</StatusMessage>
    </div>
  );
}

function CleanupButton({
  actions,
  booking,
  currentDateKey,
  currentTimeMinutes,
}: {
  actions: BookingActions;
  booking?: Booking;
  currentDateKey: string;
  currentTimeMinutes: number | null;
}) {
  const canConfirm =
    booking && hasBookingEnded(booking, currentDateKey, currentTimeMinutes);
  const isCleaning = Boolean(booking) && actions.pendingId.cleaning === booking?.id;

  return (
    <button
      className="mt-1.5 inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-brand px-3 text-xs font-semibold text-on-brand transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
      disabled={isCleaning || !canConfirm}
      onClick={() => (booking ? actions.markCleaned(booking.id) : undefined)}
      title={canConfirm ? undefined : "Úklid lze potvrdit až po skončení akce."}
      type="button"
    >
      <Check size={13} />
      {isCleaning
        ? "Potvrzuji…"
        : canConfirm
          ? "Uklidil jsem sál"
          : "Až po skončení akce"}
    </button>
  );
}

function SegmentEditor({
  actions,
  availableTrainers,
  onDeleted,
  segment,
}: {
  actions: BookingActions;
  availableTrainers: string[];
  onDeleted: () => void;
  segment: BookedSegment;
}) {
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [timeDraft, setTimeDraft] = useState<{ end: string; start: string } | null>(
    null,
  );
  const { bookingId } = segment;
  const { pendingId } = actions;
  const title = titleDraft ?? segment.title;
  const time = timeDraft ?? { end: segment.end, start: segment.start };
  const isTimeChanged = time.start !== segment.start || time.end !== segment.end;
  const isTitleChanged = title.trim() !== segment.title;
  const smallButton =
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="grid gap-3 border-t border-line bg-subtle px-3 py-3">
      <label className="field-label">
        Trenér
        <select
          className="field-input mt-1 min-h-9 py-1.5 text-sm"
          disabled={pendingId.trainer === bookingId}
          onChange={(event) => actions.updateTrainer(bookingId, event.target.value)}
          value={segment.trainer ?? ""}
        >
          <option value="">Bez trenéra</option>
          {availableTrainers.map((trainer) => (
            <option key={trainer} value={trainer}>
              {trainer}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-2">
        <label className="field-label">
          Název
          <input
            className="field-input mt-1 min-h-9 py-1.5 text-sm"
            onChange={(event) => setTitleDraft(event.target.value)}
            value={title}
          />
        </label>
        {isTitleChanged ? (
          <button
            className={`${smallButton} bg-brand text-on-brand hover:bg-brand-hover`}
            disabled={pendingId.title === bookingId}
            onClick={async () => {
              if (await actions.updateTitle(bookingId, title, segment.title)) {
                setTitleDraft(null);
              }
            }}
            type="button"
          >
            <Save size={13} />
            {pendingId.title === bookingId ? "Ukládám…" : "Uložit název"}
          </button>
        ) : null}
      </div>
      <div className="grid gap-2">
        <div className="grid grid-cols-2 gap-2">
          <label className="field-label">
            Od
            <input
              className="field-input mt-1 min-h-9 py-1.5 text-sm"
              onChange={(event) => setTimeDraft({ ...time, start: event.target.value })}
              type="time"
              value={time.start}
            />
          </label>
          <label className="field-label">
            Do
            <input
              className="field-input mt-1 min-h-9 py-1.5 text-sm"
              onChange={(event) => setTimeDraft({ ...time, end: event.target.value })}
              type="time"
              value={time.end}
            />
          </label>
        </div>
        {isTimeChanged ? (
          <button
            className={`${smallButton} bg-brand text-on-brand hover:bg-brand-hover`}
            disabled={pendingId.time === bookingId}
            onClick={async () => {
              if (
                await actions.updateTime(bookingId, time, {
                  end: segment.end,
                  start: segment.start,
                })
              ) {
                setTimeDraft(null);
              }
            }}
            type="button"
          >
            <Save size={13} />
            {pendingId.time === bookingId ? "Ukládám…" : "Uložit čas"}
          </button>
        ) : null}
      </div>
      <button
        className={`${smallButton} border border-busy-line bg-busy text-busy-ink hover:brightness-95`}
        disabled={pendingId.deleting === bookingId}
        onClick={async () => {
          if (await actions.deleteBooking(bookingId, segment.title)) {
            onDeleted();
          }
        }}
        type="button"
      >
        <Trash2 size={13} />
        {pendingId.deleting === bookingId
          ? "Mažu…"
          : isRecurringBookingId(bookingId)
            ? "Zrušit tento termín"
            : "Smazat akci"}
      </button>
    </div>
  );
}

function StatusMessage({
  children,
  tone,
}: {
  children: string;
  tone: keyof typeof noticeTone;
}) {
  if (!children) {
    return null;
  }

  return (
    <p className={`mt-3 rounded-lg border px-3 py-2 text-xs font-semibold ${noticeTone[tone]}`}>
      {children}
    </p>
  );
}

function hasBookingEnded(
  booking: Booking,
  currentDateKey: string,
  currentTimeMinutes: number | null,
) {
  if (!currentDateKey || currentTimeMinutes === null) {
    return false;
  }

  if (booking.date !== currentDateKey) {
    return booking.date < currentDateKey;
  }

  const [hours, minutes] = booking.end.split(":").map(Number);

  return hours * 60 + minutes <= currentTimeMinutes;
}
