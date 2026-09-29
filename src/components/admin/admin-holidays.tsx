"use client";

import { Palmtree, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { formatDateCz, sendJson, useAdminResource } from "@/components/admin/admin-data";
import { buttonPrimary, noticeTone } from "@/components/ui/styles";
import type { RecurringHoliday } from "@/lib/bookings-db";

const noHolidays: RecurringHoliday[] = [];

function pickHolidays(data: unknown) {
  return (data as { holidays?: RecurringHoliday[] }).holidays ?? noHolidays;
}

export function AdminHolidays() {
  const { data: holidays, isLoading, reload } = useAdminResource(
    "/api/recurring-holidays",
    pickHolidays,
    noHolidays,
  );
  const [label, setLabel] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [result, setResult] = useState<{ message: string; ok: boolean } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setResult(null);

    try {
      const response = await sendJson("/api/recurring-holidays", "POST", { end, label, start });

      if (!response.ok) {
        setResult({
          message: response.data.message ?? "Období se nepodařilo uložit.",
          ok: false,
        });
        return;
      }

      setLabel("");
      setStart("");
      setEnd("");
      setResult({ message: "Období je uložené, tréninky se v něm nevytvoří.", ok: true });
      await reload();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(holiday: RecurringHoliday) {
    if (!window.confirm(`Odstranit období „${holiday.label}“? Tréninky se v něm znovu objeví.`)) {
      return;
    }

    const response = await sendJson("/api/recurring-holidays", "DELETE", { id: holiday.id });

    setResult(
      response.ok
        ? { message: "Období je odstraněné.", ok: true }
        : { message: response.data.message ?? "Období se nepodařilo odstranit.", ok: false },
    );
    await reload();
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <form
        className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-surface p-4 md:grid-cols-[minmax(180px,1fr)_160px_160px_auto] md:items-end"
        onSubmit={handleAdd}
      >
        <label className="field-label">
          Popis
          <input
            className="field-input mt-1 min-h-10"
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Podzimní prázdniny"
            value={label}
          />
        </label>
        <label className="field-label">
          Od
          <input
            className="field-input mt-1 min-h-10"
            onChange={(event) => setStart(event.target.value)}
            required
            type="date"
            value={start}
          />
        </label>
        <label className="field-label">
          Do
          <input
            className="field-input mt-1 min-h-10"
            min={start || undefined}
            onChange={(event) => setEnd(event.target.value)}
            required
            type="date"
            value={end}
          />
        </label>
        <button className={buttonPrimary} disabled={isSaving} type="submit">
          <Plus size={16} />
          Přidat období
        </button>
      </form>

      {result ? (
        <p className={`rounded-lg border px-3 py-2 text-sm ${result.ok ? noticeTone.success : noticeTone.error}`}>
          {result.message}
        </p>
      ) : null}

      <div className="rounded-xl border border-line bg-surface">
        {isLoading ? (
          <p className="px-4 py-6 text-sm text-ink-muted">Načítám…</p>
        ) : holidays.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-6 text-sm text-ink-muted">
            <Palmtree size={18} />
            Žádné prázdniny nejsou nastavené, tréninky běží každý týden.
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {holidays.map((holiday) => (
              <li className="flex items-center gap-3 px-4 py-3" key={holiday.id}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cleanup text-cleanup-ink">
                  <Palmtree size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{holiday.label}</p>
                  <p className="text-sm capitalize text-ink-muted">
                    {formatDateCz(holiday.start)} – {formatDateCz(holiday.end)}
                  </p>
                </div>
                <button
                  aria-label={`Odstranit ${holiday.label}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-busy-ink transition hover:bg-busy"
                  onClick={() => handleDelete(holiday)}
                  type="button"
                >
                  <Trash2 size={15} />
                  <span className="hidden sm:inline">Odstranit</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
