import { Check } from "lucide-react";
import {
  cleanupCellStyle,
  getBookingCellStyle,
  getSelectedBookingPeriodClass,
  getSlotFill,
  statusLabels,
  type SlotState,
} from "@/components/booking-dashboard-utils";

export type SlotCellVariant = "day" | "week" | "month";

const variantBaseClass: Record<SlotCellVariant, string> = {
  day: "relative min-h-14 border-l border-[#ece3d5] px-2 py-2 text-left text-xs transition",
  month:
    "relative min-h-16 border-l border-[#ece3d5] px-1.5 py-3 text-left text-[11px] transition",
  week: "relative min-h-12 border-l border-[#ece3d5] px-1.5 py-1.5 text-left text-[11px] transition xl:px-2 xl:text-xs",
};

const selectedBookedShadow =
  "relative z-10 overflow-hidden ring-1 ring-[#b9d9e8] shadow-[0_9px_18px_rgba(0,55,88,0.18),inset_0_3px_0_rgba(255,255,255,0.60),inset_0_-3px_0_rgba(11,77,118,0.14)]";
const selectedCleanupClass =
  "selected-period-booked relative z-10 overflow-hidden ring-1 ring-[#e1b554] shadow-[0_9px_18px_rgba(106,75,0,0.18),inset_0_3px_0_rgba(255,255,255,0.60),inset_0_-3px_0_rgba(106,75,0,0.12)]";
const selectedClosedClass =
  "selected-period-closed relative z-10 bg-[#e3edf3] text-[#6c747b] ring-1 ring-[#b9d9e8] shadow-[0_9px_18px_rgba(0,55,88,0.18),inset_0_3px_0_rgba(255,255,255,0.75),inset_0_-3px_0_rgba(11,77,118,0.14)]";
const selectedDepartureClass =
  "relative z-10 bg-[#fff6d8] text-[#6a4b00] ring-1 ring-[#e1b554] shadow-[0_9px_18px_rgba(106,75,0,0.14),inset_0_3px_0_rgba(255,255,255,0.62)]";
const selectedFreeClass =
  "selected-period-cell relative z-10 bg-[#eef7fb] text-[#17475f] ring-1 ring-[#b9d9e8] shadow-[0_9px_18px_rgba(0,55,88,0.18),inset_0_3px_0_rgba(255,255,255,0.78),inset_0_-3px_0_rgba(11,77,118,0.14)] hover:bg-[#e5f2f8]";

