"use client";

import { Coffee, Users, UtensilsCrossed } from "lucide-react";
import { useNow } from "@/components/dashboard/use-now";
import type { ScheduleDay, ScheduleRow } from "@/lib/public-schedule";

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
// that is on right now gets "Teď".
export function ScheduleView({ days }: { days: ScheduleDay[] }) {
  const now = useNow();
  const todayKey = now ? toDateKey(now) : "";
  const nowMinutes = now ? now.getHours() * 60 + now.getMinutes() : -1;

  return (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
      {days.map((day, index) => {
        const isToday = Boolean(day.dateKey) && day.dateKey === todayKey;

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
                </tr>
              </thead>
              <tbody>
                {day.rows.map((row, rowIndex) => (
                  <Row
                    isNow={
                      isToday &&
                      row.start !== undefined &&
                      row.end !== undefined &&
                      toMinutes(row.start) <= nowMinutes &&
                      nowMinutes < toMinutes(row.end)
                    }
                    isPast={isToday && row.end !== undefined && toMinutes(row.end) <= nowMinutes}
                    key={`${row.start ?? "note"}-${rowIndex}`}
                    row={row}
                  />
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

function Row({ isNow, isPast, row }: { isNow: boolean; isPast: boolean; row: ScheduleRow }) {
  if (row.kind === "note") {
    return (
      <tr className="border-t border-line first:border-t-0">
        <td className="px-4 py-2 text-ink-muted" colSpan={2}>
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
          <span className={row.kind === "break" ? "italic" : "font-semibold"}>{row.text || "–"}</span>
          {isNow ? (
            <span className="rounded-full bg-accent px-2 py-px text-[11px] font-semibold not-italic text-white">Teď</span>
          ) : null}
        </span>
      </td>
    </tr>
  );
}
