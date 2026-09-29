"use client";

import { Save } from "lucide-react";
import { useMemo, useState } from "react";
import {
  formatDateCz,
  getTodayPragueDateKey,
  useAdminBookings,
  useAdminResource,
} from "@/components/admin/admin-data";
import { useBookingActions, type BookingActions } from "@/components/dashboard/use-booking-actions";
import { noticeTone } from "@/components/ui/styles";
import { trainerOptions, type Booking } from "@/lib/schedule";

type TrainingLabel = { key: string; label: string; schedule: string };

const noLabels: TrainingLabel[] = [];

function pickLabels(data: unknown) {
  return (data as { labels?: TrainingLabel[] }).labels ?? noLabels;
}

// Regular trainings with their nearest date: set the trainer or rename that
// one occurrence without touching the following weeks.
export function AdminTrainings() {
  const { data: bookings, reload } = useAdminBookings();
  const { data: labels, isLoading } = useAdminResource(
    "/api/recurring-trainers",
    pickLabels,
    noLabels,
  );
  const actions = useBookingActions(reload);
  const nextByKey = useMemo(() => {
    const today = getTodayPragueDateKey();
    const next = new Map<string, Booking>();

    for (const booking of bookings) {
      if (!booking.recurringKey || booking.date < today) {
        continue;
      }

      const current = next.get(booking.recurringKey);

      if (!current || `${booking.date}${booking.start}` < `${current.date}${current.start}`) {
        next.set(booking.recurringKey, booking);
      }
    }

    return next;
  }, [bookings]);
  const message = Object.values(actions.messages).find(Boolean);

  return (
    <div className="grid grid-cols-1 gap-3">
      {message ? (
        <p className={`rounded-lg border px-3 py-2 text-sm ${noticeTone.info}`}>{message}</p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {isLoading ? <p className="text-sm text-ink-muted">Načítám…</p> : null}
        {labels.map((training) => (
          <TrainingCard
            actions={actions}
            booking={nextByKey.get(training.key)}
            key={training.key}
            training={training}
          />
        ))}
      </div>
    </div>
  );
}

function TrainingCard({
  actions,
  booking,
  training,
}: {
  actions: BookingActions;
  booking?: Booking;
  training: TrainingLabel;
}) {
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const title = titleDraft ?? booking?.title ?? "";

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">{training.label}</p>
          <p className="text-sm text-ink-muted">{training.schedule}</p>
        </div>
        <span className="shrink-0 rounded-full bg-training px-2.5 py-0.5 text-xs font-semibold capitalize text-training-ink">
          {booking ? formatDateCz(booking.date) : "Bez termínu"}
        </span>
      </div>

      {booking ? (
        <div className="mt-3 grid gap-2">
          <label className="field-label">
            Trenér nejbližšího termínu
            <select
              className="field-input mt-1 min-h-10"
              disabled={actions.pendingId.trainer === booking.id}
              onChange={(event) => actions.updateTrainer(booking.id, event.target.value)}
              value={booking.trainer ?? ""}
            >
              <option value="">Bez trenéra</option>
              {trainerOptions.map((trainer) => (
                <option key={trainer} value={trainer}>
                  {trainer}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <label className="field-label flex-1">
              Aktivita v tomto termínu
              <input
                className="field-input mt-1 min-h-10"
                onChange={(event) => setTitleDraft(event.target.value)}
                value={title}
              />
            </label>
            <button
              aria-label="Uložit název"
              className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-3 text-on-brand transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              disabled={
                title.trim() === booking.title || actions.pendingId.title === booking.id
              }
              onClick={async () => {
                if (await actions.updateTitle(booking.id, title, booking.title)) {
                  setTitleDraft(null);
                }
              }}
              type="button"
            >
              <Save size={15} />
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">
          V nejbližších 4 týdnech není žádný termín (prázdniny nebo zrušení).
        </p>
      )}
    </div>
  );
}
