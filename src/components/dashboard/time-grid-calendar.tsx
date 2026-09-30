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

// The column height (.time-grid-column in globals.css) follows the window.
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
  const at = (minutes: number) => toPercent(minutes, range);
  const hours = Array.from(
    { length: (range.end - range.start) / 60 + 1 },
    (_, index) => range.start + index * 60,
  );
  const columns = `3rem repeat(${days.length}, minmax(0, 1fr))`;

  function getSlotAt(event: MouseEvent<HTMLDivElement>, day: CalendarDay) {
    const rect = event.currentTarget.getBoundingClientRect();
    const minutes =
      range.start +
      Math.floor(
        (((event.clientY - rect.top) / rect.height) * (range.end - range.start)) / snapMinutes,
      ) *
        snapMinutes;
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
        className="sticky top-[var(--app-header-h)] z-20 grid border-b border-line bg-surface"
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
              className={`flex flex-col items-center gap-0.5 rounded-t-lg px-1 py-1.5 transition ${
                isSelected ? "bg-brand-soft" : "hover:bg-subtle"
              }`}
              key={day.dateKey}
              onClick={() => onSelectDate(day.dateKey)}
              type="button"
            >
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="text-xs font-semibold uppercase text-ink-muted">
                  {weekdayFormatter.format(day.date)}
                </span>
                <span
                  className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-sm font-semibold ${
                    isToday ? "bg-brand text-on-brand" : "text-ink"
                  }`}
                >
                  {dayNumberFormatter.format(day.date)}
                </span>
              </span>
              <span className="text-[11px] text-ink-soft">{formatEventCount(count)}</span>
            </button>
          );
        })}
      </div>

      <div className="grid" style={{ gridTemplateColumns: columns }}>
        <div className="time-grid-column relative">
          {hours.map((minutes, index) => (
            <span
              className={`absolute right-2 text-[11px] text-ink-soft ${
                index === 0 ? "" : "-translate-y-1/2"
              }`}
              key={minutes}
              style={{ top: at(minutes) }}
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
              className={`time-grid-column relative border-l border-line ${
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
            >
              {hours.slice(1).map((minutes) => (
                <span
                  className="pointer-events-none absolute inset-x-0 border-t border-line/70"
                  key={minutes}
                  style={{ top: at(minutes) }}
                />
              ))}
              <ClosedAreas day={day} range={range} />

              {day.items.map((item) => (
                <CalendarBlock
                  item={item}
                  key={item.id}
                  onClick={() => onSelectItem(day.dateKey, item)}
                  range={range}
                />
              ))}

              {hoverMinutes !== null ? (
                <span
                  className="pointer-events-none absolute inset-x-1 flex items-center gap-1 rounded-md border border-dashed border-brand bg-brand-soft px-2 text-xs font-semibold text-brand"
                  style={{
                    height: toLength(snapMinutes, range),
                    top: at(hoverMinutes),
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
                  style={{ top: at(nowMinutes) }}
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

type Range = { end: number; start: number };

// Positions are percentages of the column, so the grid can take any height.
function toPercent(minutes: number, range: Range) {
  return `${((minutes - range.start) / (range.end - range.start)) * 100}%`;
}

function toLength(minutes: number, range: Range) {
  return `${(minutes / (range.end - range.start)) * 100}%`;
}

function ClosedAreas({ day, range }: { day: CalendarDay; range: Range }) {
  const areas: Array<{ end: number; kind: "closed" | "departure"; start: number }> =
    day.openStart === null || day.openEnd === null
      ? [{ end: range.end, kind: "closed", start: range.start }]
      : [
          { end: day.openStart, kind: "closed", start: range.start },
          { end: day.openEnd, kind: "departure", start: day.openEnd - departureMinutes },
          { end: range.end, kind: "closed", start: day.openEnd },
        ];

  // Labelled when the area is tall enough for a line of text.
  return areas
    .filter((area) => area.end > area.start)
    .map((area) => (
      <span
        className={`pointer-events-none absolute inset-x-0 overflow-hidden [container-type:size] ${
          area.kind === "closed"
            ? "pattern-closed"
            : "border-t-2 border-cleanup-line bg-cleanup"
        }`}
        key={`${area.kind}-${area.start}`}
        style={{
          height: toLength(area.end - area.start, range),
          top: toPercent(area.start, range),
        }}
        title={area.kind === "closed" ? "Zavřeno" : "Odchod ze sálu před zavíračkou"}
      >
        <span
          className={`hidden truncate px-1.5 pt-px text-[10px] font-semibold uppercase leading-[11px] tracking-wide [@container(min-height:11px)]:block ${
            area.kind === "closed" ? "text-ink-soft" : "text-cleanup-ink"
          }`}
        >
          {area.kind === "closed" ? "Zavřeno" : "Odchod ze sálu"}
        </span>
      </span>
    ));
}

function CalendarBlock({
  item,
  onClick,
  range,
}: {
  item: CalendarItem;
  onClick: () => void;
  range: Range;
}) {
  // The pixel height depends on the window, so the block is a size container
  // and the number of text lines follows its real height.
  const duration = item.end - item.start;
  const time = `${minutesToTime(item.start)}–${minutesToTime(item.end)}`;
  const label = item.kind === "cleanup" ? "Čeká na úklid" : item.title;

  return (
    <button
      className={`absolute z-[5] overflow-hidden rounded-md border px-1.5 py-px text-left text-xs leading-tight transition [container-type:size] hover:z-[6] hover:shadow-md ${itemKindClass[item.kind]}`}
      onClick={onClick}
      style={{
        height: toLength(duration, range),
        left: `calc(${(item.lane / item.lanes) * 100}% + 2px)`,
        minHeight: 18,
        top: toPercent(item.start, range),
        width: `calc(${100 / item.lanes}% - 4px)`,
      }}
      title={`${label} · ${time}${item.trainer ? ` · ${item.trainer}` : ""}${
        item.kind === "cancelled" ? " · zrušeno" : ""
      }${item.kind === "cleanup" ? " · klikněte po úklidu" : ""}`}
      type="button"
    >
      {/* The time is never shortened; only the title gives way. Low blocks
          get one line, taller ones title and time below each other. */}
      <span className="flex min-w-0 items-baseline gap-1 leading-4 [@container(min-height:24px)]:hidden">
        <span className="min-w-0 truncate font-semibold">{label}</span>
        <span className="shrink-0 whitespace-nowrap text-[11px] opacity-80">{time}</span>
      </span>
      <span className="hidden leading-3 [@container(min-height:24px)]:block">
        <span className="block truncate font-semibold">{label}</span>
        <span className="block whitespace-nowrap opacity-80">{time}</span>
        {item.trainer ? (
          <span className="hidden truncate opacity-80 [@container(min-height:36px)]:block">
            {item.trainer}
          </span>
        ) : null}
      </span>
    </button>
  );
}
