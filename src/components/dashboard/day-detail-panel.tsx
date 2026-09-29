import {
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Save,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import {
  getSegmentStyle,
  isRecurringBookingId,
  longDateFormatter,
  type DayAvailabilitySegment,
} from "@/components/booking-dashboard-utils";
import type { BookingActions } from "@/components/dashboard/use-booking-actions";
import type { Booking } from "@/lib/schedule";

type BookedSegment = Extract<DayAvailabilitySegment, { kind: "booked" }>;

// The "Vybraný den" card: the selected day split into free / booked / cleanup
// segments, with inline editing of bookings for users who manage the hall.
export function DayDetailPanel({
  actions,
  availableTrainers,
  bookings,
  canManageBookings,
  className,
  currentDateKey,
  currentTimeMinutes,
  occupancyNotice,
  onLoginClick,
  segments,
  selectedDate,
}: {
  actions: BookingActions;
  availableTrainers: string[];
  bookings: Booking[];
  canManageBookings: boolean;
  className: string;
  currentDateKey: string;
  currentTimeMinutes: number | null;
  occupancyNotice: { description: string; title: string } | null;
  // Shown as a "log in and add" button when set.
  onLoginClick?: () => void;
  segments: DayAvailabilitySegment[];
  selectedDate: string;
}) {
  const [expandedBookingId, setExpandedBookingId] = useState("");
  const { messages } = actions;

  return (
    <div className={`rounded-lg border border-[#ded6c9] bg-white p-5 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#66706f]">Vybraný den</p>
          <h2 className="mt-1 text-2xl font-semibold capitalize">
            {longDateFormatter.format(new Date(`${selectedDate}T12:00:00`))}
          </h2>
        </div>
        <Image
          alt=""
          className="h-auto w-12"
          height={62}
          src="/brand/Koskovi_logo_znak.svg"
          width={71}
        />
      </div>

      {occupancyNotice ? (
        <div className="mt-5 rounded-md border border-[#c7dce7] bg-[#eef7fb] p-3 text-sm text-[#17475f] shadow-[0_8px_18px_rgba(0,55,88,0.08)]">
          <p className="flex items-center gap-2 font-semibold">
            <Clock3 size={16} />
            {occupancyNotice.title}
          </p>
          <p className="mt-1 text-xs text-[#4f6a76]">
            {occupancyNotice.description}
          </p>
        </div>
      ) : null}

      <div className="mt-5 space-y-2">
        {segments.map((segment) => {
          const isEditable = canManageBookings && segment.kind === "booked";
          const isExpanded =
            segment.kind === "booked" && expandedBookingId === segment.bookingId;

          return (
            <div
              className={`grid grid-cols-[84px_minmax(0,1fr)] items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                segment.kind === "free"
                  ? "border-[#d8eadf] bg-[#f3fbf5] text-[#246043]"
                  : segment.kind === "closed"
                    ? "border-[#e7dfd4] bg-[#f3f0ea] text-[#66706f]"
                    : getSegmentStyle(segment)
              }`}
              key={`${segment.kind}-${segment.start}-${segment.end}-${segment.title}`}
            >
              <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap font-semibold text-xs sm:text-sm">
                <Clock3 size={14} />
                {segment.start}-{segment.end}
              </span>
              <div className="min-w-0">
                <span className="block truncate font-semibold">
                  {segment.title}
                </span>
                {segment.description ? (
                  <span className="mt-0.5 block truncate text-xs opacity-80">
                    {segment.description}
                  </span>
                ) : null}
                {isEditable ? (
                  <div className="mt-1.5">
                    {segment.trainer ? (
                      <p className="truncate text-xs opacity-80">
                        Trenér: {segment.trainer}
                      </p>
                    ) : null}
                    <button
                      className="mt-1.5 inline-flex min-h-7 items-center justify-center gap-1 rounded-md border border-current/25 px-2 py-1 text-xs font-semibold transition hover:bg-white/50"
                      onClick={() =>
                        setExpandedBookingId(isExpanded ? "" : segment.bookingId)
                      }
                      type="button"
                    >
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      {isExpanded ? "Skrýt úpravy" : "Upravit"}
                    </button>
                  </div>
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
              {isEditable && isExpanded ? (
                <SegmentEditor
                  actions={actions}
                  availableTrainers={availableTrainers}
                  onDeleted={() => setExpandedBookingId("")}
                  segment={segment}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {onLoginClick ? (
        <button
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#003758] px-4 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(0,55,88,0.16)] transition hover:bg-[#0b4d76]"
          onClick={onLoginClick}
          type="button"
        >
          <CalendarPlus size={17} />
          Přihlásit se a přidat akci
        </button>
      ) : null}

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
      className="mt-2 inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md bg-[#003758] px-3 py-1 text-xs font-semibold text-white transition hover:bg-[#0b4d76] disabled:cursor-not-allowed disabled:opacity-70"
      disabled={isCleaning || !canConfirm}
      onClick={() => (booking ? actions.markCleaned(booking.id) : undefined)}
      title={canConfirm ? undefined : "Úklid lze potvrdit až po skončení akce."}
      type="button"
    >
      <Check size={13} />
      {isCleaning
        ? "Potvrzuji..."
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
  const inputClass = "field-input mt-1 min-h-8 w-full min-w-0 py-1 text-xs";
  const saveButtonClass =
    "inline-flex min-h-8 w-full items-center justify-center gap-1.5 rounded-md border border-[#c9dce7] bg-[#eef6fa] px-2.5 py-1.5 text-xs font-semibold text-[#003758] transition hover:bg-[#dceef7] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="col-span-2 grid min-w-0 gap-2 border-t border-current/20 pt-2">
      <label className="block min-w-0 text-xs font-semibold">
        Trenér
        <select
          className={inputClass}
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
      <label className="block min-w-0 text-xs font-semibold">
        Název aktivity
        <input
          className={inputClass}
          onChange={(event) => setTitleDraft(event.target.value)}
          value={title}
        />
      </label>
      <div className="grid min-w-0 grid-cols-2 gap-2">
        <label className="block min-w-0 text-xs font-semibold">
          Od
          <input
            className={inputClass}
            onChange={(event) => setTimeDraft({ ...time, start: event.target.value })}
            type="time"
            value={time.start}
          />
        </label>
        <label className="block min-w-0 text-xs font-semibold">
          Do
          <input
            className={inputClass}
            onChange={(event) => setTimeDraft({ ...time, end: event.target.value })}
            type="time"
            value={time.end}
          />
        </label>
      </div>
      <button
        className={saveButtonClass}
        disabled={
          pendingId.time === bookingId ||
          (time.start === segment.start && time.end === segment.end)
        }
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
        {pendingId.time === bookingId ? "Ukládám..." : "Uložit čas"}
      </button>
      <button
        className={saveButtonClass}
        disabled={pendingId.title === bookingId || title.trim() === segment.title}
        onClick={async () => {
          if (await actions.updateTitle(bookingId, title, segment.title)) {
            setTitleDraft(null);
          }
        }}
        type="button"
      >
        <Save size={13} />
        {pendingId.title === bookingId ? "Ukládám..." : "Uložit změnu aktivity"}
      </button>
      <button
        className="inline-flex min-h-8 w-full items-center justify-center gap-1.5 rounded-md border border-[#d9a093] bg-[#fff0eb] px-2.5 py-1.5 text-center text-xs font-semibold text-[#8c2f20] transition hover:bg-[#ffe3da] disabled:cursor-not-allowed disabled:opacity-70"
        disabled={pendingId.deleting === bookingId}
        onClick={async () => {
          if (await actions.deleteBooking(bookingId, segment.title)) {
            onDeleted();
          }
        }}
        type="button"
      >
        <Trash2 className="shrink-0" size={13} />
        {pendingId.deleting === bookingId
          ? "Mazu..."
          : isRecurringBookingId(bookingId)
            ? "Zrušit tento termín"
            : "Smazat akci"}
      </button>
    </div>
  );
}

const messageToneClass = {
  error: "border-[#edd3cc] bg-[#fff0eb] text-[#8c2f20]",
  success: "border-[#cbe3d1] bg-[#f1faf2] text-[#245d3f]",
  warning: "border-[#dfc36b] bg-[#fff6d8] text-[#5e4300]",
};

function StatusMessage({
  children,
  tone,
}: {
  children: string;
  tone: keyof typeof messageToneClass;
}) {
  if (!children) {
    return null;
  }

  return (
    <p
      className={`mt-3 rounded-md border px-3 py-2 text-xs font-semibold ${messageToneClass[tone]}`}
    >
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