// One time slot of the day, week or month grid. The selected day is
// highlighted; free slots can be clicked to prefill the booking form.
export function SlotCell({
  currentTimeOffset,
  isSelected,
  onSelect,
  slotMinutes,
  state,
  time,
  variant,
}: {
  currentTimeOffset: number | null;
  isSelected: boolean;
  onSelect: (isFree: boolean) => void;
  slotMinutes: number;
  state: SlotState;
  time: string;
  variant: SlotCellVariant;
}) {
  const { booking, cleanupBooking, isDeparture, isOpen } = state;
  const slotFill = getSlotFill(time, booking, cleanupBooking, slotMinutes);
  const isFree = isOpen && !isDeparture && !booking && !cleanupBooking;

  return (
    <button
      className={`${variantBaseClass[variant]} ${getStateClass(
        state,
        slotFill,
        isSelected,
      )}`}
      data-current-slot={currentTimeOffset !== null ? "true" : undefined}
      onClick={() => onSelect(isFree)}
      title={
        booking
          ? `${booking.title} (${booking.start}-${booking.end})`
          : cleanupBooking
            ? `Čeká na úklid po akci ${cleanupBooking.title}`
            : isDeparture
              ? "Odchod ze sálu před zavíračkou"
              : undefined
      }
      type="button"
    >
      {slotFill ? (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute bottom-0 top-0 z-0 ${slotFill.className}`}
          style={{
            left: `${slotFill.left}%`,
            width: `${slotFill.width}%`,
          }}
        />
      ) : null}
      {currentTimeOffset !== null ? (
        <CurrentTimeMarker
          offset={currentTimeOffset}
          vertical={variant === "month"}
        />
      ) : null}
      {variant === "month" ? (
        <MonthSlotContent state={state} />
      ) : (
        <SlotContent state={state} variant={variant} />
      )}
    </button>
  );
}

function getStateClass(
  { booking, cleanupBooking, isDeparture, isOpen }: SlotState,
  slotFill: ReturnType<typeof getSlotFill>,
  isSelected: boolean,
) {
  if (booking) {
    return `${getBookingCellStyle(booking, slotFill, isSelected)} ${
      isSelected
        ? `${getSelectedBookingPeriodClass(booking)} ${selectedBookedShadow}`
        : ""
    }`;
  }

  if (cleanupBooking) {
    return `${cleanupCellStyle} ${isSelected ? selectedCleanupClass : ""}`;
  }

  if (!isOpen) {
    return isSelected ? selectedClosedClass : "bg-[#f3f0ea] text-[#9a9288]";
  }

  if (isDeparture) {
    return isSelected ? selectedDepartureClass : "bg-[#fff6d8] text-[#6a4b00]";
  }

  return isSelected ? selectedFreeClass : "bg-white text-[#51615f] hover:bg-[#eef8f2]";
}

function CurrentTimeMarker({
  offset,
  vertical,
}: {
  offset: number;
  vertical: boolean;
}) {
  // Month rows run left to right in time, so the marker is a vertical line.
  return vertical ? (
    <span
      aria-hidden="true"
      className="current-time-marker pointer-events-none absolute bottom-0 top-0 flex flex-col items-center"
      style={{ left: `${offset}%` }}
    >
      <span className="time-marker-dot h-2 w-2 -translate-y-1 rounded-full bg-[#0b4d76] shadow-[0_0_0_3px_rgba(143,215,172,0.55)]" />
      <span className="time-marker-line w-[2px] flex-1 bg-[#0b4d76] shadow-[1px_0_4px_rgba(0,55,88,0.35)]" />
    </span>
  ) : (
    <span
      aria-hidden="true"
      className="current-time-marker pointer-events-none absolute left-0 right-0 flex items-center"
      style={{ top: `${offset}%` }}
    >
      <span className="time-marker-dot h-2 w-2 -translate-x-1 rounded-full bg-[#0b4d76] shadow-[0_0_0_3px_rgba(143,215,172,0.55)]" />
      <span className="time-marker-line h-[2px] flex-1 bg-[#0b4d76] shadow-[0_1px_4px_rgba(0,55,88,0.35)]" />
    </span>
  );
}

function SlotContent({
  state: { booking, cleanupBooking, isDeparture, isOpen },
  variant,
}: {
  state: SlotState;
  variant: "day" | "week";
}) {
  if (booking) {
    return (
      <TwoLineLabel
        first={statusLabels[booking.status]}
        second={booking.title}
      />
    );
  }

  if (cleanupBooking) {
    return (
      <TwoLineLabel
        first="Čeká na úklid"
        second={`Po akci ${cleanupBooking.title}`}
      />
    );
  }

  if (!isOpen) {
    return <span className="block font-medium">Zavřeno</span>;
  }

  if (isDeparture) {
    return variant === "day" ? (
      <span className="relative z-10 block max-w-full overflow-hidden">
        <span className="block truncate font-semibold">Odchod ze sálu</span>
        <span className="mt-1 block truncate leading-4">30 min před zavíračkou</span>
      </span>
    ) : (
      <TwoLineLabel first="Odchod" second="ze sálu" />
    );
  }

  return (
    <span className="relative z-10 inline-flex items-center gap-1.5 rounded-full bg-[#edf7ef] px-2 py-1 font-medium text-[#246043]">
      <Check size={13} />
      Volno
    </span>
  );
}

function TwoLineLabel({ first, second }: { first: string; second: string }) {
  return (
    <span className="relative z-10 block max-w-full overflow-hidden">
      <span className="block truncate font-semibold">{first}</span>
      <span className="mt-1 block max-w-full truncate leading-4">{second}</span>
    </span>
  );
}

// Month cells are narrow, so they show the time range instead of the status.
function MonthSlotContent({
  state: { booking, cleanupBooking, isDeparture, isOpen },
}: {
  state: SlotState;
}) {
  if (booking || cleanupBooking || (isOpen && isDeparture)) {
    const [first, second] = booking
      ? [booking.title, `${booking.start}-${booking.end}`]
      : cleanupBooking
        ? ["Čeká na úklid", "Po akci"]
        : ["Odchod", "ze sálu"];

    return (
      <span className="relative z-10 block max-w-full overflow-hidden">
        <span className="block truncate font-semibold">{first}</span>
        <span className="mt-0.5 block truncate">{second}</span>
      </span>
    );
  }

  if (!isOpen) {
    return <span className="block truncate font-medium">Zavřeno</span>;
  }

  return (
    <span className="relative z-10 block truncate font-medium text-[#246043]">
      Volno
    </span>
  );
}
