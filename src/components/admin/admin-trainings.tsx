"use client";

import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import {
  formatDateCz,
  getTodayPragueDateKey,
  sendJson,
  useAdminBookings,
  useAdminResource,
} from "@/components/admin/admin-data";
import { useBookingActions, type BookingActions } from "@/components/dashboard/use-booking-actions";
import { Sheet } from "@/components/ui/sheet";
import {
  buttonDanger,
  buttonPrimary,
  buttonSecondary,
  chipClass,
  noticeTone,
} from "@/components/ui/styles";
import type {
  RecurringTrainingInput,
  RecurringTrainingWithStatus as RecurringTraining,
} from "@/lib/bookings-db";
import { trainerOptions, type Booking } from "@/lib/schedule";

const weekdays = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"];
const noTrainings: RecurringTraining[] = [];
// How long a training runs: every week, only in a period, or as a course
// with a fixed number of lessons.
type ValidityMode = "always" | "count" | "period";
const validityModes: Array<{ label: string; mode: ValidityMode }> = [
  { label: "Stále", mode: "always" },
  { label: "Jen v období", mode: "period" },
  { label: "Počet lekcí", mode: "count" },
];

function pickTrainings(data: unknown) {
  return (data as { trainings?: RecurringTraining[] }).trainings ?? noTrainings;
}

// "6. 10." – with the year when it is not the current one.
function formatShortDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const isThisYear = String(year) === getTodayPragueDateKey().slice(0, 4);

  return `${day}. ${month}.${isThisYear ? "" : ` ${year}`}`;
}

function formatLessons(count: number) {
  return `${count} ${count >= 1 && count <= 4 ? "lekce" : "lekcí"}`;
}

// Period, course progress and pause of a training in words; empty for a
// training that simply runs every week.
function describeLimits(training: RecurringTraining) {
  const { status } = training;
  const lines: string[] = [];

  if (training.lessonCount && training.validFrom) {
    lines.push(
      `Kurz ${formatLessons(training.lessonCount)} od ${formatShortDate(training.validFrom)}` +
        ` · proběhlo ${status.heldLessons ?? 0}, zbývá ${status.remainingLessons ?? 0}` +
        (status.lastDate ? ` · poslední ${formatShortDate(status.lastDate)}` : ""),
    );
  } else if (training.validFrom && training.validUntil) {
    lines.push(
      `Od ${formatShortDate(training.validFrom)} do ${formatShortDate(training.validUntil)}`,
    );
  } else if (training.validFrom) {
    lines.push(`Od ${formatShortDate(training.validFrom)}`);
  } else if (training.validUntil) {
    lines.push(`Do ${formatShortDate(training.validUntil)}`);
  }

  if (
    training.pausedFrom &&
    training.pausedUntil &&
    training.pausedUntil >= getTodayPragueDateKey()
  ) {
    lines.push(
      `Pauza ${formatShortDate(training.pausedFrom)} – ${formatShortDate(training.pausedUntil)}`,
    );
  }

  return lines;
}

type Result = { message: string; ok: boolean } | null;

