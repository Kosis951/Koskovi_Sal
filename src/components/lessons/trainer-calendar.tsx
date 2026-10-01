"use client";

import { Check, Clock3, Copy, Plus, RefreshCw, Send, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { LoginForm } from "@/components/dashboard/login-form";
import { AppHeader, type HeaderSession } from "@/components/ui/app-header";
import { Sheet } from "@/components/ui/sheet";
import {
  buttonPrimary,
  buttonSecondary,
  chipClass,
  eyebrow,
  noticeTone,
  pageContainer,
} from "@/components/ui/styles";
import { getAdminSession, loginAdmin, logoutAdmin } from "@/lib/admin-auth-client";
import type {
  LessonSlot,
  TrainerCalendar,
  TrainerLesson,
  TrainerWindow,
} from "@/lib/lessons-db";

const weekdays = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"];
const lessonLengths = [30, 45, 60, 90];
const dayFormatter = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "numeric",
  weekday: "long",
});

function formatDay(dateKey: string) {
  return dayFormatter.format(new Date(`${dateKey}T12:00:00`));
}

function formatLesson(lesson: { date: string; end: string; start: string }) {
  return `${formatDay(lesson.date)} · ${lesson.start}–${lesson.end}`;
}

type Notice = { ok: boolean; text: string } | null;

