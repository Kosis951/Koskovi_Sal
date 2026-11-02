"use client";

import { Coffee, Users, UtensilsCrossed, X } from "lucide-react";
import type { ReactNode } from "react";
import { useNow } from "@/components/dashboard/use-now";
import { lessonKey, rowLabel, type ScheduleDay, type ScheduleRow } from "@/lib/public-schedule";

export type ScheduleLesson = { date: string; end: string; lessonName: string; start: string };

const dayFormatter = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "numeric",
  weekday: "long",
});

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// The schedule as one table per day. Today's card is marked, and the row
// that is on right now gets "Teď". With `onRequest`, lessons still ahead
// get a cross for asking to cancel or move them; `pendingKeys` (lessonKey)
// are the ones already asked about.
export function ScheduleView({
  days,
  onRequest,
  pendingKeys,
}: {
  days: ScheduleDay[];
  onRequest?: (lesson: ScheduleLesson) => void;
  pendingKeys?: Set<string>;
}) {
  const now = useNow();
  const todayKey = now ? toDateKey(now) : "";
  const nowMinutes = now ? now.getHours() * 60 + now.getMinutes() : -1;

  return (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
      {days.map((day, index) => {
        const isToday = Boolean(day.dateKey) && day.dateKey === todayKey;
        const isPastDay = Boolean(day.dateKey && todayKey && day.dateKey < todayKey);

        return (
          <section
            className={`overflow-hidden rounded-xl border bg-surface ${isToday ? "border-accent" : "border-line"}`}
            key={day.dateKey ?? `day-${index}`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line bg-subtle px-4 py-3">
              <h2 className="text-lg font-black first-letter:uppercase">
                {day.dateKey ? dayFormatter.format(new Date(`${day.dateKey}T12:00:00`)) : "Rozpis"}
              </h2>
              {isToday ? (
                <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-white">Dnes</span>
              ) : null}
            </div>
            <table className="w-full border-collapse text-sm">
              <thead className="sr-only">
                <tr>
                  <th scope="col">Čas</th>
                  <th scope="col">Lekce</th>
                  {onRequest ? <th scope="col">Žádost</th> : null}
                </tr>
              </thead>
              <tbody>
                {day.rows.map((row, rowIndex) => {
                  const isPast =
                    isPastDay || (isToday && row.end !== undefined && toMinutes(row.end) <= nowMinutes);
                  const lesson =
                    day.dateKey && row.kind === "lesson" && row.text && row.start && row.end
                      ? { date: day.dateKey, end: row.end, lessonName: row.text, start: row.start }
                      : null;

                  return (
                    <Row
                      action={
                        !onRequest ? undefined : !lesson || isPast || !now ? null : pendingKeys?.has(lessonKey(lesson)) ? (
                          <span className="whitespace-nowrap rounded-full bg-cleanup px-2 py-0.5 text-[11px] font-semibold text-cleanup-ink">
                            žádost odeslána
                          </span>
                        ) : (
                          <button
                            aria-label={`Zrušit nebo přesunout lekci ${lesson.start}–${lesson.end} ${lesson.lessonName}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-soft transition hover:bg-busy hover:text-busy-ink"
                            onClick={() => onRequest(lesson)}
                            title="Zrušit nebo přesunout lekci"
                            type="button"
                          >
                            <X size={16} />
                          </button>
                        )
                      }
                      isNow={
                        isToday &&
                        row.start !== undefined &&
                        row.end !== undefined &&
                        toMinutes(row.start) <= nowMinutes &&
                        nowMinutes < toMinutes(row.end)
                      }
                      isPast={isPast}
                      key={`${row.start ?? "note"}-${rowIndex}`}
                      row={row}
                    />
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

function Row({
  action,
  isNow,
  isPast,
  row,
}: {
  // The request cell: undefined = no such column, null = an empty cell.
  action?: ReactNode;
  isNow: boolean;
  isPast: boolean;
  row: ScheduleRow;
}) {
  if (row.kind === "note") {
    return (
      <tr className="border-t border-line first:border-t-0">
        <td className="px-4 py-2 text-ink-muted" colSpan={action === undefined ? 2 : 3}>
          {row.text}
        </td>
      </tr>
    );
  }

  const tone =
    row.kind === "break"
      ? "bg-subtle text-ink-muted"
      : row.kind === "group"
        ? "bg-training text-training-ink"
        : "text-ink";

  return (
    <tr
      aria-current={isNow ? "time" : undefined}
      className={`border-t border-line first:border-t-0 ${tone} ${isPast && !isNow ? "opacity-55" : ""} ${
        isNow ? "shadow-[inset_4px_0_0_var(--k-accent)]" : ""
      }`}
    >
      <td className="w-[7.5rem] whitespace-nowrap py-2.5 pl-4 pr-2 align-top font-semibold tabular-nums text-ink-muted">
        {row.start}–{row.end}
      </td>
      <td className="py-2.5 pl-2 pr-4 align-top">
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          {row.kind === "break" ? (
            /ob[eě]d/i.test(row.text) ? (
              <UtensilsCrossed aria-hidden="true" className="shrink-0" size={14} />
            ) : (
              <Coffee aria-hidden="true" className="shrink-0" size={14} />
            )
          ) : null}
          {row.kind === "group" ? <Users aria-hidden="true" className="shrink-0" size={15} /> : null}
          <span className={row.kind === "break" ? "italic" : "font-semibold"}>{rowLabel(row) || "–"}</span>
          {isNow ? (
            <span className="rounded-full bg-accent px-2 py-px text-[11px] font-semibold not-italic text-white">Teď</span>
          ) : null}
        </span>
      </td>
      {action === undefined ? null : <td className="w-px py-1 pr-2 text-right align-middle">{action}</td>}
    </tr>
  );
}
