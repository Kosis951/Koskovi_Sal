import type { RefObject } from "react";
import {
  dayFormatter,
  formatEventCount,
  getCurrentTimeOffset,
  type SlotState,
} from "@/components/booking-dashboard-utils";
import { SlotCell } from "@/components/dashboard/slot-cell";
import { formatDateKey } from "@/lib/schedule";

type CalendarGridProps = {
  bookingDayCounts: Map<string, number>;
  currentDateKey: string;
  currentTimeMinutes: number | null;
  getSlotState: (dateKey: string, time: string) => SlotState;
  onSelectDate: (dateKey: string) => void;
  onSelectSlot: (dateKey: string, time: string, isFree: boolean) => void;
  scrollerRef: RefObject<HTMLDivElement | null>;
  selectedDate: string;
  slotMinutes: number;
  timeSlots: string[];
};

const scrollerClass =
  "max-h-[min(760px,calc(100svh-112px))] max-w-full overscroll-contain";
const selectedHeadClass =
  "selected-period-head relative z-20 border-[#0b4d76] bg-[#0b4d76] text-white ring-1 ring-white/50 shadow-[0_14px_26px_rgba(0,55,88,0.30),inset_0_-5px_0_#8fd7ac]";

// Returns where the "now" line sits inside the slot, or null when it is not
// in this slot.
function createMarkerOffset({
  currentDateKey,
  currentTimeMinutes,
  slotMinutes,
}: Pick<CalendarGridProps, "currentDateKey" | "currentTimeMinutes" | "slotMinutes">) {
  return (day: Date, dateKey: string, time: string) =>
    dateKey === currentDateKey && currentTimeMinutes !== null
      ? getCurrentTimeOffset(day, time, currentTimeMinutes, slotMinutes)
      : null;
}

