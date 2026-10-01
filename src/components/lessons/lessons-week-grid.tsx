"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { LessonSlotState } from "@/lib/lessons-db";

// One block in the week: an offered slot or a lesson.
export type GridBlock = {
  date: string;
  end: string;
  key: string;
  // Second line: who has it, or "Volno" / "Obsazeno" …
  label: string;
  // Missing = nothing happens on click.
  onClick?: () => void;
  start: string;
  state: LessonSlotState;
};

// Tall enough for two lines of text in a 30-minute lesson.
const hourHeight = 60;
const weekdayFormatter = new Intl.DateTimeFormat("cs-CZ", { weekday: "short" });
const dayFormatter = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric" });

const blockClass: Record<LessonSlotState, string> = {
  confirmed: "border-training-line bg-training text-training-ink",
  free: "border-accent bg-surface text-ink",
  "mine-confirmed": "border-free-line bg-free text-free-ink",
  "mine-pending": "pattern-cleanup border-cleanup-line text-cleanup-ink",
  pending: "pattern-cleanup border-cleanup-line text-cleanup-ink",
  taken: "border-line bg-subtle text-ink-soft",
};

export const gridLegend: Array<{ className: string; label: string }> = [
  { className: "border-accent bg-surface", label: "Volno" },
  { className: "pattern-cleanup border-cleanup-line", label: "Čeká na potvrzení" },
  { className: "border-training-line bg-training", label: "Potvrzeno" },
];

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// A week of lesson slots as a time grid, like the hall calendar: days side
// by side, each slot or lesson a block at its time. `weeks` is how many weeks
// ahead can be browsed (slots are offered that far).
export function LessonsWeekGrid({ blocks, weeks = 6 }: { blocks: GridBlock[]; weeks?: number }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const today = new Date();
  const todayKey = toDateKey(today);
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);

  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + weekOffset * 7);

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);

    date.setDate(monday.getDate() + index);

    return { date, dateKey: toDateKey(date) };
  });
  // The same hours every week, so blocks do not jump when browsing.
  const rangeStart = blocks.length
    ? Math.floor(Math.min(...blocks.map((block) => toMinutes(block.start))) / 60) * 60
    : 9 * 60;
  const rangeEnd = blocks.length
    ? Math.ceil(Math.max(...blocks.map((block) => toMinutes(block.end))) / 60) * 60
    : 18 * 60;
  const hours = Array.from({ length: (rangeEnd - rangeStart) / 60 + 1 }, (_, index) => rangeStart + index * 60);
  const height = ((rangeEnd - rangeStart) / 60) * hourHeight;
  const top = (minutes: number) => ((minutes - rangeStart) / 60) * hourHeight;
  const columns = "3rem repeat(7, minmax(0, 1fr))";
  const navButton =
    "inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted transition hover:bg-subtle hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center">
          <button
            aria-label="Předchozí týden"
            className={navButton}
            disabled={weekOffset === 0}
            onClick={() => setWeekOffset((current) => Math.max(0, current - 1))}
            type="button"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            aria-label="Další týden"
            className={navButton}
            disabled={weekOffset >= weeks}
            onClick={() => setWeekOffset((current) => Math.min(weeks, current + 1))}
            type="button"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <p className="text-base font-black text-ink">
          {dayFormatter.format(days[0].date)} – {dayFormatter.format(days[6].date)}
        </p>
        {weekOffset !== 0 ? (
          <button
            className="h-8 rounded-full border border-line-strong px-3 text-xs font-semibold text-ink transition hover:border-accent hover:bg-subtle"
            onClick={() => setWeekOffset(0)}
            type="button"
          >
            Tento týden
          </button>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
          {gridLegend.map((entry) => (
            <span className="inline-flex items-center gap-1.5" key={entry.label}>
              <span className={`h-3 w-3 rounded-sm border ${entry.className}`} />
              {entry.label}
            </span>
          ))}
        </div>
      </div>

      {/* On phones the week is wider than the screen and scrolls sideways. */}
      <div className="mt-3 overflow-x-auto">
        {/* Bottom padding: the last hour label hangs below the grid. */}
        <div className="min-w-[640px] select-none pb-2">
          <div className="grid border-b border-line" style={{ gridTemplateColumns: columns }}>
            <span />
            {days.map((day) => (
              <div
                className={`flex items-center justify-center gap-1.5 whitespace-nowrap py-1.5 ${
                  day.dateKey < todayKey ? "opacity-50" : ""
                }`}
                key={day.dateKey}
              >
                <span className="text-xs font-semibold uppercase text-ink-muted">
                  {weekdayFormatter.format(day.date)}
                </span>
                <span
                  className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-sm font-semibold ${
                    day.dateKey === todayKey ? "bg-brand text-on-brand" : "text-ink"
                  }`}
                >
                  {dayFormatter.format(day.date)}
                </span>
              </div>
            ))}
          </div>

          <div className="grid" style={{ gridTemplateColumns: columns }}>
            <div className="relative" style={{ height }}>
              {hours.map((minutes, index) => (
                <span
                  className={`absolute right-2 text-[11px] text-ink-soft ${index === 0 ? "" : "-translate-y-1/2"}`}
                  key={minutes}
                  style={{ top: top(minutes) }}
                >
                  {String(minutes / 60).padStart(2, "0")}:00
                </span>
              ))}
            </div>
            {days.map((day) => (
              <div
                className={`relative border-l border-line ${day.dateKey < todayKey ? "bg-subtle/60" : ""}`}
                key={day.dateKey}
                style={{ height }}
              >
                {hours.slice(1).map((minutes) => (
                  <span
                    className="pointer-events-none absolute inset-x-0 border-t border-line/70"
                    key={minutes}
                    style={{ top: top(minutes) }}
                  />
                ))}
                {blocks
                  .filter((block) => block.date === day.dateKey)
                  .map((block) => {
                    const className = `absolute inset-x-0.5 overflow-hidden rounded-md border px-1.5 py-px text-left text-xs leading-[13px] ${blockClass[block.state]}`;
                    const style = {
                      height: top(toMinutes(block.end)) - top(toMinutes(block.start)) - 2,
                      top: top(toMinutes(block.start)) + 1,
                    };
                    const content = (
                      <>
                        <span className="block whitespace-nowrap font-semibold tabular-nums">
                          {block.start}–{block.end}
                        </span>
                        <span className="block truncate">{block.label}</span>
                      </>
                    );

                    return block.onClick ? (
                      <button
                        className={`${className} transition hover:z-[1] hover:shadow-md`}
                        key={block.key}
                        onClick={block.onClick}
                        style={style}
                        title={`${block.start}–${block.end} · ${block.label}`}
                        type="button"
                      >
                        {content}
                      </button>
                    ) : (
                      <div className={className} key={block.key} style={style} title={`${block.start}–${block.end} · ${block.label}`}>
                        {content}
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