// A trainer's lesson calendar. Signed-in people pick a free slot and send a
// request; the trainer (and the main administrator) confirm or decline,
// offer times and share the invite link. Not visible without signing in.
export function TrainerCalendarPage({
  initialSession,
  trainer,
}: {
  initialSession: HeaderSession;
  trainer: string;
}) {
  const [session, setSession] = useState(initialSession);
  const [calendar, setCalendar] = useState<TrainerCalendar | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [requestSlot, setRequestSlot] = useState<LessonSlot | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const apiBase = `/api/lessons/${encodeURIComponent(trainer)}`;

  const load = useCallback(async () => {
    const response = await fetch(apiBase, { cache: "no-store" });

    if (response.ok) {
      setCalendar((await response.json()) as TrainerCalendar);
    } else if (response.status === 401) {
      setSession(null);
      setCalendar(null);
    } else {
      const data = (await response.json().catch(() => ({}))) as { message?: string };

      setNotice({ ok: false, text: data.message ?? "Kalendář se nepodařilo načíst." });
    }
  }, [apiBase]);

  useEffect(() => {
    if (!session) {
      return undefined;
    }

    const timeout = window.setTimeout(() => void load(), 0);
    // Other people's requests and the trainer's decisions show up by themselves.
    const interval = window.setInterval(() => void load(), 60_000);

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [load, session]);

  async function send(path: string, method: string, body?: unknown) {
    setIsBusy(true);

    try {
      const response = await fetch(`${apiBase}${path}`, {
        body: body ? JSON.stringify(body) : undefined,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        method,
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };

      setNotice({
        ok: response.ok,
        text: data.message ?? (response.ok ? "Uloženo." : "Nepodařilo se to uložit."),
      });
      await load();

      return response.ok;
    } finally {
      setIsBusy(false);
    }
  }

  async function login(username: string, password: string) {
    try {
      await loginAdmin(username, password);
      const next = await getAdminSession();

      setSession(
        next.authenticated && next.username ? { role: next.role ?? null, username: next.username } : null,
      );
    } catch (error) {
      return error instanceof Error ? error.message : "Přihlášení se nepodařilo.";
    }

    return null;
  }

  async function logout() {
    await logoutAdmin();
    setSession(null);
    setCalendar(null);
  }

  return (
    <div className="min-h-screen bg-page text-ink">
      <AppHeader activeTab="lessons" onLogout={logout} session={session} />

      <main className={`${pageContainer} py-5 lg:py-8`}>
        <div className="mx-auto grid max-w-4xl gap-5">
          <div>
            <p className={eyebrow}>Individuální lekce</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">Lekce · {calendar?.trainer ?? trainer}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {calendar?.canManage
                ? "Tady nabízíš časy, schvaluješ žádosti a vidíš potvrzené lekce."
                : "Vyber si volný termín a pošli žádost. Lekce platí, až ji trenér potvrdí."}
            </p>
          </div>

          {notice ? (
            <p className={`rounded-lg border px-3 py-2 text-sm ${notice.ok ? noticeTone.success : noticeTone.error}`}>
              {notice.text}
            </p>
          ) : null}

          {!session ? (
            <Card title="Přihlášení">
              <p className="mb-3 text-sm text-ink-muted">
                Kalendář lekcí vidí jen přihlášení. Nemáš účet? Požádej trenéra o odkaz s pozvánkou.
              </p>
              <LoginForm onLogin={login} />
            </Card>
          ) : !calendar ? (
            <p className="text-sm text-ink-muted">Načítám…</p>
          ) : calendar.canManage ? (
            <>
              <InviteCard isBusy={isBusy} onRegenerate={() => send("/invite", "POST")} token={calendar.inviteToken} />
              <Card count={calendar.requests.length} title="Žádosti ke schválení">
                <LessonList
                  empty="Žádná žádost nečeká."
                  lessons={calendar.requests}
                  renderActions={(lesson) => (
                    <>
                      <button
                        className={`${smallButton} bg-accent text-white hover:bg-accent-hover`}
                        disabled={isBusy}
                        onClick={() => send(`/${lesson.id}`, "PATCH", { action: "confirm" })}
                        type="button"
                      >
                        <Check size={14} />
                        Potvrdit
                      </button>
                      <button
                        className={`${smallButton} border border-line-strong text-ink hover:bg-subtle`}
                        disabled={isBusy}
                        onClick={() => send(`/${lesson.id}`, "PATCH", { action: "decline" })}
                        type="button"
                      >
                        <X size={14} />
                        Odmítnout
                      </button>
                    </>
                  )}
                  showRequester
                />
              </Card>
              <Card count={calendar.lessons.length} title="Potvrzené lekce">
                <LessonList
                  empty="Zatím žádná potvrzená lekce."
                  lessons={calendar.lessons}
                  renderActions={(lesson) => (
                    <CancelButton
                      isBusy={isBusy}
                      onCancel={() => send(`/${lesson.id}`, "PATCH", { action: "cancel" })}
                      question={`Zrušit lekci ${formatLesson(lesson)} (${lesson.requester})?`}
                    />
                  )}
                  showRequester
                />
              </Card>
              <WindowsCard
                isBusy={isBusy}
                onAdd={(input) => send("/windows", "POST", input)}
                onDelete={(id) => send("/windows", "DELETE", { id })}
                windows={calendar.windows}
              />
              <SlotsCard slots={calendar.slots} title="Nabízené termíny" />
            </>
          ) : (
            <>
              <Card count={calendar.mine.length} title="Moje lekce a žádosti">
                <LessonList
                  empty="Zatím nemáš žádnou žádost. Vyber si termín níže."
                  lessons={calendar.mine}
                  renderActions={(lesson) =>
                    lesson.status === "declined" ? null : (
                      <CancelButton
                        isBusy={isBusy}
                        onCancel={() => send(`/${lesson.id}`, "PATCH", { action: "cancel" })}
                        question={`Zrušit ${lesson.status === "pending" ? "žádost" : "lekci"} ${formatLesson(lesson)}?`}
                      />
                    )
                  }
                  showStatus
                />
              </Card>
              <SlotsCard onRequest={setRequestSlot} slots={calendar.slots} title="Volné termíny" />
            </>
          )}
        </div>
      </main>

      <Sheet onClose={() => setRequestSlot(null)} open={requestSlot !== null} title="Žádost o lekci">
        {requestSlot ? (
          <RequestForm
            onSubmit={async (note) => {
              if (await send("", "POST", { ...requestSlot, note })) {
                setRequestSlot(null);
              }
            }}
            slot={requestSlot}
            trainer={calendar?.trainer ?? trainer}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

const smallButton =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";

function Card({ children, count, title }: { children: ReactNode; count?: number; title: string }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-lg font-black">
        {title}
        {count ? (
          <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">{count}</span>
        ) : null}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const statusBadge: Record<TrainerLesson["status"], { className: string; label: string }> = {
  cancelled: { className: "bg-subtle text-ink-muted", label: "Zrušeno" },
  confirmed: { className: "bg-free text-free-ink", label: "Potvrzeno" },
  declined: { className: "bg-busy text-busy-ink", label: "Odmítnuto" },
  pending: { className: "bg-cleanup text-cleanup-ink", label: "Čeká na potvrzení" },
};

function LessonList({
  empty,
  lessons,
  renderActions,
  showRequester = false,
  showStatus = false,
}: {
  empty: string;
  lessons: TrainerLesson[];
  renderActions: (lesson: TrainerLesson) => ReactNode;
  showRequester?: boolean;
  showStatus?: boolean;
}) {
  if (lessons.length === 0) {
    return <p className="text-sm text-ink-muted">{empty}</p>;
  }

  return (
    <ul className="divide-y divide-line">
      {lessons.map((lesson) => (
        <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5" key={lesson.id}>
          <div className="min-w-0 flex-1 basis-48">
            <p className="font-semibold capitalize text-ink">{formatLesson(lesson)}</p>
            <p className="text-sm text-ink-muted">
              {[showRequester ? lesson.requester : null, lesson.note].filter(Boolean).join(" · ")}
            </p>
          </div>
          {showStatus ? (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadge[lesson.status].className}`}>
              {statusBadge[lesson.status].label}
            </span>
          ) : null}
          <div className="flex gap-2">{renderActions(lesson)}</div>
        </li>
      ))}
    </ul>
  );
}

function CancelButton({
  isBusy,
  onCancel,
  question,
}: {
  isBusy: boolean;
  onCancel: () => void;
  question: string;
}) {
  return (
    <button
      className={`${smallButton} border border-busy-line bg-busy text-busy-ink hover:brightness-95`}
      disabled={isBusy}
      onClick={() => {
        if (window.confirm(question)) {
          onCancel();
        }
      }}
      type="button"
    >
      <Trash2 size={13} />
      Zrušit
    </button>
  );
}

const slotStyle: Record<LessonSlot["state"], { className: string; label: string }> = {
  confirmed: { className: "border-training-line bg-training text-training-ink", label: "" },
  free: { className: "border-accent bg-surface text-ink", label: "Volno" },
  "mine-confirmed": { className: "border-free-line bg-free text-free-ink", label: "Moje lekce" },
  "mine-pending": { className: "border-cleanup-line bg-cleanup text-cleanup-ink", label: "Čeká na potvrzení" },
  pending: { className: "border-cleanup-line bg-cleanup text-cleanup-ink", label: "" },
  taken: { className: "border-line bg-subtle text-ink-soft", label: "Obsazeno" },
};

// Slots grouped by day. With `onRequest`, free slots are buttons.
function SlotsCard({
  onRequest,
  slots,
  title,
}: {
  onRequest?: (slot: LessonSlot) => void;
  slots: LessonSlot[];
  title: string;
}) {
  const days = new Map<string, LessonSlot[]>();

  for (const slot of slots) {
    days.set(slot.date, [...(days.get(slot.date) ?? []), slot]);
  }

  return (
    <Card title={title}>
      {slots.length === 0 ? (
        <p className="text-sm text-ink-muted">
          {onRequest
            ? "Trenér teď nenabízí žádné termíny. Zkus to později."
            : "Zatím nic nenabízíš. Přidej čas v části „Kdy mohu učit“."}
        </p>
      ) : (
        <div className="grid gap-4">
          {[...days].map(([date, daySlots]) => (
            <div key={date}>
              <h3 className="text-sm font-semibold capitalize text-ink-muted">{formatDay(date)}</h3>
              <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {daySlots.map((slot) => {
                  const style = slotStyle[slot.state];
                  const content = (
                    <>
                      <span className="block text-sm font-semibold tabular-nums">
                        {slot.start}–{slot.end}
                      </span>
                      <span className="block truncate text-xs">
                        {slot.requester
                          ? `${slot.requester}${slot.state === "pending" ? " · čeká" : ""}`
                          : style.label}
                      </span>
                    </>
                  );
                  const className = `rounded-lg border px-3 py-2 text-left ${style.className}`;

                  return slot.state === "free" && onRequest ? (
                    <button
                      className={`${className} transition hover:bg-brand-soft`}
                      key={slot.start}
                      onClick={() => onRequest(slot)}
                      type="button"
                    >
                      {content}
                    </button>
                  ) : (
                    <div className={className} key={slot.start}>
                      {content}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function RequestForm({
  onSubmit,
  slot,
  trainer,
}: {
  onSubmit: (note: string) => Promise<void>;
  slot: LessonSlot;
  trainer: string;
}) {
  const [note, setNote] = useState("");
  const [isSending, setIsSending] = useState(false);

  return (
    <form
      className="grid gap-3"
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSending(true);

        try {
          await onSubmit(note.trim());
        } finally {
          setIsSending(false);
        }
      }}
    >
      <div className="rounded-lg border border-line bg-subtle p-3">
        <p className="font-semibold capitalize text-ink">{formatDay(slot.date)}</p>
        <p className="flex items-center gap-1.5 text-sm text-ink-muted">
          <Clock3 size={14} />
          {slot.start}–{slot.end} · trenér {trainer}
        </p>
      </div>
      <label className="field-label">
        Poznámka pro trenéra (nepovinné)
        <textarea
          className="field-input mt-1"
          maxLength={300}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Na čem chceš pracovat, s kým přijdeš…"
          rows={3}
          value={note}
        />
      </label>
      <p className="text-xs text-ink-soft">
        Termín se ti podrží. Lekce platí, až ji trenér potvrdí – uvidíš to tady v části Moje lekce.
      </p>
      <button className={`${buttonPrimary} h-11`} disabled={isSending} type="submit">
        <Send size={16} />
        {isSending ? "Odesílám…" : "Poslat žádost"}
      </button>
    </form>
  );
}

function InviteCard({
  isBusy,
  onRegenerate,
  token,
}: {
  isBusy: boolean;
  onRegenerate: () => void;
  token?: string;
}) {
  const [isCopied, setIsCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const link = token ? `${origin}/pozvanka/${token}` : "";

  useEffect(() => {
    const timeout = window.setTimeout(() => setOrigin(window.location.origin), 0);

    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <Card title="Odkaz s pozvánkou">
      <p className="text-sm text-ink-muted">
        Pošli tento odkaz lidem, kteří k tobě mají chodit. Kdo ho otevře, založí si účet (nebo se
        přihlásí) a uvidí tvůj kalendář. Bez odkazu se nikdo zaregistrovat nemůže.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          aria-label="Odkaz s pozvánkou"
          className="field-input min-h-10 min-w-0 flex-1 basis-56 text-sm"
          onFocus={(event) => event.target.select()}
          readOnly
          value={link}
        />
        <button
          className={buttonSecondary}
          disabled={!link}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setIsCopied(true);
              window.setTimeout(() => setIsCopied(false), 2000);
            } catch {
              // Clipboard blocked: the field above can be copied by hand.
            }
          }}
          type="button"
        >
          {isCopied ? <Check size={16} /> : <Copy size={16} />}
          {isCopied ? "Zkopírováno" : "Kopírovat"}
        </button>
      </div>
      <button
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-accent underline-offset-2 hover:underline disabled:opacity-60"
        disabled={isBusy}
        onClick={() => {
          if (window.confirm("Vytvořit nový odkaz? Ten starý přestane fungovat. Už založené účty zůstanou.")) {
            onRegenerate();
          }
        }}
        type="button"
      >
        <RefreshCw size={13} />
        Vytvořit nový odkaz (starý přestane platit)
      </button>
    </Card>
  );
}

function describeWindow(offer: TrainerWindow) {
  const lessons = Math.floor((toMinutes(offer.end) - toMinutes(offer.start)) / offer.lessonMinutes);
  const when = offer.date ? formatDay(offer.date) : `Každý týden · ${weekdays[(offer.weekday ?? 1) - 1]}`;
  const period = [
    offer.validFrom ? `od ${formatShort(offer.validFrom)}` : "",
    offer.validUntil ? `do ${formatShort(offer.validUntil)}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    detail: `${lessons}× lekce po ${offer.lessonMinutes} min${period ? ` · ${period}` : ""}`,
    title: `${when} ${offer.start}–${offer.end}`,
  };
}

function formatShort(dateKey: string) {
  const [, month, day] = dateKey.split("-").map(Number);

  return `${day}. ${month}.`;
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}

function WindowsCard({
  isBusy,
  onAdd,
  onDelete,
  windows,
}: {
  isBusy: boolean;
  onAdd: (input: Record<string, unknown>) => Promise<boolean>;
  onDelete: (id: string) => void;
  windows: TrainerWindow[];
}) {
  const [kind, setKind] = useState<"once" | "weekly">("weekly");
  const [weekday, setWeekday] = useState(1);
  const [date, setDate] = useState("");
  const [start, setStart] = useState("14:00");
  const [end, setEnd] = useState("16:00");
  const [lessonMinutes, setLessonMinutes] = useState(45);
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const lessons = start < end ? Math.floor((toMinutes(end) - toMinutes(start)) / lessonMinutes) : 0;
  const error =
    start >= end
      ? "Konec musí být později než začátek."
      : lessons < 1
        ? "Do tohoto času se nevejde ani jedna lekce."
        : kind === "once" && !date
          ? "Vyber datum."
          : validFrom && validUntil && validUntil < validFrom
            ? "Konec období musí být po jeho začátku."
            : "";

  return (
    <Card title="Kdy mohu učit">
      {windows.length === 0 ? (
        <p className="text-sm text-ink-muted">Zatím nic nenabízíš. Přidej první čas níže.</p>
      ) : (
        <ul className="divide-y divide-line">
          {windows.map((offer) => {
            const text = describeWindow(offer);

            return (
              <li className="flex items-center justify-between gap-3 py-2.5" key={offer.id}>
                <div className="min-w-0">
                  <p className="font-semibold text-ink first-letter:uppercase">{text.title}</p>
                  <p className="text-sm text-ink-muted">{text.detail}</p>
                </div>
                <button
                  aria-label={`Smazat nabídku ${text.title}`}
                  className={`${smallButton} shrink-0 border border-line-strong text-ink-muted hover:bg-subtle hover:text-ink`}
                  disabled={isBusy}
                  onClick={() => {
                    if (window.confirm("Smazat tuto nabídku? Už požádané a potvrzené lekce zůstanou.")) {
                      onDelete(offer.id);
                    }
                  }}
                  type="button"
                >
                  <Trash2 size={13} />
                  Smazat
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form
        className="mt-4 grid gap-3 rounded-lg border border-line p-3"
        onSubmit={async (event) => {
          event.preventDefault();

          if (
            await onAdd(
              kind === "once"
                ? { date, end, lessonMinutes, start }
                : { end, lessonMinutes, start, validFrom, validUntil, weekday },
            )
          ) {
            setDate("");
          }
        }}
      >
        <p className="field-label">Přidat čas</p>
        <div className="flex flex-wrap gap-1.5">
          <button aria-pressed={kind === "weekly"} className={chipClass(kind === "weekly")} onClick={() => setKind("weekly")} type="button">
            Každý týden
          </button>
          <button aria-pressed={kind === "once"} className={chipClass(kind === "once")} onClick={() => setKind("once")} type="button">
            Jeden den
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {kind === "weekly" ? (
            <label className="field-label col-span-2 sm:col-span-1">
              Den
              <select className="field-input mt-1 min-h-10" onChange={(event) => setWeekday(Number(event.target.value))} value={weekday}>
                {weekdays.map((label, index) => (
                  <option key={label} value={index + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="field-label col-span-2 sm:col-span-1">
              Datum
              <input className="field-input mt-1 min-h-10" onChange={(event) => setDate(event.target.value)} type="date" value={date} />
            </label>
          )}
          <label className="field-label">
            Od
            <input className="field-input mt-1 min-h-10" onChange={(event) => setStart(event.target.value)} required type="time" value={start} />
          </label>
          <label className="field-label">
            Do
            <input className="field-input mt-1 min-h-10" onChange={(event) => setEnd(event.target.value)} required type="time" value={end} />
          </label>
          <label className="field-label col-span-2 sm:col-span-1">
            Délka lekce
            <select className="field-input mt-1 min-h-10" onChange={(event) => setLessonMinutes(Number(event.target.value))} value={lessonMinutes}>
              {lessonLengths.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minut
                </option>
              ))}
            </select>
          </label>
        </div>
        {kind === "weekly" ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="field-label">
              Platí od (nepovinné)
              <input className="field-input mt-1 min-h-10" onChange={(event) => setValidFrom(event.target.value)} type="date" value={validFrom} />
            </label>
            <label className="field-label">
              Platí do (nepovinné)
              <input className="field-input mt-1 min-h-10" min={validFrom || undefined} onChange={(event) => setValidUntil(event.target.value)} type="date" value={validUntil} />
            </label>
          </div>
        ) : null}
        <p className={`text-xs ${error ? "font-semibold text-busy-ink" : "text-ink-soft"}`}>
          {error || `Vznikne ${lessons}× lekce po ${lessonMinutes} minutách. Termíny se nabízejí na 6 týdnů dopředu.`}
        </p>
        <button className={buttonSecondary} disabled={isBusy || Boolean(error)} type="submit">
          <Plus size={16} />
          Přidat
        </button>
      </form>
    </Card>
  );
}