export function DayCalendar({
  bookingDayCounts,
  currentDateKey,
  currentTimeMinutes,
  getSlotState,
  onSelectDate,
  onSelectSlot,
  scrollerRef,
  selectedDate,
  slotMinutes,
  timeSlots,
}: CalendarGridProps) {
  const day = new Date(`${selectedDate}T12:00:00`);
  const getMarkerOffset = createMarkerOffset({
    currentDateKey,
    currentTimeMinutes,
    slotMinutes,
  });

  return (
    <div className="overflow-hidden rounded-lg border border-[#ded6c9] bg-white">
      <div
        className={`${scrollerClass} overflow-auto`}
        data-calendar-view="today"
        ref={scrollerRef}
      >
        <div className="min-w-[420px]">
          <div className="sticky top-0 z-20 grid grid-cols-[88px_minmax(220px,1fr)] border-b border-[#ded6c9] bg-[#f6f1e8] shadow-sm">
            <div className="sticky left-0 z-30 bg-[#f6f1e8] px-3 py-3 text-xs font-semibold uppercase text-[#66706f] shadow-[4px_0_10px_rgba(19,41,53,0.08)]">
              Cas
            </div>
            <button
              className={`${selectedHeadClass} border-l px-3 py-3 text-left`}
              onClick={() => onSelectDate(selectedDate)}
              type="button"
            >
              <span className="block text-sm font-semibold capitalize">
                {dayFormatter.format(day)}
              </span>
              <span className="mt-1 block text-xs text-[#d7e6ed]">
                {formatEventCount(bookingDayCounts.get(selectedDate) ?? 0)}
              </span>
            </button>
          </div>

          {timeSlots.map((time) => (
            <div
              className="grid grid-cols-[88px_minmax(220px,1fr)] border-b border-[#ece3d5] last:border-b-0"
              key={time}
            >
              <div className="sticky left-0 z-10 bg-[#fcfaf6] px-3 py-3 text-sm font-medium text-[#66706f] shadow-[4px_0_10px_rgba(19,41,53,0.06)]">
                {time}
              </div>
              <SlotCell
                currentTimeOffset={getMarkerOffset(day, selectedDate, time)}
                isSelected
                onSelect={(isFree) => onSelectSlot(selectedDate, time, isFree)}
                slotMinutes={slotMinutes}
                state={getSlotState(selectedDate, time)}
                time={time}
                variant="day"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function WeekCalendar({
  bookingDayCounts,
  currentDateKey,
  currentTimeMinutes,
  days,
  getSlotState,
  onSelectDate,
  onSelectSlot,
  scrollerRef,
  selectedDate,
  slotMinutes,
  timeSlots,
}: CalendarGridProps & { days: Date[] }) {
  const getMarkerOffset = createMarkerOffset({
    currentDateKey,
    currentTimeMinutes,
    slotMinutes,
  });
  const gridClass =
    "grid grid-cols-[56px_repeat(7,minmax(0,1fr))] xl:grid-cols-[64px_repeat(7,minmax(0,1fr))]";

  return (
    <div className="overflow-hidden rounded-lg border border-[#ded6c9] bg-white">
      <div
        className={`${scrollerClass} overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]`}
        data-calendar-view="week"
        ref={scrollerRef}
      >
        <div className="min-w-full">
          <div className={`${gridClass} sticky top-0 z-20 border-b border-[#ded6c9] bg-[#f6f1e8] shadow-sm`}>
            <div className="sticky left-0 z-30 bg-[#f6f1e8] px-2 py-2.5 text-xs font-semibold uppercase text-[#66706f] shadow-[4px_0_10px_rgba(19,41,53,0.08)]">
              Cas
            </div>
            {days.map((day) => {
              const dateKey = formatDateKey(day);
              const isSelected = dateKey === selectedDate;

              return (
                <button
                  className={`min-w-0 border-l px-1.5 py-2.5 text-left transition xl:px-2 ${
                    isSelected
                      ? selectedHeadClass
                      : "border-[#ded6c9] hover:bg-[#fbf8f1]"
                  }`}
                  key={dateKey}
                  onClick={() => onSelectDate(dateKey)}
                  type="button"
                >
                  <span className="block truncate text-xs font-semibold capitalize xl:text-sm">
                    {dayFormatter.format(day)}
                  </span>
                  <span
                    className={`mt-1 block truncate text-[11px] xl:text-xs ${
                      isSelected ? "text-[#d7e6ed]" : "text-[#66706f]"
                    }`}
                  >
                    {formatEventCount(bookingDayCounts.get(dateKey) ?? 0)}
                  </span>
                </button>
              );
            })}
          </div>

          {timeSlots.map((time) => (
            <div
              className={`${gridClass} border-b border-[#ece3d5] last:border-b-0`}
              key={time}
            >
              <div className="sticky left-0 z-10 bg-[#fcfaf6] px-1.5 py-2 text-[11px] font-medium text-[#66706f] shadow-[4px_0_10px_rgba(19,41,53,0.06)] xl:px-2 xl:text-xs">
                {time}
              </div>
              {days.map((day) => {
                const dateKey = formatDateKey(day);

                return (
                  <SlotCell
                    currentTimeOffset={getMarkerOffset(day, dateKey, time)}
                    isSelected={dateKey === selectedDate}
                    key={`${dateKey}-${time}`}
                    onSelect={(isFree) => onSelectSlot(dateKey, time, isFree)}
                    slotMinutes={slotMinutes}
                    state={getSlotState(dateKey, time)}
                    time={time}
                    variant="week"
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MonthCalendar({
  bookingDayCounts,
  currentDateKey,
  currentTimeMinutes,
  getSlotState,
  monthDays,
  onSelectDate,
  onSelectSlot,
  scrollerRef,
  selectedDate,
  slotMinutes,
  timeSlots,
}: CalendarGridProps & { monthDays: Date[] }) {
  const getMarkerOffset = createMarkerOffset({
    currentDateKey,
    currentTimeMinutes,
    slotMinutes,
  });
  const gridTemplateColumns = `128px repeat(${timeSlots.length}, minmax(86px, 1fr))`;

  return (
    <div className="overflow-hidden rounded-lg border border-[#ded6c9] bg-white">
      <div
        className={`${scrollerClass} overflow-auto`}
        data-calendar-view="month"
        ref={scrollerRef}
      >
        <div className="min-w-[1720px]">
          <div
            className="sticky top-0 z-[80] grid border-b border-[#ded6c9] bg-[#f6f1e8] shadow-sm"
            style={{ gridTemplateColumns }}
          >
            <div className="sticky left-0 z-[90] bg-[#f6f1e8] px-3 py-3 text-xs font-semibold uppercase text-[#66706f] shadow-[4px_0_10px_rgba(19,41,53,0.08)]">
              Den
            </div>
            {timeSlots.map((time) => (
              <div
                className="bg-[#f6f1e8] px-2 py-3 text-center text-xs font-semibold text-[#66706f] shadow-[inset_1px_0_0_#ded6c9]"
                key={time}
              >
                {time}
              </div>
            ))}
          </div>

          {monthDays.map((day) => {
            const dateKey = formatDateKey(day);
            const isSelected = dateKey === selectedDate;

            return (
              <div
                className="grid min-h-16 border-b border-[#ece3d5] last:border-b-0"
                key={dateKey}
                style={{ gridTemplateColumns }}
              >
                <button
                  className={`sticky left-0 z-40 min-h-16 border-r border-[#ece3d5] px-3 py-2 text-left transition ${
                    isSelected
                      ? "selected-period-head z-50 border-r-[#0b4d76] bg-[#0b4d76] text-white ring-1 ring-white/50 shadow-[0_14px_26px_rgba(0,55,88,0.32),inset_-5px_0_0_#8fd7ac]"
                      : "bg-[#fcfaf6] text-[#132935] shadow-[4px_0_10px_rgba(19,41,53,0.06)] hover:bg-[#fbf8f1]"
                  }`}
                  onClick={() => onSelectDate(dateKey)}
                  type="button"
                >
                  <span className="block text-sm font-semibold capitalize">
                    {dayFormatter.format(day)}
                  </span>
                  <span
                    className={`mt-1 block text-xs ${
                      isSelected ? "text-[#d7e6ed]" : "text-[#66706f]"
                    }`}
                  >
                    {formatEventCount(bookingDayCounts.get(dateKey) ?? 0)}
                  </span>
                </button>

                {timeSlots.map((time) => (
                  <SlotCell
                    currentTimeOffset={getMarkerOffset(day, dateKey, time)}
                    isSelected={isSelected}
                    key={`${dateKey}-${time}`}
                    onSelect={(isFree) => onSelectSlot(dateKey, time, isFree)}
                    slotMinutes={slotMinutes}
                    state={getSlotState(dateKey, time)}
                    time={time}
                    variant="month"
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
