import { AlertCircle, Check, ChevronDown, Clock3, RefreshCw } from "lucide-react";
import type { HallStatus } from "@/components/dashboard/calendar-events";
import { cancellationDateFormatter } from "@/components/booking-dashboard-utils";
import type {
  RecurringCancellationNotice,
  RecurringOverrideNotice,
} from "@/lib/bookings-db";
import type { Booking } from "@/lib/schedule";

const toneClass: Record<HallStatus["tone"], { box: string; dot: string }> = {
  busy: { box: "border-busy-line bg-busy text-busy-ink", dot: "bg-busy-ink" },
  cleanup: {
    box: "border-cleanup-line bg-cleanup text-cleanup-ink",
    dot: "bg-cleanup-ink",
  },
  closed: { box: "border-line bg-subtle text-ink", dot: "bg-ink-soft" },
  free: { box: "border-free-line bg-free text-free-ink", dot: "bg-free-ink" },
};

// The answer to "can I use the hall right now?", shown above the calendar.
export function HallStatusBanner({
  freeHours,
  onRequestCleanup,
  status,
  todaysOpeningHours,
}: {
  freeHours: number | null;
  onRequestCleanup: (booking: Booking) => void;
  status: HallStatus | null;
  todaysOpeningHours: string;
}) {
  const cleanupBooking = status?.cleanupBooking;

  const tone = toneClass[status?.tone ?? "closed"];

  return (
    <div
      aria-live="polite"
      className={`flex flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:gap-4 lg:py-2.5 ${
        status ? tone.box : "border-line bg-surface"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${
            status ? tone.dot : "bg-line-strong"
          } ${status?.tone === "free" ? "animate-pulse" : ""}`}
        />
        {/* One line on computers, so the calendar below gets the height. */}
        <div className="min-w-0 lg:flex lg:flex-wrap lg:items-baseline lg:gap-x-3">
          <p className="text-base font-semibold sm:text-lg">
            {status?.title ?? "Zjišťuji stav sálu…"}
          </p>
          {status ? <p className="text-sm opacity-85">{status.detail}</p> : null}
        </div>
      </div>
      {cleanupBooking ? (
        <button
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 self-start rounded-full bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover sm:self-center"
          onClick={() => onRequestCleanup(cleanupBooking)}
          type="button"
        >
          <Check size={16} />
          Uklidil jsem sál
        </button>
      ) : null}
      <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 text-sm opacity-90 sm:ml-auto sm:text-right">
        <span className="inline-flex items-center gap-1.5">
          <Clock3 size={15} />
          Dnes otevřeno {todaysOpeningHours}
        </span>
        {freeHours !== null ? (
          <span>Volno dnes {freeHours.toLocaleString("cs-CZ")} h</span>
        ) : null}
      </div>
    </div>
  );
}

// Opening hours and changes to regular trainings, collapsed by default so
// they do not push the calendar down.
export function ScheduleInfo({
  cancellations,
  canReinstate,
  changes,
  onReinstate,
  openingHours,
  reinstatingId,
}: {
  cancellations: RecurringCancellationNotice[];
  canReinstate: boolean;
  changes: RecurringOverrideNotice[];
  onReinstate: (id: string) => void;
  openingHours: Array<{ days: string; hours: string }>;
  reinstatingId: string;
}) {
  const noticeCount = cancellations.length + changes.length;
  const summaryClass =
    "flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden";

  return (
    <div className="divide-y divide-line rounded-xl border border-line bg-surface">
      <details className="group">
        <summary className={summaryClass}>
          <Clock3 className="text-ink-muted" size={16} />
          Otevírací doba
          <ChevronDown
            className="ml-auto text-ink-soft transition group-open:rotate-180"
            size={16}
          />
        </summary>
        <dl className="grid gap-1.5 px-4 pb-4 text-sm">
          {openingHours.map((group) => (
            <div className="flex justify-between gap-3" key={group.days}>
              <dt className="text-ink-muted">{group.days}</dt>
              <dd className="font-semibold text-ink">{group.hours}</dd>
            </div>
          ))}
          <p className="mt-1 text-xs text-ink-soft">
            Posledních 30 minut před zavíračkou je vyhrazeno na odchod ze sálu.
          </p>
        </dl>
      </details>
      <details className="group" open={noticeCount > 0 && noticeCount <= 2}>
        <summary className={summaryClass}>
          <AlertCircle
            className={noticeCount > 0 ? "text-cleanup-ink" : "text-ink-muted"}
            size={16}
          />
          Změny v rozvrhu
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              noticeCount > 0 ? "bg-cleanup text-cleanup-ink" : "bg-subtle text-ink-muted"
            }`}
          >
            {noticeCount}
          </span>
          <ChevronDown
            className="ml-auto text-ink-soft transition group-open:rotate-180"
            size={16}
          />
        </summary>
        <div className="grid gap-2 px-4 pb-4 text-sm">
          {noticeCount === 0 ? (
            <p className="text-ink-muted">Pravidelné tréninky běží beze změn.</p>
          ) : null}
          {changes.map((change) => (
            <div
              className="rounded-lg border border-cleanup-line bg-cleanup px-3 py-2 text-cleanup-ink"
              key={change.id}
            >
              <p className="flex items-center gap-1.5 font-semibold">
                <RefreshCw size={14} />
                {formatNoticeDate(change.date)} · {change.originalTitle}
              </p>
              {change.hasTitleChange ? (
                <p className="mt-0.5">
                  Místo toho: <strong>{change.newTitle}</strong>
                </p>
              ) : null}
              {change.hasTimeChange ? (
                <p className="mt-0.5">
                  Nový čas: <strong>{change.start}–{change.end}</strong> (původně{" "}
                  {change.originalStart}–{change.originalEnd})
                </p>
              ) : null}
            </div>
          ))}
          {cancellations.map((cancellation) => (
            <div
              className="flex items-center justify-between gap-3 rounded-lg border border-busy-line bg-busy px-3 py-2 text-busy-ink"
              key={cancellation.id}
            >
              <div className="min-w-0">
                <p className="font-semibold">Zrušeno: {cancellation.title}</p>
                <p className="text-xs">
                  {formatNoticeDate(cancellation.date)} · {cancellation.start}–
                  {cancellation.end}
                </p>
              </div>
              {canReinstate ? (
                <button
                  className="shrink-0 rounded-md border border-busy-line bg-surface px-2.5 py-1 text-xs font-semibold text-busy-ink transition hover:brightness-95 disabled:opacity-60"
                  disabled={reinstatingId === cancellation.id}
                  onClick={() => onReinstate(cancellation.id)}
                  type="button"
                >
                  {reinstatingId === cancellation.id ? "Obnovuji…" : "Obnovit"}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function formatNoticeDate(dateKey: string) {
  return cancellationDateFormatter.format(new Date(`${dateKey}T12:00:00`));
}
