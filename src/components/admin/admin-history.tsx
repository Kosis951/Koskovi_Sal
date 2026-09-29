"use client";

import { Undo2 } from "lucide-react";
import { useState } from "react";
import {
  formatDateCz,
  getTodayPragueDateKey,
  sendJson,
  useAdminResource,
} from "@/components/admin/admin-data";
import { useAdminAccess } from "@/components/admin/admin-layout";
import { noticeTone } from "@/components/ui/styles";
import type { Booking } from "@/lib/schedule";

type AuditLogEntry = {
  action: string;
  actor: string;
  bookingId?: string;
  details?: {
    booking?: Booking;
    date?: string;
    previousBooking?: Booking;
    title?: string;
  };
  timestamp: string;
};

const noEntries: AuditLogEntry[] = [];

function pickEntries(data: unknown) {
  return (data as { entries?: AuditLogEntry[] }).entries ?? noEntries;
}

const actionLabels: Record<string, { className: string; label: string }> = {
  "booking.clean": { className: "bg-free text-free-ink", label: "potvrdil úklid" },
  "booking.create": { className: "bg-event text-event-ink", label: "přidal akci" },
  "booking.delete": { className: "bg-busy text-busy-ink", label: "smazal akci" },
  "booking.rename": { className: "bg-training text-training-ink", label: "přejmenoval" },
  "booking.undo": { className: "bg-subtle text-ink-muted", label: "vrátil změnu" },
  "booking.update": { className: "bg-training text-training-ink", label: "upravil akci" },
};

const timestampFormatter = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "numeric",
});

export function AdminHistory() {
  const access = useAdminAccess();
  const isMainAdmin = access.role === "admin";
  const { data: entries, isLoading, reload } = useAdminResource(
    "/api/audit-log",
    pickEntries,
    noEntries,
  );
  const [undoing, setUndoing] = useState("");
  const [result, setResult] = useState<{ message: string; ok: boolean } | null>(null);

  async function undo(entry: AuditLogEntry) {
    setUndoing(entry.timestamp);
    setResult(null);

    try {
      const response = await sendJson("/api/audit-log/undo", "POST", {
        timestamp: entry.timestamp,
      });

      setResult({
        message:
          response.data.message ??
          (response.ok ? "Změna je vrácená." : "Změnu se nepodařilo vrátit."),
        ok: response.ok,
      });
      await reload();
    } finally {
      setUndoing("");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {!isMainAdmin ? (
        <p className="text-sm text-ink-muted">
          Vidíš jen akce, které jsi smazal ty. Dokud termín neproběhne, můžeš je vrátit.
        </p>
      ) : null}
      {result ? (
        <p className={`rounded-lg border px-3 py-2 text-sm ${result.ok ? noticeTone.success : noticeTone.error}`}>
          {result.message}
        </p>
      ) : null}
      <div className="rounded-xl border border-line bg-surface">
        {isLoading ? (
          <p className="px-4 py-6 text-sm text-ink-muted">Načítám…</p>
        ) : entries.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-muted">Zatím tu nejsou žádné změny.</p>
        ) : (
          <ul className="divide-y divide-line">
            {entries.map((entry) => {
              const action = actionLabels[entry.action] ?? {
                className: "bg-subtle text-ink-muted",
                label: entry.action,
              };
              const date = entry.details?.date ?? entry.details?.booking?.date;

              return (
                <li
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
                  key={`${entry.timestamp}-${entry.action}-${entry.bookingId}`}
                >
                  <span className="w-28 shrink-0 text-sm tabular-nums text-ink-soft">
                    {timestampFormatter.format(new Date(entry.timestamp))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-ink">{entry.actor}</span>{" "}
                    <span
                      className={`mx-1 rounded-full px-2 py-0.5 text-xs font-semibold ${action.className}`}
                    >
                      {action.label}
                    </span>{" "}
                    <span className="text-ink">{entry.details?.title ?? ""}</span>
                    {date ? (
                      <span className="text-sm capitalize text-ink-muted"> · {formatDateCz(date)}</span>
                    ) : null}
                  </span>
                  {canUndo(entry, access.username, isMainAdmin) ? (
                    <button
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong px-2.5 text-xs font-semibold text-ink transition hover:bg-subtle disabled:opacity-60"
                      disabled={undoing === entry.timestamp}
                      onClick={() => undo(entry)}
                      type="button"
                    >
                      <Undo2 size={14} />
                      {undoing === entry.timestamp ? "Vracím…" : "Vrátit"}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {isMainAdmin ? (
        <p className="text-xs text-ink-soft">Zobrazeno posledních 100 změn.</p>
      ) : null}
    </div>
  );
}

function canUndo(entry: AuditLogEntry, username: string, isMainAdmin: boolean) {
  if (!isMainAdmin && (entry.action !== "booking.delete" || entry.actor !== username)) {
    return false;
  }

  if (entry.action === "booking.create") {
    return Boolean(entry.bookingId);
  }

  if (entry.action === "booking.delete") {
    return Boolean(
      entry.details?.booking && entry.details.booking.date >= getTodayPragueDateKey(),
    );
  }

  if (entry.action === "booking.update" || entry.action === "booking.clean") {
    return Boolean(entry.details?.previousBooking);
  }

  return false;
}
