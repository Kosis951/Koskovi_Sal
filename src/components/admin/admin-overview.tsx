"use client";

import { CalendarDays, History, Palmtree, Repeat, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BookingRow } from "@/components/admin/admin-bookings-list";
import {
  getTodayPragueDateKey,
  useAdminBookings,
  useAdminResource,
} from "@/components/admin/admin-data";
import { getWeekStartDate, isCountableEvent } from "@/components/booking-dashboard-utils";
import { getBookingKind } from "@/components/dashboard/calendar-events";
import { useBookingActions } from "@/components/dashboard/use-booking-actions";
import { noticeTone } from "@/components/ui/styles";
import type { RecurringCancellationNotice } from "@/lib/bookings-db";
import { formatDateKey, trainerOptions } from "@/lib/schedule";

const noCancellations: RecurringCancellationNotice[] = [];

function pickCancellations(data: unknown) {
  return (
    (data as { recurringCancellations?: RecurringCancellationNotice[] })
      .recurringCancellations ?? noCancellations
  );
}

export function AdminOverview() {
  const { data: bookings, isLoading, reload } = useAdminBookings();
  const actions = useBookingActions(reload);
  const [expandedId, setExpandedId] = useState("");
  const actionMessage = Object.values(actions.messages).find(Boolean);
  const availableTrainers = useMemo(
    () => [
      ...new Set([
        ...trainerOptions,
        ...bookings.flatMap((booking) => (booking.trainer ? [booking.trainer] : [])),
      ]),
    ],
    [bookings],
  );
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
            <h2 className="font-semibold">
              Nejbližší akce{" "}
              <span className="text-sm font-normal text-ink-muted">· kliknutím upravíš</span>
            </h2>
            <Link className="text-sm font-semibold text-brand hover:underline" href="/admin/akce">
              Všechny akce
            </Link>
          </div>
          {stats.upcoming.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-muted">
              {isLoading ? "Načítám…" : "V kalendáři teď nejsou žádné jednorázové akce."}
            </p>
          ) : (
            // The same editable rows as on the "Akce" page: a click opens
            // the editor in place.
            <ul className="divide-y divide-line">
              {stats.upcoming.map((booking) => (
                <BookingRow
                  actions={actions}
                  availableTrainers={availableTrainers}
                  booking={booking}
                  isExpanded={expandedId === booking.id}
                  key={booking.id}
                  onToggle={() =>
                    setExpandedId((current) => (current === booking.id ? "" : booking.id))
                  }
                  showDate
                />
              ))}
            </ul>
          )}
          {actionMessage ? (
            <p className={`m-3 rounded-lg border px-3 py-2 text-sm ${noticeTone.info}`}>
              {actionMessage}
            </p>
          ) : null}
        </section>

        <section className="grid content-start gap-2">
          <QuickLink
            description="Přidání, úprava a trenéři tréninků"
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
