"use client";

import { Check, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";
import { noticeTone } from "@/components/ui/styles";
import { nameKey, type ScheduleDay } from "@/lib/public-schedule";
import type { ScheduleRequest } from "@/lib/schedule-requests-db";
import { formatPhone, normalizePhone } from "@/lib/whatsapp";

const shortDay = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", weekday: "short" });

function formatShortDay(dateKey: string) {
  return shortDay.format(new Date(`${dateKey}T12:00:00`));
}

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
}

// Requests from the public schedule to cancel or move a lesson. The manager
// answers (WhatsApp), changes the schedule and marks the request done.
export function ScheduleRequests() {
  const [requests, setRequests] = useState<ScheduleRequest[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/rozpis/zadosti", { cache: "no-store" });

    if (response.ok) {
      setRequests(((await response.json()) as { requests: ScheduleRequest[] }).requests);
    } else {
      setError("Žádosti se nepodařilo načíst.");
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);

    return () => window.clearTimeout(timeout);
  }, [load]);

  async function setStatus(id: string, status: "done" | "pending") {
    setBusyId(id);

    try {
      await fetch(`/api/rozpis/zadosti/${id}`, {
        body: JSON.stringify({ status }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await load();
    } finally {
      setBusyId("");
    }
  }

  const pending = requests?.filter((request) => request.status === "pending") ?? [];
  const done = requests?.filter((request) => request.status === "done").slice(0, 5) ?? [];

  return (
    <section className="grid gap-3 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-lg font-black">
        Žádosti o zrušení a přesun
        {pending.length > 0 ? (
          <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">{pending.length}</span>
        ) : null}
      </h2>
      {error ? <p className={`rounded-lg border px-3 py-2 text-sm ${noticeTone.error}`}>{error}</p> : null}
      {requests === null ? (
        <p className="text-sm text-ink-muted">Načítám…</p>
      ) : pending.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Žádná žádost nečeká. Lidé ji pošlou křížkem u své lekce na stránce Externí trenér.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {pending.map((request) => {
            const lesson = `${formatShortDay(request.date)} ${request.start}–${request.end}`;

            return (
              <li className="flex flex-wrap items-start gap-x-3 gap-y-2 py-3" key={request.id}>
                <div className="min-w-0 flex-1 basis-64">
                  <p className="font-semibold text-ink">
                    {request.kind === "cancel" ? "Zrušit" : "Přesunout"}: {lesson} · {request.lessonName}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {[
                      `žádá ${request.requesterName}`,
                      request.phone ? formatPhone(request.phone) : null,
                      request.preferred ? `hodilo by se: ${request.preferred}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {request.note ? <p className="mt-1 text-sm text-ink">„{request.note}“</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <WhatsAppButton
                    label="Odpovědět"
                    phone={request.phone}
                    text={`Ahoj, k tvé žádosti o ${request.kind === "cancel" ? "zrušení" : "přesun"} lekce ${lesson}: `}
                  />
                  <button
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong px-3 text-xs font-semibold text-ink transition hover:border-accent hover:bg-subtle disabled:opacity-60"
                    disabled={busyId === request.id}
                    onClick={() => void setStatus(request.id, "done")}
                    type="button"
                  >
                    <Check size={14} />
                    Vyřízeno
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {done.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-muted">Naposledy vyřízené ({done.length})</summary>
          <ul className="mt-2 grid gap-1.5">
            {done.map((request) => (
              <li className="flex items-center justify-between gap-3 text-ink-muted" key={request.id}>
                <span className="min-w-0 truncate">
                  {request.kind === "cancel" ? "Zrušit" : "Přesunout"}: {formatShortDay(request.date)} {request.start} ·{" "}
                  {request.lessonName}
                </span>
                <button
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-accent hover:underline disabled:opacity-60"
                  disabled={busyId === request.id}
                  onClick={() => void setStatus(request.id, "pending")}
                  type="button"
                >
                  <RotateCcw size={12} />
                  Vrátit
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

type Person = { key: string; lines: string[]; name: string };

// Everyone in the schedule (lessons from today on) with their lessons, and a
// prepared WhatsApp message for each. Numbers are remembered by name.
export function ScheduleWhatsApp({
  days,
  published,
  title,
}: {
  days: ScheduleDay[];
  published: boolean;
  title: string;
}) {
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const [origin, setOrigin] = useState("");
  const people = useMemo(() => collectPeople(days), [days]);

  useEffect(() => {
    let isCancelled = false;
    const timeout = window.setTimeout(() => setOrigin(window.location.origin), 0);

    void fetch("/api/rozpis/telefony", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { phones: [] }))
      .then((data: { phones: Array<{ name: string; phone: string }> }) => {
        if (!isCancelled) {
          setPhones(Object.fromEntries(data.phones.map((item) => [nameKey(item.name), item.phone])));
        }
      })
      .catch(() => undefined);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeout);
    };
  }, []);

  async function savePhone(person: Person) {
    const draft = drafts[person.key];

    if (draft === undefined) {
      return;
    }

    const normalized = normalizePhone(draft);

    if (normalized === null) {
      setErrors((current) => ({ ...current, [person.key]: "Tohle není telefonní číslo." }));
      return;
    }

    const response = await fetch("/api/rozpis/telefony", {
      body: JSON.stringify({ name: person.name, phone: draft }),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    });

    if (!response.ok) {
      setErrors((current) => ({ ...current, [person.key]: "Číslo se nepodařilo uložit." }));
      return;
    }

    setPhones((current) => ({ ...current, [person.key]: normalized }));
    setDrafts((current) => {
      const next = { ...current };

      delete next[person.key];

      return next;
    });
    setErrors((current) => ({ ...current, [person.key]: "" }));
  }

  function message(person: Person) {
    return [
      `Ahoj, posílám tvoje lekce – ${title.trim() || "Externí trenér"}:`,
      ...person.lines,
      published && origin ? `\nCelý rozpis: ${origin}/rozpis` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return (
    <section className="grid gap-3 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-black">Rozeslat přes WhatsApp</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Tlačítko otevře WhatsApp s připravenou zprávou, odešleš ji ty. Číslo se ke jménu zapamatuje;
          bez čísla vybereš kontakt ve WhatsAppu.
        </p>
      </div>
      {people.length === 0 ? (
        <p className="text-sm text-ink-muted">V rozpisu zatím nejsou žádné nadcházející lekce.</p>
      ) : (
        <ul className="divide-y divide-line">
          {people.map((person) => {
            const phone = phones[person.key];
            const value = drafts[person.key] ?? (phone ? formatPhone(phone) : "");

            return (
              <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3" key={person.key}>
                <div className="min-w-0 flex-1 basis-52">
                  <p className="flex items-center gap-2 font-semibold text-ink">
                    {person.name}
                    {opened.has(person.key) ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-free-ink">
                        <Check size={12} />
                        otevřeno
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-ink-muted">{person.lines.join(" · ")}</p>
                </div>
                <label className="grid w-40 gap-0.5">
                  <span className="sr-only">Telefon pro {person.name}</span>
                  <input
                    className="field-input min-h-9 py-1.5 text-sm"
                    inputMode="tel"
                    maxLength={30}
                    onBlur={() => void savePhone(person)}
                    onChange={(event) => setDrafts((current) => ({ ...current, [person.key]: event.target.value }))}
                    placeholder="Telefon"
                    type="tel"
                    value={value}
                  />
                  {errors[person.key] ? (
                    <span className="text-[11px] font-semibold text-busy-ink">{errors[person.key]}</span>
                  ) : null}
                </label>
                <WhatsAppButton
                  onOpen={() => setOpened((current) => new Set(current).add(person.key))}
                  phone={phone}
                  text={message(person)}
                />
              </li>
            );
          })}
        </ul>
      )}
      {!published ? (
        <p className={`rounded-lg border px-3 py-2 text-xs ${noticeTone.warning}`}>
          Rozpis zatím není zveřejněný, zpráva proto nebude obsahovat odkaz na celý rozpis.
        </p>
      ) : null}
      <p className="text-xs text-ink-soft">Čísla vidí jen správa sálu. Smažeš je vymazáním pole.</p>
    </section>
  );
}

// People with lessons from today on, in the order they first appear; their
// lessons grouped by day ("čt 5. 11.: 10:00–10:45, 10:45–11:30").
function collectPeople(days: ScheduleDay[]): Person[] {
  const today = todayKey();
  const people = new Map<string, { name: string; days: Map<string, string[]> }>();

  for (const day of days) {
    if (day.dateKey && day.dateKey < today) {
      continue;
    }

    for (const row of day.rows) {
      if (row.kind !== "lesson" || !row.text || !row.start || !row.end) {
        continue;
      }

      const key = nameKey(row.text);
      const person = people.get(key) ?? { days: new Map<string, string[]>(), name: row.text };
      const dayLabel = day.dateKey ? formatShortDay(day.dateKey) : "";

      person.days.set(dayLabel, [...(person.days.get(dayLabel) ?? []), `${row.start}–${row.end}`]);
      people.set(key, person);
    }
  }

  return [...people].map(([key, person]) => ({
    key,
    lines: [...person.days].map(([dayLabel, times]) => (dayLabel ? `${dayLabel}: ${times.join(", ")}` : times.join(", "))),
    name: person.name,
  }));
}
