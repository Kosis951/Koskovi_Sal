"use client";

import {
  minutesToTime,
  type CalendarDay,
  type CalendarItem,
} from "@/components/dashboard/calendar-events";

const weekdayLabels = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const maxChips = 4;

export const itemDotClass: Record<CalendarItem["kind"], string> = {
  busy: "bg-busy-line",
  cancelled: "border border-line-strong bg-transparent",
  cleanup: "bg-cleanup-line",
  event: "bg-event-line",
  training: "bg-training-line",
};

const chipClass: Record<CalendarItem["kind"], string> = {
  busy: "bg-busy text-busy-ink",
  cancelled: "text-ink-soft line-through",
  cleanup: "bg-cleanup text-cleanup-ink",
  event: "bg-event text-event-ink",
  training: "bg-training text-training-ink",
};

// Classic month grid. `days` must start on a Monday and cover whole weeks.
export function MonthCalendar({
  days,
  monthKey,
  onSelectDate,
  selectedDate,
  todayKey,
}: {
  days: CalendarDay[];
  monthKey: string;
  onSelectDate: (dateKey: string) => void;
  selectedDate: string;
  todayKey: string;
}) {
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-line pb-1.5 text-center text-xs font-semibold uppercase text-ink-muted">
        {weekdayLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const isOtherMonth = !day.dateKey.startsWith(monthKey);
          const isSelected = day.dateKey === selectedDate;
          const isToday = day.dateKey === todayKey;
          const items = day.items
            .filter((item) => item.kind !== "cleanup")
            .sort((left, right) => left.start - right.start);

          return (
            <button
              className={`relative flex min-h-16 flex-col items-stretch gap-1 border-b border-r border-line p-1 text-left transition sm:min-h-28 sm:p-1.5 xl:min-h-32 min-[1900px]:min-h-36 [&:nth-child(7n+1)]:border-l ${
                isSelected
                  ? "bg-brand-soft ring-2 ring-inset ring-brand"
                  : "hover:bg-subtle"
              } ${isOtherMonth ? "opacity-45" : ""} ${
                day.openStart === null ? "pattern-closed" : ""
              }`}
              key={day.dateKey}
              onClick={() => onSelectDate(day.dateKey)}
              type="button"
            >
              <span
                className={`flex h-6 w-6 items-center justify-center self-center rounded-full text-xs font-semibold sm:self-start ${
                  isToday ? "bg-brand text-on-brand" : "text-ink"
                }`}
              >
                {day.date.getDate()}
              </span>
              <span className="flex flex-wrap justify-center gap-0.5 sm:hidden">
                {items.slice(0, 4).map((item) => (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${itemDotClass[item.kind]}`}
                    key={item.id}
                  />
                ))}
              </span>
              <span className="hidden flex-col gap-0.5 sm:flex">
                {items.slice(0, maxChips).map((item) => (
                  <span
                    className={`truncate rounded px-1 py-0.5 text-[11px] leading-tight xl:px-1.5 xl:text-xs ${chipClass[item.kind]}`}
                    key={item.id}
                    title={`${item.title} ${minutesToTime(item.start)}–${minutesToTime(item.end)}`}
                  >
                    <span className="font-semibold">{minutesToTime(item.start)}</span>{" "}
                    {item.title}
                  </span>
                ))}
                {items.length > maxChips ? (
                  <span className="px-1 text-[11px] text-ink-muted">
                    +{items.length - maxChips} další
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Week strip for phones: pick a day, see its agenda below.
export function DayStrip({
  days,
  onSelectDate,
  selectedDate,
  todayKey,
}: {
  days: CalendarDay[];
  onSelectDate: (dateKey: string) => void;
  selectedDate: string;
  todayKey: string;
}) {
  const weekdayFormatter = new Intl.DateTimeFormat("cs-CZ", { weekday: "short" });

  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map((day) => {
        const isSelected = day.dateKey === selectedDate;
        const items = day.items.filter((item) => item.kind !== "cleanup");

        return (
          <button
            className={`flex flex-col items-center gap-1 rounded-lg py-2 transition ${
              isSelected ? "bg-brand text-on-brand" : "text-ink hover:bg-subtle"
            }`}
            key={day.dateKey}
            onClick={() => onSelectDate(day.dateKey)}
            type="button"
          >
            <span
              className={`text-[11px] font-semibold uppercase ${
                isSelected ? "text-on-brand/80" : "text-ink-muted"
              }`}
            >
              {weekdayFormatter.format(day.date)}
            </span>
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                day.dateKey === todayKey && !isSelected ? "ring-2 ring-brand" : ""
              }`}
            >
              {day.date.getDate()}
            </span>
            <span className="flex h-1.5 gap-0.5">
              {items.slice(0, 3).map((item) => (
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isSelected ? "bg-on-brand/80" : itemDotClass[item.kind]
                  }`}
                  key={item.id}
                />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function CalendarLegend() {
  const entries: Array<{ className: string; label: string }> = [
    { className: "border-training-line bg-training", label: "Trénink" },
    { className: "border-event-line bg-event", label: "Akce" },
    { className: "border-busy-line bg-busy", label: "Obsazeno" },
    { className: "pattern-cleanup border-cleanup-line", label: "Čeká na úklid" },
    { className: "border-dashed border-line-strong", label: "Zrušeno" },
    { className: "pattern-closed border-line", label: "Zavřeno" },
  ];

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-muted">
      {entries.map((entry) => (
        <span className="inline-flex items-center gap-1.5" key={entry.label}>
          <span className={`h-3 w-3 rounded-sm border ${entry.className}`} />
          {entry.label}
        </span>
      ))}
    </div>
  );
}
