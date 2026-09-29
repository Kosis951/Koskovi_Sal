"use client";

import { Plus } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { formatEventCount } from "@/components/booking-dashboard-utils";
import {
  departureMinutes,
  getVisibleRange,
  minutesToTime,
  type CalendarDay,
  type CalendarItem,
} from "@/components/dashboard/calendar-events";

const pixelsPerMinute = 1;
const snapMinutes = 30;
const weekdayFormatter = new Intl.DateTimeFormat("cs-CZ", { weekday: "short" });
const dayNumberFormatter = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "numeric",
});

export const itemKindClass: Record<CalendarItem["kind"], string> = {
  busy: "border-busy-line bg-busy text-busy-ink",
  cancelled: "border-dashed border-line-strong bg-transparent text-ink-soft line-through",
  cleanup: "pattern-cleanup border-cleanup-line text-cleanup-ink",
  event: "border-event-line bg-event text-event-ink",
  training: "border-training-line bg-training text-training-ink",
};

// Day or week view: each booking is one continuous block, free time is empty.
export function TimeGridCalendar({
  canAdd,
  days,
  nowMinutes,
  onPickTime,
  onSelectDate,
  onSelectItem,
  selectedDate,
  todayKey,
}: {
  canAdd: boolean;
  days: CalendarDay[];
  nowMinutes: number | null;
  onPickTime: (dateKey: string, minutes: number) => void;
  onSelectDate: (dateKey: string) => void;
  onSelectItem: (dateKey: string, item: CalendarItem) => void;
  selectedDate: string;
  todayKey: string;
}) {
  const [hover, setHover] = useState<{ dateKey: string; minutes: number } | null>(
    null,
  );
  const range = getVisibleRange(days);
  const height = (range.end - range.start) * pixelsPerMinute;
  const hours = Array.from(
    { length: (range.end - range.start) / 60 + 1 },
    (_, index) => range.start + index * 60,
  );
  const columns = `3rem repeat(${days.length}, minmax(0, 1fr))`;

  function getSlotAt(event: MouseEvent<HTMLDivElement>, day: CalendarDay) {
    const rect = event.currentTarget.getBoundingClientRect();
    const minutes =
      range.start +
      Math.floor((event.clientY - rect.top) / pixelsPerMinute / snapMinutes) * snapMinutes;
    const isOpen =
      day.openStart !== null &&
      day.openEnd !== null &&
      minutes >= day.openStart &&
      minutes < day.openEnd - departureMinutes;
    const isTaken = day.items.some(
      (item) =>
        item.kind !== "cancelled" && item.start < minutes + snapMinutes && item.end > minutes,
    );

    return isOpen && !isTaken ? minutes : null;
  }

  return (
    <div className="select-none">
      <div
        className="sticky top-14 z-20 grid border-b border-line bg-surface"
        style={{ gridTemplateColumns: columns }}
      >
        <span />
        {days.map((day) => {
          const isSelected = days.length > 1 && day.dateKey === selectedDate;
          const isToday = day.dateKey === todayKey;
          const count = day.items.filter(
            (item) => item.kind !== "cancelled" && item.kind !== "cleanup",
          ).length;

          return (
            <button
              className={`flex flex-col items-center gap-0.5 rounded-t-lg px-1 py-2 transition ${
                isSelected ? "bg-brand-soft" : "hover:bg-subtle"
              }`}
              key={day.dateKey}
              onClick={() => onSelectDate(day.dateKey)}
              type="button"
            >
              <span className="text-xs font-semibold uppercase text-ink-muted">
                {weekdayFormatter.format(day.date)}
              </span>
              <span
                className={`flex h-8 min-w-8 items-center justify-center rounded-full px-1.5 text-sm font-semibold ${
                  isToday ? "bg-brand text-on-brand" : "text-ink"
                }`}
              >
                {dayNumberFormatter.format(day.date)}
              </span>
              <span className="text-[11px] text-ink-soft">{formatEventCount(count)}</span>
            </button>
          );
        })}
      </div>

      <div className="grid" style={{ gridTemplateColumns: columns }}>
        <div className="relative" style={{ height }}>
          {hours.map((minutes, index) => (
            <span
              className={`absolute right-2 text-[11px] text-ink-soft ${
                index === 0 ? "" : "-translate-y-1/2"
              }`}
              key={minutes}
              style={{ top: (minutes - range.start) * pixelsPerMinute }}
            >
              {minutes < 24 * 60 ? minutesToTime(minutes) : ""}
            </span>
          ))}
        </div>

        {days.map((day) => {
          // Only a week needs the selected day marked; a neutral tint keeps
          // free time from looking like the blue training blocks.
          const isHighlighted = days.length > 1 && day.dateKey === selectedDate;
          const hoverMinutes = hover?.dateKey === day.dateKey ? hover.minutes : null;

          return (
            <div
              className={`relative border-l border-line ${
                isHighlighted ? "bg-subtle/70" : ""
              } ${canAdd ? "cursor-pointer" : ""}`}
              key={day.dateKey}
              onClick={(event) => {
                if (event.target !== event.currentTarget) {
                  return;
                }

                const minutes = getSlotAt(event, day);

                if (canAdd && minutes !== null) {
                  onPickTime(day.dateKey, minutes);
                } else {
                  onSelectDate(day.dateKey);
                }
              }}
              onMouseLeave={() => setHover(null)}
              onMouseMove={(event) => {
                if (!canAdd) {
                  return;
                }

                const minutes =
                  event.target === event.currentTarget ? getSlotAt(event, day) : null;

                setHover((current) =>
                  minutes === null
                    ? current && current.dateKey === day.dateKey
                      ? null
                      : current
                    : current?.dateKey === day.dateKey && current.minutes === minutes
                      ? current
                      : { dateKey: day.dateKey, minutes },
                );
              }}
              style={{ height }}
            >
              {hours.slice(1).map((minutes) => (
                <span
                  className="pointer-events-none absolute inset-x-0 border-t border-line/70"
                  key={minutes}
                  style={{ top: (minutes - range.start) * pixelsPerMinute }}
                />
              ))}
              <ClosedAreas day={day} rangeEnd={range.end} rangeStart={range.start} />

              {day.items.map((item) => (
                <CalendarBlock
                  item={item}
                  key={item.id}
                  onClick={() => onSelectItem(day.dateKey, item)}
                  rangeStart={range.start}
                />
              ))}

              {hoverMinutes !== null ? (
                <span
                  className="pointer-events-none absolute inset-x-1 flex items-center gap-1 rounded-md border border-dashed border-brand bg-brand-soft px-2 text-xs font-semibold text-brand"
                  style={{
                    height: snapMinutes * pixelsPerMinute,
                    top: (hoverMinutes - range.start) * pixelsPerMinute,
                  }}
                >
                  <Plus size={13} />
                  {minutesToTime(hoverMinutes)}
                </span>
              ) : null}

              {day.dateKey === todayKey &&
              nowMinutes !== null &&
              nowMinutes >= range.start &&
              nowMinutes <= range.end ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                  data-current-slot="true"
                  style={{ top: (nowMinutes - range.start) * pixelsPerMinute }}
                >
                  <span className="-ml-1 h-2.5 w-2.5 rounded-full bg-now" />
                  <span className="h-0.5 flex-1 bg-now" />
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ClosedAreas({
  day,
  rangeEnd,
  rangeStart,
}: {
  day: CalendarDay;
  rangeEnd: number;
  rangeStart: number;
}) {
  const areas: Array<{ end: number; kind: "closed" | "departure"; start: number }> =
    day.openStart === null || day.openEnd === null
      ? [{ end: rangeEnd, kind: "closed", start: rangeStart }]
      : [
          { end: day.openStart, kind: "closed", start: rangeStart },
          { end: day.openEnd, kind: "departure", start: day.openEnd - departureMinutes },
          { end: rangeEnd, kind: "closed", start: day.openEnd },
        ];

  return areas
    .filter((area) => area.end > area.start)
    .map((area) => (
      <span
        className={`pointer-events-none absolute inset-x-0 ${
          area.kind === "closed"
            ? "pattern-closed"
            : "border-y border-dashed border-cleanup-line/60 bg-cleanup/40"
        }`}
        key={`${area.kind}-${area.start}`}
        style={{
          height: (area.end - area.start) * pixelsPerMinute,
          top: (area.start - rangeStart) * pixelsPerMinute,
        }}
        title={area.kind === "closed" ? "Zavřeno" : "Odchod ze sálu před zavíračkou"}
      />
    ));
}

function CalendarBlock({
  item,
  onClick,
  rangeStart,
}: {
  item: CalendarItem;
  onClick: () => void;
  rangeStart: number;
}) {
  const height = Math.max((item.end - item.start) * pixelsPerMinute, 18);
  const time = `${minutesToTime(item.start)}–${minutesToTime(item.end)}`;
  const label = item.kind === "cleanup" ? "Čeká na úklid" : item.title;

  return (
    <button
      className={`absolute z-[5] overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-xs leading-tight transition hover:z-[6] hover:shadow-md ${itemKindClass[item.kind]}`}
      onClick={onClick}
      style={{
        height,
        left: `calc(${(item.lane / item.lanes) * 100}% + 2px)`,
        top: (item.start - rangeStart) * pixelsPerMinute,
        width: `calc(${100 / item.lanes}% - 4px)`,
      }}
      title={`${label} · ${time}${item.trainer ? ` · ${item.trainer}` : ""}${
        item.kind === "cancelled" ? " · zrušeno" : ""
      }`}
      type="button"
    >
      {height < 56 ? (
        // Short blocks fit a single line only.
        <span className="block truncate leading-4">
          <span className="font-semibold">{label}</span>{" "}
          <span className="opacity-80">{minutesToTime(item.start)}</span>
        </span>
      ) : (
        <>
          <span className="block truncate font-semibold leading-4">{label}</span>
          <span className="block truncate leading-4 opacity-80">{time}</span>
          {height >= 76 && item.trainer ? (
            <span className="block truncate leading-4 opacity-80">{item.trainer}</span>
          ) : null}
        </>
      )}
    </button>
  );
}
