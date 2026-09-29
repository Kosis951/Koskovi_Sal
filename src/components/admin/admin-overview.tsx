"use client";

import { CalendarDays, History, Palmtree, Repeat, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import {
  formatDateCz,
  getTodayPragueDateKey,
  useAdminBookings,
  useAdminResource,
} from "@/components/admin/admin-data";
import { getWeekStartDate, isCountableEvent } from "@/components/booking-dashboard-utils";
import { getBookingKind } from "@/components/dashboard/calendar-events";
import type { RecurringCancellationNotice } from "@/lib/bookings-db";
import { formatDateKey } from "@/lib/schedule";

const noCancellations: RecurringCancellationNotice[] = [];

function pickCancellations(data: unknown) {
  return (
    (data as { recurringCancellations?: RecurringCancellationNotice[] })
      .recurringCancellations ?? noCancellations
  );
}

const kindBadge = {
  busy: "bg-busy text-busy-ink",
  event: "bg-event text-event-ink",
  training: "bg-training text-training-ink",
};

export function AdminOverview() {
  const { data: bookings, isLoading } = useAdminBookings();
  const { data: cancellations } = useAdminResource(
    "/api/availability",
    pickCancellations,
    noCancellations,
  );
  const today = getTodayPragueDateKey();
  const stats = useMemo(() => {
    const weekStart = getWeekStartDate(today);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekStartKey = formatDateKey(weekStart);
    const weekEndKey = formatDateKey(weekEnd);
    const hallBookings = bookings.filter((booking) => booking.bookingKind !== "individual-lesson");
    const thisWeek = hallBookings.filter(
      (booking) =>
        booking.date >= weekStartKey && booking.date <= weekEndKey && isCountableEvent(booking),
    );

    return {
      pendingCleanup: hallBookings.filter(
        (booking) => booking.cleanupRequired && !booking.cleanedAt,
      ).length,
      thisWeekEvents: thisWeek.filter((booking) => getBookingKind(booking) !== "training").length,
      thisWeekTrainings: thisWeek.filter((booking) => getBookingKind(booking) === "training")
        .length,
      upcoming: hallBookings
        .filter((booking) => booking.date >= today && getBookingKind(booking) !== "training")
        .slice(0, 8),
    };
  }, [bookings, today]);

  const cards: Array<{ label: string; tone?: string; value: number }> = [
    { label: "Akce tento týden", value: stats.thisWeekEvents },
    { label: "Tréninky tento týden", value: stats.thisWeekTrainings },
    {
      label: "Čeká na úklid",
      tone: stats.pendingCleanup > 0 ? "text-cleanup-ink" : undefined,
      value: stats.pendingCleanup,
    },
    { label: "Zrušené tréninky", value: cancellations.length },
  ];

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((card) => (
          <div className="rounded-xl border border-line bg-surface p-4" key={card.label}>
            <p className="text-sm text-ink-muted">{card.label}</p>
            <p className={`mt-1 text-3xl font-semibold ${card.tone ?? "text-ink"}`}>
              {isLoading ? "–" : card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-xl border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-semibold">Nejbližší akce</h2>
            <Link className="text-sm font-semibold text-brand hover:underline" href="/admin/akce">
              Všechny akce
            </Link>
          </div>
          {stats.upcoming.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-muted">
              {isLoading ? "Načítám…" : "V kalendáři teď nejsou žádné jednorázové akce."}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {stats.upcoming.map((booking) => {
                const kind = getBookingKind(booking);

                return (
                  <li className="flex items-center gap-3 px-4 py-3" key={booking.id}>
                    <div className="w-28 shrink-0 text-sm">
                      <p className="font-semibold capitalize text-ink">
                        {formatDateCz(booking.date)}
                      </p>
                      <p className="text-ink-muted">
                        {booking.start}–{booking.end}
                      </p>
                    </div>
                    <p className="min-w-0 flex-1 truncate font-semibold">{booking.title}</p>
                    {booking.cleanupRequired && !booking.cleanedAt ? (
                      <span className="hidden rounded-full bg-cleanup px-2 py-0.5 text-xs font-semibold text-cleanup-ink sm:inline">
                        úklid
                      </span>
                    ) : null}
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        kindBadge[kind === "busy" ? "busy" : kind === "training" ? "training" : "event"]
                      }`}
                    >
                      {kind === "busy" ? "Obsazeno" : "Akce"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="grid content-start gap-2">
          <QuickLink
            description="Trenéři a změny nejbližších termínů"
            href="/admin/treninky"
            icon={Repeat}
            label="Pravidelné tréninky"
          />
          <QuickLink
            description="Období bez automatických tréninků"
            href="/admin/prazdniny"
            icon={Palmtree}
            label="Prázdniny"
          />
          <QuickLink
            description="Kdo co změnil, vrácení změn"
            href="/admin/historie"
            icon={History}
            label="Historie změn"
          />
          <QuickLink
            description="Přidání akce přímo do kalendáře"
            href="/"
            icon={CalendarDays}
            label="Otevřít kalendář"
          />
        </section>
      </div>
    </div>
  );
}

function QuickLink({
  description,
  href,
  icon: Icon,
  label,
}: {
  description: string;
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 transition hover:border-line-strong hover:bg-subtle"
      href={href}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
        <Icon size={19} />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-ink">{label}</span>
        <span className="block truncate text-sm text-ink-muted">{description}</span>
      </span>
    </Link>
  );
}
