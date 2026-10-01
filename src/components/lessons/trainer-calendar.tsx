"use client";

import { ArrowLeftRight, Check, Clock3, Copy, Plus, RefreshCw, Send, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { LoginForm } from "@/components/dashboard/login-form";
import { LessonsWeekGrid, type GridBlock } from "@/components/lessons/lessons-week-grid";
import { useRefreshHandler } from "@/components/pwa/pull-to-refresh";
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
import { lessonsTrainerCookie } from "@/lib/lessons-shared";
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
type TrainerOption = { name: string; trainer: string };
type SlotTime = { date: string; end: string; start: string };

function rememberTrainer(trainer: string) {
  document.cookie = `${lessonsTrainerCookie}=${encodeURIComponent(trainer)}; path=/; max-age=31536000; samesite=lax`;
}

// Switch between the trainers' lesson calendars (shown when there are several).
function TrainerSwitch({ current, trainers }: { current: string; trainers: TrainerOption[] }) {
  const currentKey = current.toLowerCase();

  return (
    <nav aria-label="Trenér" className="-mx-1 overflow-x-auto px-1">
      <div className="inline-flex gap-0.5 rounded-full border border-line bg-surface p-1">
        {trainers.map(({ name, trainer }) => {
          const isCurrent = trainer.toLowerCase() === currentKey;

          return (
            <Link
              aria-current={isCurrent ? "page" : undefined}
              className={`inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition ${
                isCurrent ? "bg-brand text-on-brand" : "text-ink-muted hover:bg-subtle hover:text-ink"
              }`}
              href={`/lekce/${encodeURIComponent(trainer)}`}
              key={trainer}
            >
              {name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

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
  // All trainers with a lesson calendar, for the switch above the calendar.
  const [trainers, setTrainers] = useState<TrainerOption[]>([]);
  // The trainer is writing in a lesson for somebody without an account; the
  // time is prefilled from a clicked free slot, or empty.
  const [guestSlot, setGuestSlot] = useState<SlotTime | null>(null);
  // Lesson whose detail is open (from a click in the week calendar).
  const [openLessonId, setOpenLessonId] = useState("");
  const apiBase = `/api/lessons/${encodeURIComponent(trainer)}`;
  const openLesson = calendar
    ? [...calendar.requests, ...calendar.lessons, ...calendar.mine].find(
        (lesson) => lesson.id === openLessonId,
      )
    : undefined;
  // The dancer's own lesson for which a swap partner is being picked.
  const [swapLessonId, setSwapLessonId] = useState("");
  const swapLesson = calendar?.mine.find((lesson) => lesson.id === swapLessonId);
  const incomingSwaps = calendar?.swaps.filter((swap) => swap.direction === "incoming") ?? [];

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

  useEffect(() => {
    if (!session) {
      return undefined;
    }

    let isCancelled = false;

    // "Lekce" in the header comes back to the trainer chosen last.
    rememberTrainer(trainer);
    void fetch("/api/lessons", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { trainers: [] }))
      .then((data: { trainers?: TrainerOption[] }) => {
        if (!isCancelled) {
          setTrainers(data.trainers ?? []);
        }
      })
      .catch(() => undefined);

    return () => {
      isCancelled = true;
    };
  }, [session, trainer]);

  // Pull-to-refresh in the installed app.
  useRefreshHandler(load);

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

  async function changeOpenLesson(action: "cancel" | "confirm" | "decline") {
    if (await send(`/${openLessonId}`, "PATCH", { action })) {
      setOpenLessonId("");
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
        {/* One column that may shrink: the week calendar scrolls sideways
            inside its card instead of widening the page on phones. */}
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-5">
          <div>
            <p className={eyebrow}>Individuální lekce</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">Lekce · {calendar?.trainerName ?? trainer}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {calendar?.canManage
                ? "Tady nabízíš časy, schvaluješ žádosti a vidíš potvrzené lekce."
                : "Vyber si volný termín a pošli žádost. Lekce platí, až ji trenér potvrdí."}
            </p>
          </div>

          {session && trainers.length > 1 ? (
            <TrainerSwitch current={trainer} trainers={trainers} />
          ) : null}

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
              <SlotsCard
                blocks={buildBlocks(calendar, setOpenLessonId, setGuestSlot)}
                onAdd={() => setGuestSlot({ date: "", end: "", start: "" })}
                onRequest={setGuestSlot}
                slots={calendar.slots}
                title="Kalendář lekcí"
              />
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
              <InviteCard isBusy={isBusy} onRegenerate={() => send("/invite", "POST")} token={calendar.inviteToken} />
            </>
          ) : (
            <>
              {incomingSwaps.length > 0 ? (
                <Card count={incomingSwaps.length} title="Žádosti o prohození">
                  <ul className="divide-y divide-line">
                    {incomingSwaps.map((swap) => (
                      <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5" key={swap.id}>
                        <div className="min-w-0 flex-1 basis-56">
                          <p className="font-semibold text-ink">
                            {swap.otherName} si chce prohodit lekci
                          </p>
                          <p className="text-sm text-ink-muted">
                            <span className="capitalize">{formatDay(swap.mine.date)}</span>: ty teď{" "}
                            {swap.mine.start}–{swap.mine.end}, nově {swap.theirs.start}–{swap.theirs.end}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            className={`${smallButton} bg-accent text-white hover:bg-accent-hover`}
                            disabled={isBusy}
                            onClick={() => send(`/swaps/${swap.id}`, "PATCH", { action: "accept" })}
                            type="button"
                          >
                            <Check size={14} />
                            Souhlasím
                          </button>
                          <button
                            className={`${smallButton} border border-line-strong text-ink hover:bg-subtle`}
                            disabled={isBusy}
                            onClick={() => send(`/swaps/${swap.id}`, "PATCH", { action: "decline" })}
                            type="button"
                          >
                            <X size={14} />
                            Odmítnout
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
              <Card count={calendar.mine.length} title="Moje lekce a žádosti">
                <LessonList
                  empty="Zatím nemáš žádnou žádost. Vyber si termín níže."
                  lessons={calendar.mine}
                  renderActions={(lesson) => {
                    if (lesson.status === "declined") {
                      return null;
                    }

                    const swap = calendar.swaps.find((item) => item.mine.id === lesson.id);
                    const canSwap =
                      lesson.status === "confirmed" &&
                      !swap &&
                      calendar.dayLessons.some((other) => other.date === lesson.date);

                    return (
                      <>
                        {swap?.direction === "outgoing" ? (
                          <button
                            className={`${smallButton} border border-line-strong text-ink hover:bg-subtle`}
                            disabled={isBusy}
                            onClick={() => send(`/swaps/${swap.id}`, "PATCH", { action: "cancel" })}
                            type="button"
                          >
                            <X size={14} />
                            Zrušit prohození
                          </button>
                        ) : null}
                        {canSwap ? (
                          <button
                            className={`${smallButton} border border-line-strong text-ink hover:border-accent hover:bg-subtle`}
                            disabled={isBusy}
                            onClick={() => setSwapLessonId(lesson.id)}
                            type="button"
                          >
                            <ArrowLeftRight size={14} />
                            Prohodit
                          </button>
                        ) : null}
                        <CancelButton
                          isBusy={isBusy}
                          onCancel={() => send(`/${lesson.id}`, "PATCH", { action: "cancel" })}
                          question={`Zrušit ${lesson.status === "pending" ? "žádost" : "lekci"} ${formatLesson(lesson)}?`}
                        />
                      </>
                    );
                  }}
                  renderInfo={(lesson) => {
                    const swap = calendar.swaps.find(
                      (item) => item.direction === "outgoing" && item.mine.id === lesson.id,
                    );

                    return swap
                      ? `Prohození na ${swap.theirs.start}–${swap.theirs.end} čeká na souhlas: ${swap.otherName}`
                      : "";
                  }}
                  showStatus
                />
              </Card>
              <SlotsCard onRequest={setRequestSlot} slots={calendar.slots} title="Termíny" />
            </>
          )}
        </div>
      </main>

      <Sheet onClose={() => setSwapLessonId("")} open={Boolean(swapLesson)} title="Prohodit lekci">
        {swapLesson && calendar ? (
          <div className="grid gap-3">
            <div className="rounded-lg border border-line bg-subtle p-3">
              <p className="text-xs font-semibold uppercase text-ink-muted">Tvoje lekce</p>
              <p className="font-semibold capitalize text-ink">{formatLesson(swapLesson)}</p>
            </div>
            <p className="text-sm text-ink-muted">
              S kým si chceš čas prohodit? Dotyčný dostane žádost, a jakmile bude souhlasit,
              lekce se prohodí.
            </p>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {calendar.dayLessons
                .filter((other) => other.date === swapLesson.date)
                .map((other) => (
                  <li className="flex items-center justify-between gap-3 px-3 py-2.5" key={other.lessonId}>
                    <div className="min-w-0">
                      <p className="font-semibold tabular-nums text-ink">
                        {other.start}–{other.end}
                      </p>
                      <p className="truncate text-sm text-ink-muted">{other.requester}</p>
                    </div>
                    <button
                      className={`${smallButton} shrink-0 bg-accent text-white hover:bg-accent-hover`}
                      disabled={isBusy}
                      onClick={async () => {
                        if (
                          await send("/swaps", "POST", {
                            myLessonId: swapLesson.id,
                            otherLessonId: other.lessonId,
                          })
                        ) {
                          setSwapLessonId("");
                        }
                      }}
                      type="button"
                    >
                      <ArrowLeftRight size={14} />
                      Požádat
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
      </Sheet>

      <Sheet onClose={() => setOpenLessonId("")} open={Boolean(openLesson)} title="Lekce">
        {openLesson && calendar ? (
          <div className="grid gap-3">
            <div className="rounded-lg border border-line bg-subtle p-3">
              <p className="font-semibold capitalize text-ink">{formatDay(openLesson.date)}</p>
              <p className="flex items-center gap-1.5 text-sm text-ink-muted">
                <Clock3 size={14} />
                {openLesson.start}–{openLesson.end}
                {calendar.canManage ? ` · ${openLesson.requester}` : ""}
              </p>
              {openLesson.note ? <p className="mt-1.5 text-sm text-ink">{openLesson.note}</p> : null}
            </div>
            <span className={`justify-self-start rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadge[openLesson.status].className}`}>
              {statusBadge[openLesson.status].label}
            </span>
            {calendar.canManage && openLesson.status === "pending" ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  className={buttonSecondary}
                  disabled={isBusy}
                  onClick={() => changeOpenLesson("decline")}
                  type="button"
                >
                  <X size={16} />
                  Odmítnout
                </button>
                <button
                  className={buttonPrimary}
                  disabled={isBusy}
                  onClick={() => changeOpenLesson("confirm")}
                  type="button"
                >
                  <Check size={16} />
                  Potvrdit
                </button>
              </div>
            ) : (
              <button
                className={`${buttonSecondary} border-busy-line bg-busy text-busy-ink`}
                disabled={isBusy}
                onClick={() => {
                  if (window.confirm(`Zrušit ${openLesson.status === "pending" ? "žádost" : "lekci"} ${formatLesson(openLesson)}?`)) {
                    void changeOpenLesson("cancel");
                  }
                }}
                type="button"
              >
                <Trash2 size={16} />
                {openLesson.status === "pending" ? "Zrušit žádost" : "Zrušit lekci"}
              </button>
            )}
          </div>
        ) : null}
      </Sheet>

      <Sheet onClose={() => setGuestSlot(null)} open={guestSlot !== null} title="Zapsat lekci">
        {guestSlot ? (
          <GuestLessonForm
            initial={guestSlot}
            // A fresh form for every slot the trainer clicks.
            key={`${guestSlot.date}-${guestSlot.start}`}
            onSubmit={async (input) => {
              if (await send("", "POST", input)) {
                setGuestSlot(null);
              }
            }}
          />
        ) : null}
      </Sheet>

      <Sheet onClose={() => setRequestSlot(null)} open={requestSlot !== null} title="Žádost o lekci">
        {requestSlot ? (
          <RequestForm
            defaultPartner={calendar?.viewerPartner ?? ""}
            onSubmit={async (note, partner) => {
              if (
                await send("", "POST", {
                  date: requestSlot.date,
                  end: requestSlot.end,
                  note,
                  partner,
                  start: requestSlot.start,
                })
              ) {
                setRequestSlot(null);
              }
            }}
            slot={requestSlot}
            trainer={calendar?.trainerName ?? trainer}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

const smallButton =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";

function Card({
  action,
  children,
  count,
  title,
}: {
  // Shown on the right of the title (e.g. a view switch).
  action?: ReactNode;
  children: ReactNode;
  count?: number;
  title: string;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-black">
          {title}
          {count ? (
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">{count}</span>
          ) : null}
        </h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

// Blocks for the trainer's week calendar: every offered slot, plus lessons
// whose offer was removed later (they still take place). A click on a lesson
// opens its detail, a click on a free slot the form to write a lesson in.
function buildBlocks(
  calendar: TrainerCalendar,
  onOpenLesson: (lessonId: string) => void,
  onPickFree: (slot: SlotTime) => void,
): GridBlock[] {
  const blocks = calendar.slots.map((slot): GridBlock => {
    const { lessonId } = slot;

    return {
      date: slot.date,
      end: slot.end,
      key: `${slot.date}-${slot.start}`,
      label: slot.requester ?? slotStyle[slot.state].label,
      onClick: lessonId
        ? () => onOpenLesson(lessonId)
        : slot.state === "free"
          ? () => onPickFree(slot)
          : undefined,
      start: slot.start,
      state: slot.state,
    };
  });
  const known = new Set(calendar.slots.map((slot) => slot.lessonId).filter(Boolean));

  for (const lesson of [...calendar.requests, ...calendar.lessons]) {
    if (!known.has(lesson.id) && (lesson.status === "pending" || lesson.status === "confirmed")) {
      blocks.push({
        date: lesson.date,
        end: lesson.end,
        key: lesson.id,
        label: lesson.requester,
        onClick: () => onOpenLesson(lesson.id),
        start: lesson.start,
        state: lesson.status,
      });
    }
  }

  return blocks;
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
  renderInfo,
  showRequester = false,
  showStatus = false,
}: {
  empty: string;
  lessons: TrainerLesson[];
  renderActions: (lesson: TrainerLesson) => ReactNode;
  // Extra line under a lesson (e.g. a swap waiting for an answer).
  renderInfo?: (lesson: TrainerLesson) => string;
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
              {[
                // The requester's name already carries the partner; the
                // dancer's own list says it in words instead.
                showRequester ? lesson.requester : lesson.partner ? `v páru: ${lesson.partner}` : "sólo",
                lesson.note,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {renderInfo?.(lesson) ? (
              <p className="text-xs font-semibold text-cleanup-ink">{renderInfo(lesson)}</p>
            ) : null}
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

// Offered slots as a list grouped by day; with `onRequest`, free slots are
// buttons. With `blocks` (the trainer's view) there is also a week calendar,
// shown first, and with `onAdd` a button to write a lesson in at any time.
function SlotsCard({
  blocks,
  onAdd,
  onRequest,
  slots,
  title,
}: {
  blocks?: GridBlock[];
  onAdd?: () => void;
  onRequest?: (slot: LessonSlot) => void;
  slots: LessonSlot[];
  title: string;
}) {
  const [view, setView] = useState<"calendar" | "list">(blocks ? "calendar" : "list");
  const days = new Map<string, LessonSlot[]>();

  for (const slot of slots) {
    days.set(slot.date, [...(days.get(slot.date) ?? []), slot]);
  }

  return (
    <Card
      action={
        !blocks ? null : (
        <div className="flex flex-wrap items-center gap-2">
          {onAdd ? (
            <button className={`${smallButton} bg-accent text-white hover:bg-accent-hover`} onClick={onAdd} type="button">
              <Plus size={14} />
              Zapsat lekci
            </button>
          ) : null}
          <div className="inline-flex rounded-full border border-line bg-subtle p-0.5">
            {(["calendar", "list"] as const).map((mode) => (
              <button
                aria-pressed={view === mode}
                className={`h-8 rounded-full px-3.5 text-sm font-semibold transition ${
                  view === mode ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"
                }`}
                key={mode}
                onClick={() => setView(mode)}
                type="button"
              >
                {mode === "calendar" ? "Kalendář" : "Seznam"}
              </button>
            ))}
          </div>
        </div>
        )
      }
      title={title}
    >
      {(blocks ?? slots).length === 0 ? (
        <p className="text-sm text-ink-muted">
          {blocks
            ? "Zatím nic nenabízíš. Přidej čas v části „Kdy mohu učit“, nebo lekci rovnou zapiš."
            : "Trenér teď nenabízí žádné termíny. Zkus to později."}
        </p>
      ) : blocks && view === "calendar" ? (
        <LessonsWeekGrid blocks={blocks} />
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

// The trainer writes a lesson in for somebody without an account: any free
// time, confirmed right away.
function GuestLessonForm({
  initial,
  onSubmit,
}: {
  initial: SlotTime;
  onSubmit: (input: SlotTime & { guest: string; note: string; partner: string }) => Promise<void>;
}) {
  const [date, setDate] = useState(initial.date);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [guest, setGuest] = useState("");
  const [isCouple, setIsCouple] = useState(false);
  const [partner, setPartner] = useState("");
  const [note, setNote] = useState("");
  const [isSending, setIsSending] = useState(false);
  const error =
    start && end && start >= end
      ? "Konec musí být později než začátek."
      : isCouple && !partner.trim()
        ? "Vyplň jméno partnera, nebo zvol Sólo."
        : "";
  const isIncomplete = !date || !start || !end || !guest.trim();

  return (
    <form
      className="grid gap-3"
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSending(true);

        try {
          await onSubmit({
            date,
            end,
            guest: guest.trim(),
            note: note.trim(),
            partner: isCouple ? partner.trim() : "",
            start,
          });
        } finally {
          setIsSending(false);
        }
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="field-label col-span-2">
          Datum
          <input className="field-input mt-1" onChange={(event) => setDate(event.target.value)} required type="date" value={date} />
        </label>
        <label className="field-label">
          Od
          <input className="field-input mt-1" onChange={(event) => setStart(event.target.value)} required type="time" value={start} />
        </label>
        <label className="field-label">
          Do
          <input className="field-input mt-1" onChange={(event) => setEnd(event.target.value)} required type="time" value={end} />
        </label>
      </div>
      <label className="field-label">
        Kdo přijde
        <input
          className="field-input mt-1"
          maxLength={60}
          onChange={(event) => setGuest(event.target.value)}
          placeholder="Jana Nováková"
          required
          value={guest}
        />
      </label>
      <div>
        <p className="field-label">Lekce</p>
        <div className="mt-1 flex gap-1.5">
          <button aria-pressed={!isCouple} className={chipClass(!isCouple)} onClick={() => setIsCouple(false)} type="button">
            Sólo
          </button>
          <button aria-pressed={isCouple} className={chipClass(isCouple)} onClick={() => setIsCouple(true)} type="button">
            V páru
          </button>
        </div>
      </div>
      {isCouple ? (
        <label className="field-label">
          Partner / partnerka
          <input
            className="field-input mt-1"
            maxLength={60}
            onChange={(event) => setPartner(event.target.value)}
            placeholder="Petr Novák"
            value={partner}
          />
        </label>
      ) : null}
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
      <p className={`text-xs ${error ? "font-semibold text-busy-ink" : "text-ink-soft"}`}>
        {error ||
          "Pro někoho, kdo nemá účet. Lekce je hned potvrzená a ostatní uvidí v tomto čase jen „Obsazeno“. Čas nemusí být z tvé nabídky."}
      </p>
      <button className={`${buttonPrimary} h-11`} disabled={isSending || isIncomplete || Boolean(error)} type="submit">
        <Check size={16} />
        {isSending ? "Zapisuji…" : "Zapsat lekci"}
      </button>
    </form>
  );
}

function RequestForm({
  defaultPartner,
  onSubmit,
  slot,
  trainer,
}: {
  // The usual partner from the profile; makes "as a couple" the default.
  defaultPartner: string;
  // `partner` is empty for a solo lesson.
  onSubmit: (note: string, partner: string) => Promise<void>;
  slot: LessonSlot;
  trainer: string;
}) {
  const [note, setNote] = useState("");
  const [isCouple, setIsCouple] = useState(Boolean(defaultPartner));
  const [partner, setPartner] = useState(defaultPartner);
  const [isSending, setIsSending] = useState(false);
  const isPartnerMissing = isCouple && !partner.trim();

  return (
    <form
      className="grid gap-3"
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSending(true);

        try {
          await onSubmit(note.trim(), isCouple ? partner.trim() : "");
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
      <div>
        <p className="field-label">Přijdu</p>
        <div className="mt-1 flex gap-1.5">
          <button aria-pressed={!isCouple} className={chipClass(!isCouple)} onClick={() => setIsCouple(false)} type="button">
            Sólo
          </button>
          <button aria-pressed={isCouple} className={chipClass(isCouple)} onClick={() => setIsCouple(true)} type="button">
            V páru
          </button>
        </div>
      </div>
      {isCouple ? (
        <label className="field-label">
          Partner / partnerka
          <input
            className="field-input mt-1"
            maxLength={60}
            onChange={(event) => setPartner(event.target.value)}
            placeholder="Petr Novák"
            value={partner}
          />
          <span className="mt-1 block text-xs font-normal text-ink-soft">
            {defaultPartner
              ? "Předvyplněno z tvého profilu, jde přepsat."
              : "Aby se příště vyplnil sám, ulož si partnera v profilu (nabídka účtu → Můj profil)."}
          </span>
        </label>
      ) : null}
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
      <button className={`${buttonPrimary} h-11`} disabled={isSending || isPartnerMissing} type="submit">
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