// Regular weekly trainings: add, edit and remove them, and adjust the nearest
// occurrence (trainer or activity) without touching the following weeks.
export function AdminTrainings({
  isCreateOpen,
  onCreateOpenChange,
}: {
  isCreateOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const { data: trainings, isLoading, reload: reloadTrainings } = useAdminResource(
    "/api/recurring-trainings",
    pickTrainings,
    noTrainings,
  );
  const { data: bookings, reload: reloadBookings } = useAdminBookings();
  const actions = useBookingActions(reloadBookings);
  const [editingKey, setEditingKey] = useState("");
  const [result, setResult] = useState<Result>(null);
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
  const occurrenceMessage = Object.values(actions.messages).find(Boolean);

  async function save(method: "POST" | "PUT" | "DELETE", body: unknown) {
    const response = await sendJson("/api/recurring-trainings", method, body);

    setResult({
      message: response.data.message ?? (response.ok ? "Uloženo." : "Uložení se nepovedlo."),
      ok: response.ok,
    });

    if (response.ok) {
      await Promise.all([reloadTrainings(), reloadBookings()]);
    }

    return response.ok;
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {result ? (
        <p className={`rounded-lg border px-3 py-2 text-sm ${result.ok ? noticeTone.success : noticeTone.error}`}>
          {result.message}
        </p>
      ) : null}
      {occurrenceMessage ? (
        <p className={`rounded-lg border px-3 py-2 text-sm ${noticeTone.info}`}>{occurrenceMessage}</p>
      ) : null}
      {isLoading ? <p className="text-sm text-ink-muted">Načítám…</p> : null}
      {!isLoading && trainings.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-6 text-sm text-ink-muted">
          Zatím tu nejsou žádné pravidelné tréninky. Přidej první tlačítkem „Nový trénink“.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {trainings.map((training) => (
          <TrainingCard
            actions={actions}
            booking={nextByKey.get(training.key)}
            isEditing={editingKey === training.key}
            key={training.key}
            onDelete={async () => {
              if (
                window.confirm(
                  `Smazat trénink „${training.title}“? Zmizí ze všech budoucích týdnů.`,
                ) &&
                (await save("DELETE", { key: training.key }))
              ) {
                setEditingKey("");
              }
            }}
            onEditChange={(isEditing) => setEditingKey(isEditing ? training.key : "")}
            onSave={async (input) => {
              if (await save("PUT", { ...input, key: training.key })) {
                setEditingKey("");
              }
            }}
            training={training}
          />
        ))}
      </div>

      <Sheet onClose={() => onCreateOpenChange(false)} open={isCreateOpen} title="Nový trénink">
        <TrainingForm
          onSubmit={async (input) => {
            if (await save("POST", input)) {
              onCreateOpenChange(false);
            }
          }}
          submitLabel="Přidat trénink"
        />
      </Sheet>
    </div>
  );
}

function TrainingCard({
  actions,
  booking,
  isEditing,
  onDelete,
  onEditChange,
  onSave,
  training,
}: {
  actions: BookingActions;
  booking?: Booking;
  isEditing: boolean;
  onDelete: () => void;
  onEditChange: (isEditing: boolean) => void;
  onSave: (input: RecurringTrainingInput) => Promise<void>;
  training: RecurringTraining;
}) {
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const occurrenceTitle = titleDraft ?? booking?.title ?? "";
  const { state } = training.status;
  const stateBadge =
    state === "finished"
      ? { className: "bg-subtle text-ink-muted", label: "Skončil" }
      : state === "upcoming" && training.validFrom
        ? { className: "bg-training text-training-ink", label: `Začne ${formatShortDate(training.validFrom)}` }
        : state === "paused" && training.pausedUntil
          ? { className: "bg-cleanup text-cleanup-ink", label: `Pauza do ${formatShortDate(training.pausedUntil)}` }
          : null;

  return (
    <div className={`rounded-xl border border-line bg-surface p-4 ${state === "finished" ? "opacity-75" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-ink">
            <span className="min-w-0 truncate">
              {training.title}
              {training.alternateTitle ? (
                <span className="font-normal text-ink-muted"> / {training.alternateTitle}</span>
              ) : null}
            </span>
            {stateBadge ? (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${stateBadge.className}`}>
                {stateBadge.label}
              </span>
            ) : null}
          </p>
          <p className="text-sm text-ink-muted">
            {weekdays[training.weekday - 1]} {training.start}–{training.end}
            {training.trainer ? ` · ${training.trainer}` : ""}
          </p>
          {describeLimits(training).map((line) => (
            <p className="text-xs text-ink-muted" key={line}>
              {line}
            </p>
          ))}
        </div>
        <button
          aria-label={isEditing ? "Zavřít úpravy" : `Upravit ${training.title}`}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold text-ink-muted transition hover:bg-subtle hover:text-ink"
          onClick={() => onEditChange(!isEditing)}
          type="button"
        >
          {isEditing ? <X size={15} /> : <Pencil size={14} />}
          {isEditing ? "Zavřít" : "Upravit"}
        </button>
      </div>

      {isEditing ? (
        <div className="mt-3 border-t border-line pt-3">
          <TrainingForm initial={training} onSubmit={onSave} submitLabel="Uložit změny" />
          <button className={`${buttonDanger} mt-3 w-full`} onClick={onDelete} type="button">
            <Trash2 size={15} />
            Smazat trénink
          </button>
        </div>
      ) : booking ? (
        <div className="mt-3 grid gap-2 rounded-lg bg-subtle p-3">
          <p className="text-xs font-semibold uppercase text-ink-muted">
            Nejbližší termín · <span className="capitalize">{formatDateCz(booking.date)}</span>
          </p>
          <select
            aria-label="Trenér nejbližšího termínu"
            className="field-input min-h-10"
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
          <div className="flex items-end gap-2">
            <input
              aria-label="Aktivita v nejbližším termínu"
              className="field-input min-h-10 flex-1"
              onChange={(event) => setTitleDraft(event.target.value)}
              value={occurrenceTitle}
            />
            <button
              aria-label="Uložit aktivitu"
              className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-3 text-on-brand transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              disabled={
                occurrenceTitle.trim() === booking.title ||
                actions.pendingId.title === booking.id
              }
              onClick={async () => {
                if (await actions.updateTitle(booking.id, occurrenceTitle, booking.title)) {
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
          {state === "finished"
            ? "Trénink už skončil. Můžeš ho smazat, nebo mu v úpravách prodloužit platnost."
            : state === "upcoming"
              ? "První termín je dál než za 4 týdny, v kalendáři se objeví později."
              : "V nejbližších 4 týdnech není žádný termín (pauza, prázdniny nebo zrušení)."}
        </p>
      )}
    </div>
  );
}

function TrainingForm({
  initial,
  onSubmit,
  submitLabel,
}: {
  initial?: RecurringTraining;
  onSubmit: (input: RecurringTrainingInput) => Promise<void>;
  submitLabel: string;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [alternateTitle, setAlternateTitle] = useState(initial?.alternateTitle ?? "");
  const [weekday, setWeekday] = useState(initial?.weekday ?? 1);
  const [start, setStart] = useState(initial?.start ?? "17:00");
  const [end, setEnd] = useState(initial?.end ?? "18:00");
  const [trainer, setTrainer] = useState(initial?.trainer ?? "");
  const [validityMode, setValidityMode] = useState<ValidityMode>(
    initial?.lessonCount ? "count" : initial?.validFrom || initial?.validUntil ? "period" : "always",
  );
  const [validFrom, setValidFrom] = useState(initial?.validFrom ?? "");
  const [validUntil, setValidUntil] = useState(initial?.validUntil ?? "");
  const [lessonCount, setLessonCount] = useState(String(initial?.lessonCount ?? 10));
  const [pausedFrom, setPausedFrom] = useState(initial?.pausedFrom ?? "");
  const [pausedUntil, setPausedUntil] = useState(initial?.pausedUntil ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const trainers = initial?.trainer && !trainerOptions.includes(initial.trainer)
    ? [...trainerOptions, initial.trainer]
    : trainerOptions;
  const lessons = Number(lessonCount);
  const validityError =
    validityMode === "count" && !validFrom
      ? "Vyplň datum první lekce."
      : validityMode === "count" && (!Number.isInteger(lessons) || lessons < 1 || lessons > 200)
        ? "Počet lekcí musí být 1 až 200."
        : validityMode === "period" && validFrom && validUntil && validUntil < validFrom
          ? "Konec období musí být po jeho začátku."
          : Boolean(pausedFrom) !== Boolean(pausedUntil)
            ? "U pauzy vyplň začátek i konec."
            : pausedFrom && pausedUntil < pausedFrom
              ? "Konec pauzy musí být po jejím začátku."
              : "";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      await onSubmit({
        alternateTitle: alternateTitle.trim() || undefined,
        end,
        lessonCount: validityMode === "count" ? lessons : undefined,
        pausedFrom: pausedFrom || undefined,
        pausedUntil: pausedUntil || undefined,
        start,
        title: title.trim(),
        trainer: trainer || undefined,
        validFrom: validityMode === "always" ? undefined : validFrom || undefined,
        validUntil: validityMode === "period" ? validUntil || undefined : undefined,
        weekday,
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={handleSubmit}>
      <label className="field-label">
        Název
        <input
          className="field-input mt-1 min-h-10"
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Junioři"
          required
          value={title}
        />
      </label>
      <label className="field-label">
        Střídavý název (nepovinné)
        <input
          className="field-input mt-1 min-h-10"
          maxLength={120}
          onChange={(event) => setAlternateTitle(event.target.value)}
          placeholder="Společná STT"
          value={alternateTitle}
        />
        <span className="mt-1 block text-xs font-normal text-ink-soft">
          Když je vyplněný, každý druhý týden se použije místo hlavního názvu.
        </span>
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="field-label">
          Den
          <select
            className="field-input mt-1 min-h-10"
            onChange={(event) => setWeekday(Number(event.target.value))}
            value={weekday}
          >
            {weekdays.map((label, index) => (
              <option key={label} value={index + 1}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Od
          <input
            className="field-input mt-1 min-h-10"
            onChange={(event) => setStart(event.target.value)}
            required
            type="time"
            value={start}
          />
        </label>
        <label className="field-label">
          Do
          <input
            className="field-input mt-1 min-h-10"
            onChange={(event) => setEnd(event.target.value)}
            required
            type="time"
            value={end}
          />
        </label>
      </div>
      <label className="field-label">
        Výchozí trenér (nepovinné)
        <select
          className="field-input mt-1 min-h-10"
          onChange={(event) => setTrainer(event.target.value)}
          value={trainer}
        >
          <option value="">Bez trenéra</option>
          {trainers.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="grid gap-2 rounded-lg border border-line p-3">
        <legend className="field-label px-1">Jak dlouho trénink poběží</legend>
        <div className="flex flex-wrap gap-1.5">
          {validityModes.map(({ label, mode }) => (
            <button
              aria-pressed={validityMode === mode}
              className={chipClass(validityMode === mode)}
              key={mode}
              onClick={() => setValidityMode(mode)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        {validityMode === "period" ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="field-label">
                Od (nepovinné)
                <input
                  className="field-input mt-1 min-h-10"
                  onChange={(event) => setValidFrom(event.target.value)}
                  type="date"
                  value={validFrom}
                />
              </label>
              <label className="field-label">
                Do (nepovinné)
                <input
                  className="field-input mt-1 min-h-10"
                  min={validFrom || undefined}
                  onChange={(event) => setValidUntil(event.target.value)}
                  type="date"
                  value={validUntil}
                />
              </label>
            </div>
            <p className="text-xs text-ink-soft">
              Trénink se v kalendáři ukáže jen v tomto období (včetně obou dnů).
            </p>
          </>
        ) : null}
        {validityMode === "count" ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="field-label">
                První lekce
                <input
                  className="field-input mt-1 min-h-10"
                  onChange={(event) => setValidFrom(event.target.value)}
                  required
                  type="date"
                  value={validFrom}
                />
              </label>
              <label className="field-label">
                Počet lekcí
                <input
                  className="field-input mt-1 min-h-10"
                  inputMode="numeric"
                  max={200}
                  min={1}
                  onChange={(event) => setLessonCount(event.target.value)}
                  required
                  type="number"
                  value={lessonCount}
                />
              </label>
            </div>
            <p className="text-xs text-ink-soft">
              Zrušené lekce, prázdniny a pauza se nepočítají – kurz se o ně prodlouží.
            </p>
          </>
        ) : null}
      </fieldset>
      <details className="group rounded-lg border border-line" open={Boolean(pausedFrom || pausedUntil)}>
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[13px] font-semibold text-ink-muted [&::-webkit-details-marker]:hidden">
          Pauza (nepovinné)
          <span className="text-ink-soft transition group-open:rotate-45">+</span>
        </summary>
        <div className="grid gap-2 px-3 pb-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="field-label">
              Od
              <input
                className="field-input mt-1 min-h-10"
                onChange={(event) => setPausedFrom(event.target.value)}
                type="date"
                value={pausedFrom}
              />
            </label>
            <label className="field-label">
              Do
              <input
                className="field-input mt-1 min-h-10"
                min={pausedFrom || undefined}
                onChange={(event) => setPausedUntil(event.target.value)}
                type="date"
                value={pausedUntil}
              />
            </label>
          </div>
          <p className="text-xs text-ink-soft">
            V pauze se trénink neukazuje, pak pokračuje. Hodí se při dočasném přesunu: tady
            nastav pauzu a přidej nový trénink v jiném čase s obdobím na stejné dny.
          </p>
          {pausedFrom || pausedUntil ? (
            <button
              className="justify-self-start text-xs font-semibold text-accent underline-offset-2 hover:underline"
              onClick={() => {
                setPausedFrom("");
                setPausedUntil("");
              }}
              type="button"
            >
              Zrušit pauzu
            </button>
          ) : null}
        </div>
      </details>
      {start >= end || validityError ? (
        <p className={`rounded-lg border px-3 py-2 text-xs font-semibold ${noticeTone.error}`}>
          {start >= end ? "Konec musí být později než začátek." : validityError}
        </p>
      ) : null}
      <button
        className={initial ? buttonSecondary : `${buttonPrimary} h-11`}
        disabled={isSaving || start >= end || !title.trim() || Boolean(validityError)}
        type="submit"
      >
        {initial ? <Save size={15} /> : <Plus size={16} />}
        {isSaving ? "Ukládám…" : submitLabel}
      </button>
    </form>
  );
}
