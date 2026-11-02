"use client";

import { CalendarX2, Clock3, Pencil, Send } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ScheduleView, type ScheduleLesson } from "@/components/schedule/schedule-view";
import { AppHeader, type HeaderSession } from "@/components/ui/app-header";
import { Sheet } from "@/components/ui/sheet";
import { buttonPrimary, chipClass, eyebrow, noticeTone, pageContainer } from "@/components/ui/styles";
import { logoutAdmin } from "@/lib/admin-auth-client";
import { lessonKey, type ScheduleDay } from "@/lib/public-schedule";

const lessonDay = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", weekday: "long" });

// /rozpis: a visiting trainer's lessons for everyone, without signing in.
export function PublicSchedulePage({
  canEdit,
  days,
  initialSession,
  isDraft,
  pendingKeys: initialPendingKeys,
  title,
}: {
  canEdit: boolean;
  days: ScheduleDay[];
  initialSession: HeaderSession;
  // A hall manager looking at a schedule that is not published yet.
  isDraft: boolean;
  // Lessons someone already asked to cancel or move (lessonKey).
  pendingKeys: string[];
  title: string;
}) {
  const [session, setSession] = useState(initialSession);
  const [pendingKeys, setPendingKeys] = useState(() => new Set(initialPendingKeys));
  // The lesson the request form is open for.
  const [requestLesson, setRequestLesson] = useState<ScheduleLesson | null>(null);
  const [notice, setNotice] = useState("");

  async function logout() {
    await logoutAdmin();
    setSession(null);
  }

  return (
    <div className="min-h-screen bg-page text-ink">
      <AppHeader activeTab="schedule" onLogout={logout} session={session} />

      <main className={`${pageContainer} py-5 lg:py-8`}>
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <p className={eyebrow}>Rozpis lekcí</p>
                <span aria-hidden="true" className="brand-stripes w-20" />
              </div>
              <h1 className="mt-1 text-2xl font-black sm:text-3xl">{title}</h1>
            </div>
            {canEdit && session ? (
              <Link
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-sm font-semibold text-ink transition hover:border-accent hover:bg-subtle"
                href="/admin/rozpis"
              >
                <Pencil size={14} />
                Upravit
              </Link>
            ) : null}
          </div>

          {isDraft ? (
            <p className={`rounded-lg border px-3 py-2 text-sm font-semibold ${noticeTone.warning}`}>
              Náhled: rozpis zatím není zveřejněný, ostatní ho nevidí.
            </p>
          ) : null}

          {days.length > 0 ? (
            <>
              {notice ? (
                <p className={`rounded-lg border px-3 py-2 text-sm font-semibold ${noticeTone.success}`} role="status">
                  {notice}
                </p>
              ) : null}
              <ScheduleView
                days={days}
                onRequest={isDraft ? undefined : setRequestLesson}
                pendingKeys={pendingKeys}
              />
              {isDraft ? null : (
                <p className="text-xs text-ink-soft">
                  Nemůžeš na lekci? Klikni na křížek u svého řádku a pošli žádost o zrušení nebo přesun.
                </p>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-line bg-surface px-5 py-10 text-center">
              <CalendarX2 className="mx-auto text-ink-soft" size={28} />
              <p className="mt-3 font-semibold text-ink">Teď tu žádný rozpis není.</p>
              <p className="mt-1 text-sm text-ink-muted">Až přijede externí trenér, objeví se tady jeho lekce.</p>
            </div>
          )}
        </div>
      </main>

      <Sheet onClose={() => setRequestLesson(null)} open={requestLesson !== null} title="Zrušit nebo přesunout lekci">
        {requestLesson ? (
          <RequestForm
            key={lessonKey(requestLesson)}
            lesson={requestLesson}
            onSent={(message) => {
              setPendingKeys((current) => new Set(current).add(lessonKey(requestLesson)));
              setRequestLesson(null);
              setNotice(message);
            }}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

// Asks the hall managers to cancel a lesson or move it; nothing in the
// schedule changes until they do.
function RequestForm({ lesson, onSent }: { lesson: ScheduleLesson; onSent: (message: string) => void }) {
  const [kind, setKind] = useState<"cancel" | "move">("cancel");
  const [preferred, setPreferred] = useState("");
  const [requesterName, setRequesterName] = useState(lesson.lessonName);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSending(true);

    try {
      const response = await fetch("/api/rozpis/zadosti", {
        body: JSON.stringify({
          date: lesson.date,
          kind,
          lessonName: lesson.lessonName,
          note,
          phone,
          preferred,
          requesterName,
          start: lesson.start,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };

      // 409: somebody already asked about this lesson.
      if (response.ok || response.status === 409) {
        onSent(data.message ?? "Žádost je odeslaná.");
      } else {
        setError(data.message ?? "Žádost se nepodařilo odeslat.");
      }
    } finally {
      setIsSending(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={handleSubmit}>
      <div className="rounded-lg border border-line bg-subtle p-3">
        <p className="font-semibold text-ink first-letter:uppercase">
          {lessonDay.format(new Date(`${lesson.date}T12:00:00`))}
        </p>
        <p className="flex items-center gap-1.5 text-sm text-ink-muted">
          <Clock3 size={14} />
          {lesson.start}–{lesson.end} · {lesson.lessonName}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button aria-pressed={kind === "cancel"} className={chipClass(kind === "cancel")} onClick={() => setKind("cancel")} type="button">
          Zrušit lekci
        </button>
        <button aria-pressed={kind === "move"} className={chipClass(kind === "move")} onClick={() => setKind("move")} type="button">
          Přesunout na jiný čas
        </button>
      </div>
      {kind === "move" ? (
        <label className="field-label">
          Kdy by se ti hodilo
          <input
            className="field-input mt-1"
            maxLength={120}
            onChange={(event) => setPreferred(event.target.value)}
            placeholder="např. pátek po 14:00"
            value={preferred}
          />
        </label>
      ) : null}
      <label className="field-label">
        Tvoje jméno
        <input
          autoComplete="name"
          className="field-input mt-1"
          maxLength={60}
          onChange={(event) => setRequesterName(event.target.value)}
          required
          value={requesterName}
        />
      </label>
      <label className="field-label">
        Telefon (nepovinné)
        <input
          autoComplete="tel"
          className="field-input mt-1"
          inputMode="tel"
          maxLength={30}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="777 123 456"
          type="tel"
          value={phone}
        />
        <span className="mt-1 block text-xs font-normal text-ink-soft">Ať ti můžeme odpovědět na WhatsApp.</span>
      </label>
      <label className="field-label">
        Poznámka (nepovinné)
        <textarea
          className="field-input mt-1"
          maxLength={300}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          value={note}
        />
      </label>
      {error ? (
        <p className={`rounded-lg border px-3 py-2 text-sm font-semibold ${noticeTone.error}`}>{error}</p>
      ) : null}
      <p className="text-xs text-ink-soft">
        Lekce platí, dokud ti ji nezrušíme nebo nepřesuneme. Žádost uvidí jen správci sálu.
      </p>
      <button className={`${buttonPrimary} h-11`} disabled={isSending || !requesterName.trim()} type="submit">
        <Send size={16} />
        {isSending ? "Odesílám…" : "Potvrdit a odeslat"}
      </button>
    </form>
  );
}
