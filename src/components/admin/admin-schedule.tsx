"use client";

import { ExternalLink, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ScheduleRequests, ScheduleWhatsApp } from "@/components/admin/admin-schedule-messages";
import { ScheduleView } from "@/components/schedule/schedule-view";
import { scheduleChangeEvent } from "@/components/ui/app-header";
import { buttonPrimary, buttonSecondary, noticeTone } from "@/components/ui/styles";
import {
  getScheduleBlocks,
  maxScheduleBodyLength,
  maxScheduleTitleLength,
  parseSchedule,
} from "@/lib/public-schedule";

const placeholder = `5.11.
10:00–10:45 – Bílý
10:45–11:30 – Anelt
13:00–13:45 – Oběd
18:00–19:00 – GROUP

6.11.
9:15–10:00 – Štecha`;

const blockDay = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", weekday: "short" });

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
}

// Správa → Rozpis: the visiting trainer's schedule as text, with a live
// preview of the public page.
export function AdminSchedule() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [published, setPublished] = useState(false);
  const [cancelTrainings, setCancelTrainings] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: "error" | "success" | "warning" } | null>(null);
  const days = useMemo(() => parseSchedule(body, todayKey()), [body]);
  const unreadable = days.flatMap((day) => day.rows.filter((row) => row.kind === "note"));
  const blocks = getScheduleBlocks(days).filter((block) => block.date >= todayKey());

  useEffect(() => {
    let isCancelled = false;

    void fetch("/api/rozpis", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { body?: string; cancelTrainings?: boolean; published?: boolean; title?: string }) => {
        if (!isCancelled) {
          setTitle(data.title ?? "");
          setBody(data.body ?? "");
          setPublished(data.published === true);
          setCancelTrainings(data.cancelTrainings === true);
          setIsLoaded(true);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setNotice({ text: "Rozpis se nepodařilo načíst.", tone: "error" });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setNotice(null);

    try {
      const response = await fetch("/api/rozpis", {
        body: JSON.stringify({ body, cancelTrainings, published, title }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string; skipped?: number };

      setNotice({
        text: data.message ?? (response.ok ? "Uloženo." : "Uložení se nepodařilo."),
        tone: !response.ok ? "error" : data.skipped ? "warning" : "success",
      });

      if (response.ok) {
        window.dispatchEvent(new Event(scheduleChangeEvent));
      }
    } finally {
      setIsSaving(false);
    }
  }

  if (!isLoaded && !notice) {
    return <p className="text-sm text-ink-muted">Načítám…</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-5">
    <ScheduleRequests />
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <form className="grid gap-4 rounded-xl border border-line bg-surface p-4 sm:p-5" onSubmit={save}>
        <label className="field-label">
          Nadpis
          <input
            className="field-input mt-1"
            maxLength={maxScheduleTitleLength}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Externí trenér"
            value={title}
          />
          <span className="mt-1 block text-xs font-normal text-ink-soft">
            Třeba jméno trenéra: „Lekce – Marek Novák“.
          </span>
        </label>
        <label className="field-label">
          Rozpis
          <textarea
            className="field-input mt-1 font-mono text-sm leading-relaxed"
            maxLength={maxScheduleBodyLength}
            onChange={(event) => setBody(event.target.value)}
            placeholder={placeholder}
            rows={16}
            spellCheck={false}
            value={body}
          />
          <span className="mt-1 block text-xs font-normal text-ink-soft">
            Den začíná datem (5.11.), pod ním řádky „10:00–10:45 – jméno“. Oběd a coffee break se
            zašedí, GROUP zvýrazní. Rozpis jde vložit rovnou z e-mailu nebo WhatsAppu.
          </span>
        </label>
        {unreadable.length > 0 ? (
          <p className={`rounded-lg border px-3 py-2 text-xs ${noticeTone.warning}`}>
            Tyhle řádky nemají čas od–do, ukážou se jako poznámka:{" "}
            {unreadable.map((row) => `„${row.text}“`).join(", ")}
          </p>
        ) : null}
        <label className="flex items-start gap-3 rounded-lg border border-line bg-subtle p-3 text-sm font-semibold text-ink">
          <input
            checked={published}
            className="mt-0.5 h-4 w-4 accent-[var(--k-brand)]"
            onChange={(event) => setPublished(event.target.checked)}
            type="checkbox"
          />
          <span>
            Zveřejnit
            <span className="mt-0.5 block text-xs font-normal text-ink-muted">
              Rozpis uvidí všichni i bez přihlášení a v hlavičce se objeví „Externí trenér“.
            </span>
          </span>
        </label>
        <div className="grid gap-2 rounded-lg border border-line p-3 text-sm">
          <p className="font-semibold text-ink">Kalendář sálu</p>
          <p className="text-xs text-ink-muted">
            {blocks.length === 0
              ? "Až bude rozpis zveřejněný, každý den se v kalendáři sálu ukáže jako obsazený od první do poslední lekce."
              : `${published ? "V kalendáři sálu" : "Po zveřejnění v kalendáři sálu"}: ${blocks
                  .map((block) => `${blockDay.format(new Date(`${block.date}T12:00:00`))} ${block.start}–${block.end}`)
                  .join(" · ")}`}
          </p>
          <label className="mt-1 flex items-start gap-3 font-semibold text-ink">
            <input
              checked={cancelTrainings}
              className="mt-0.5 h-4 w-4 accent-[var(--k-brand)]"
              onChange={(event) => setCancelTrainings(event.target.checked)}
              type="checkbox"
            />
            <span>
              Zrušit pravidelné tréninky v té době
              <span className="mt-0.5 block text-xs font-normal text-ink-muted">
                {cancelTrainings
                  ? "Tréninky, které spadnou do času trenéra, ten den odpadnou (jako u „Obsazeno“)."
                  : "Tréninky ve stejném čase poběží dál a v kalendáři budou vedle bloku trenéra."}
              </span>
            </span>
          </label>
        </div>
        {notice ? (
          <p className={`rounded-lg border px-3 py-2 text-sm font-semibold ${noticeTone[notice.tone]}`}>
            {notice.text}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button className={buttonPrimary} disabled={isSaving || (published && !body.trim())} type="submit">
            <Save size={16} />
            {isSaving ? "Ukládám…" : "Uložit"}
          </button>
          <Link className={buttonSecondary} href="/rozpis">
            <ExternalLink size={15} />
            Veřejná stránka
          </Link>
        </div>
      </form>

      <section className="grid min-w-0 gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink-muted">Náhled</h2>
        {days.length > 0 ? (
          <div className="grid gap-2">
            <p className="text-xl font-black text-ink">{title.trim() || "Externí trenér"}</p>
            <ScheduleView days={days} />
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-muted">
            Vlož rozpis vlevo a tady uvidíš, jak bude vypadat.
          </p>
        )}
      </section>
    </div>
    <ScheduleWhatsApp days={days} published={published} title={title} />
    </div>
  );
}
