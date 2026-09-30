"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getDayAvailabilitySegments,
  getMonthDays,
  getWeekStartDate,
} from "@/components/booking-dashboard-utils";
import {
  buildCalendarDays,
  getFreeMinutes,
  getHallStatus,
  minutesToTime,
  timeToMinutes,
  type CalendarItem,
} from "@/components/dashboard/calendar-events";
import { CalendarToolbar } from "@/components/dashboard/calendar-toolbar";
import { DayDetailPanel, hasBookingEnded } from "@/components/dashboard/day-detail-panel";
import { BookingForm } from "@/components/dashboard/booking-form-panel";
import { HallStatusBanner, ScheduleInfo } from "@/components/dashboard/hall-status";
import { LoginForm } from "@/components/dashboard/login-form";
import {
  CalendarLegend,
  DayStrip,
  MonthCalendar,
} from "@/components/dashboard/month-calendar";
import { TimeGridCalendar } from "@/components/dashboard/time-grid-calendar";
import type { ViewMode } from "@/components/dashboard/types";
import { useBookingActions } from "@/components/dashboard/use-booking-actions";
import { useCalendarData } from "@/components/dashboard/use-calendar-data";
import { useNow } from "@/components/dashboard/use-now";
import { AppHeader } from "@/components/ui/app-header";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PasswordChangeForm } from "@/components/ui/password-change-form";
import { Sheet } from "@/components/ui/sheet";
import { pageContainer } from "@/components/ui/styles";
import {
  canRoleManageBookings,
  getAdminSession,
  loginAdmin,
  logoutAdmin,
  type AdminRole,
} from "@/lib/admin-auth-client";
import type {
  RecurringCancellationNotice,
  RecurringOverrideNotice,
} from "@/lib/bookings-db";
import {
  formatDateKey,
  formatOpeningHoursForDate,
  getOpeningHoursForDate,
  getOpeningHoursGroups,
  getWeekDays,
  trainerOptions,
  type Booking,
  type BookingRequest,
} from "@/lib/schedule";

const initialRequest: BookingRequest = {
  name: "",
  date: "2026-05-20",
  start: "16:00",
  end: "18:00",
  eventType: "seminar",
  bookingKind: "hall",
  trainer: "",
  note: "",
  cleanupRequired: false,
};

type SheetKind = "booking" | "login" | "password" | null;

type BookingDashboardProps = {
  initialBookings: Booking[];
  initialDate: string;
  initialRecurringCancellations: RecurringCancellationNotice[];
  initialRecurringOverrides: RecurringOverrideNotice[];
  initialSession: {
    authenticated: boolean;
    role: AdminRole | null;
    username: string | null;
  };
};

export function BookingDashboard({
  initialBookings,
  initialDate,
  initialRecurringCancellations,
  initialRecurringOverrides,
  initialSession,
}: BookingDashboardProps) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [request, setRequest] = useState({ ...initialRequest, date: initialDate });
  const [submitMessage, setSubmitMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);
  // Where to continue after logging in from the "add booking" button.
  const [openBookingAfterLogin, setOpenBookingAfterLogin] = useState(false);
  const [expandedBookingId, setExpandedBookingId] = useState("");
  const [toast, setToast] = useState("");
  // Booking whose cleanup the "Uklidil jsem sál?" dialog asks about.
  const [cleanupBooking, setCleanupBooking] = useState<Booking | null>(null);
  const [cleanupError, setCleanupError] = useState("");
  const toastTimeoutRef = useRef<number | null>(null);
  const [session, setSession] = useState({
    isAuthenticated: initialSession.authenticated,
    role: initialSession.role,
    username: initialSession.username,
  });
  const agendaRef = useRef<HTMLDivElement | null>(null);

  const now = useNow();
  const calendar = useCalendarData({
    initialBookings,
    initialRecurringCancellations,
    initialRecurringOverrides,
  });
  const { syncCalendar } = calendar;
  const actions = useBookingActions(syncCalendar);

  const { isAuthenticated } = session;
  const canManageBookings = isAuthenticated && canRoleManageBookings(session.role);
  // Anonymous visitors see the button too; it leads them to the login.
  const canStartBooking = !isAuthenticated || canManageBookings;
  const currentDateKey = now ? formatDateKey(now) : "";
  const nowMinutes = now ? now.getHours() * 60 + now.getMinutes() : null;
  const todayKey = currentDateKey || initialDate;

  const hallBookings = useMemo(
    () => calendar.bookings.filter((booking) => booking.bookingKind !== "individual-lesson"),
    [calendar.bookings],
  );
  const weekDates = useMemo(() => getWeekDays(getWeekStartDate(selectedDate)), [selectedDate]);
  const monthKey = selectedDate.slice(0, 7);
  const monthGridDates = useMemo(() => getMonthGridDates(monthKey), [monthKey]);
  const viewDates = useMemo(
    () =>
      viewMode === "today"
        ? [new Date(`${selectedDate}T12:00:00`)]
        : viewMode === "week"
          ? weekDates
          : monthGridDates,
    [monthGridDates, selectedDate, viewMode, weekDates],
  );
  const cancellations = calendar.recurringCancellations;
  const viewDays = useMemo(
    () => buildCalendarDays({ bookings: hallBookings, cancellations, days: viewDates }),
    [cancellations, hallBookings, viewDates],
  );
  const stripDays = useMemo(
    () => buildCalendarDays({ bookings: hallBookings, cancellations, days: weekDates }),
    [cancellations, hallBookings, weekDates],
  );
  const today = useMemo(
    () =>
      buildCalendarDays({
        bookings: hallBookings,
        cancellations,
        days: [new Date(`${todayKey}T12:00:00`)],
      })[0],
    [cancellations, hallBookings, todayKey],
  );
  const hallStatus = now && nowMinutes !== null ? getHallStatus(today, nowMinutes) : null;
  // Rounded down to half hours so it never promises more than there is.
  const freeHours = now ? Math.floor((getFreeMinutes(today) / 60) * 2) / 2 : null;
  const selectedDaySegments = useMemo(
    () => getDayAvailabilitySegments(selectedDate, hallBookings, 30),
    [hallBookings, selectedDate],
  );
  const availableTrainers = useMemo(() => {
    const trainers = new Set(trainerOptions);

    for (const booking of calendar.bookings) {
      if (booking.trainer) {
        trainers.add(booking.trainer);
      }
    }

    return [...trainers];
  }, [calendar.bookings]);
  const isShowingToday =
    viewMode === "today"
      ? selectedDate === todayKey
      : viewMode === "week"
        ? weekDates.some((date) => formatDateKey(date) === todayKey)
        : monthKey === todayKey.slice(0, 7);

  // Jump to today once the client knows its own date (and again at midnight).
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSelectedDate(todayKey);
      setRequest((current) => ({ ...current, date: todayKey }));
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [todayKey]);

  function showToast(message: string) {
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
    }

    setToast(message);
    toastTimeoutRef.current = window.setTimeout(() => setToast(""), 3500);
  }

  function patchRequest(patch: Partial<BookingRequest>) {
    setSubmitMessage("");
    setRequest((current) => ({ ...current, ...patch }));
  }

  function selectDate(dateKey: string) {
    setSelectedDate(dateKey);
    setExpandedBookingId("");
    setRequest((current) => ({ ...current, date: dateKey }));
  }

  function changeViewMode(nextViewMode: ViewMode) {
    setViewMode(nextViewMode);
  }

  function changePeriod(offset: number) {
    const date = new Date(`${selectedDate}T12:00:00`);

    if (viewMode === "month") {
      date.setDate(1);
      date.setMonth(date.getMonth() + offset);
    } else {
      date.setDate(date.getDate() + (viewMode === "week" ? offset * 7 : offset));
    }

    selectDate(formatDateKey(date));
  }

  function openBookingForm(prefill?: { date: string; start?: string; end?: string }) {
    if (!canManageBookings) {
      setOpenBookingAfterLogin(true);
      setSheet("login");
      return;
    }

    setSubmitMessage("");
    setRequest((current) => ({
      ...current,
      bookingKind: "hall",
      date: prefill?.date ?? selectedDate,
      end: prefill?.end ?? current.end,
      eventType: "seminar",
      name: "",
      start: prefill?.start ?? current.start,
      trainer: "",
    }));
    setSheet("booking");
  }

  function pickTime(dateKey: string, minutes: number) {
    const openingHours = getOpeningHoursForDate(new Date(`${dateKey}T12:00:00`));
    const closing = openingHours ? timeToMinutes(openingHours.end) : 24 * 60;

    setSelectedDate(dateKey);
    openBookingForm({
      date: dateKey,
      end: minutesToTime(Math.min(minutes + 60, closing)),
      start: minutesToTime(minutes),
    });
  }

  function selectItem(dateKey: string, item: CalendarItem) {
    setSelectedDate(dateKey);
    setRequest((current) => ({ ...current, date: dateKey }));
    setExpandedBookingId(
      canManageBookings && item.booking && item.kind !== "cleanup" ? item.booking.id : "",
    );

    if (item.kind === "cleanup" && item.booking) {
      requestCleanup(item.booking);
      return;
    }

    // Below 1280px the day detail is under the calendar.
    if (window.matchMedia("(max-width: 1279px)").matches) {
      agendaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function requestCleanup(booking: Booking) {
    setCleanupError("");
    setCleanupBooking(booking);
  }

  const closeCleanupPrompt = useCallback(() => {
    setCleanupBooking(null);
    setCleanupError("");
  }, []);

  async function confirmCleanup() {
    if (!cleanupBooking) {
      return;
    }

    const error = await actions.markCleaned(cleanupBooking.id);

    if (error) {
      setCleanupError(error);
      return;
    }

    closeCleanupPrompt();
    showToast("Díky! Sál je označen jako uklizený.");
  }

  function setWholeDayBooking() {
    const openingHours = getOpeningHoursForDate(new Date(`${request.date}T12:00:00`));

    if (!openingHours) {
      setSubmitMessage("V tento den není nastavena otevírací doba.");
      return;
    }

    patchRequest({ end: openingHours.end, start: openingHours.start });
  }

  async function login(username: string, password: string) {
    let role: AdminRole | null = null;

    try {
      await loginAdmin(username, password);
      const nextSession = await getAdminSession();

      role = nextSession.role ?? null;
      setSession({
        isAuthenticated: true,
        role,
        username: nextSession.username ?? username.trim(),
      });
    } catch (error) {
      return error instanceof Error ? error.message : "Přihlášení se nepodařilo.";
    }

    void syncCalendar();

    if (openBookingAfterLogin && canRoleManageBookings(role)) {
      setOpenBookingAfterLogin(false);
      setSubmitMessage("");
      setRequest((current) => ({ ...current, date: selectedDate, eventType: "seminar", name: "" }));
      setSheet("booking");
    } else {
      setSheet(null);
    }

    return null;
  }

  async function logout() {
    await logoutAdmin();
    setSession({ isAuthenticated: false, role: null, username: null });
    setExpandedBookingId("");
    setSheet(null);
    void syncCalendar();
  }

  async function submitBooking(bookingName: string) {
    setIsSubmitting(true);
    setSubmitMessage("");

    try {
      const response = await fetch("/api/booking-request", {
        body: JSON.stringify({ ...request, bookingKind: "hall", name: bookingName }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (response.status === 409) {
        setSubmitMessage("V tomto čase už existuje jiná akce.");
        return;
      }

      const data = (await response.json()) as { booking?: Booking; message?: string };

      if (!response.ok) {
        setSubmitMessage(data.message ?? "Rezervaci se nepodařilo uložit.");
        return;
      }

      if (data.booking) {
        calendar.addBooking(data.booking);
        setSelectedDate(data.booking.date);
      }

      setSheet(null);
      showToast(`Uloženo: ${bookingName}`);
      await syncCalendar();
    } finally {
      setIsSubmitting(false);
    }
  }

  function closeSheet() {
    setSheet(null);
    setOpenBookingAfterLogin(false);
  }

  return (
    <div className="min-h-screen bg-page text-ink">
      <AppHeader
        activeTab="hall"
        onChangePassword={() => setSheet("password")}
        onLogin={() => setSheet("login")}
        onLogout={logout}
        session={isAuthenticated ? session : null}
      />

      <main className={`${pageContainer} grid grid-cols-1 gap-4 py-4 lg:py-5`}>
            <HallStatusBanner
              freeHours={freeHours}
              onRequestCleanup={requestCleanup}
              status={hallStatus}
              todaysOpeningHours={formatOpeningHoursForDate(new Date(`${todayKey}T12:00:00`))}
            />

            {/* The side panel sits next to the calendar only from 1280px;
                on tablets (e.g. iPad in portrait) it goes below, so the
                week keeps its full width. */}
            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-stretch xl:gap-5">
              <section className="grid gap-3 rounded-xl border border-line bg-surface p-3 sm:p-4">
                <CalendarToolbar
                  isShowingToday={isShowingToday}
                  onAddBooking={canStartBooking ? () => openBookingForm() : undefined}
                  onChangePeriod={changePeriod}
                  onShowToday={() => selectDate(todayKey)}
                  onViewModeChange={changeViewMode}
                  selectedDate={selectedDate}
                  viewMode={viewMode}
                />

                {viewMode === "month" ? (
                  <MonthCalendar
                    days={viewDays}
                    monthKey={monthKey}
                    onSelectDate={selectDate}
                    selectedDate={selectedDate}
                    todayKey={todayKey}
                  />
                ) : (
                  <>
                    <div className="md:hidden">
                      <DayStrip
                        days={stripDays}
                        onSelectDate={selectDate}
                        selectedDate={selectedDate}
                        todayKey={todayKey}
                      />
                    </div>
                    <div className="hidden md:block">
                      <TimeGridCalendar
                        canAdd={canManageBookings}
                        days={viewDays}
                        nowMinutes={nowMinutes}
                        onPickTime={pickTime}
                        onSelectDate={selectDate}
                        onSelectItem={selectItem}
                        selectedDate={selectedDate}
                        todayKey={todayKey}
                      />
                    </div>
                  </>
                )}

                <CalendarLegend />
              </section>

              {/* On computers the side panel is as tall as the calendar and
                  scrolls on its own, so it never makes the page longer. */}
              <aside className="grid content-start gap-4 xl:relative">
                <div className="grid content-start items-start gap-4 md:grid-cols-2 xl:absolute xl:inset-0 xl:grid-cols-1 xl:overflow-y-auto xl:overscroll-contain xl:rounded-xl">
                <div className="scroll-mt-20" ref={agendaRef}>
                  <DayDetailPanel
                    actions={actions}
                    availableTrainers={availableTrainers}
                    bookings={hallBookings}
                    canManageBookings={canManageBookings}
                    cancellations={calendar.recurringCancellations}
                    currentDateKey={currentDateKey}
                    currentTimeMinutes={nowMinutes}
                    expandedBookingId={expandedBookingId}
                    onAddBooking={() => openBookingForm({ date: selectedDate })}
                    onExpandedBookingChange={setExpandedBookingId}
                    onRequestCleanup={requestCleanup}
                    segments={selectedDaySegments}
                    selectedDate={selectedDate}
                  />
                </div>
                <ScheduleInfo
                  canReinstate={canManageBookings}
                  cancellations={calendar.recurringCancellations}
                  changes={calendar.recurringOverrides}
                  onReinstate={actions.reinstate}
                  openingHours={getOpeningHoursGroups()}
                  reinstatingId={actions.pendingId.reinstating}
                />
                </div>
              </aside>
            </div>

            {canStartBooking ? (
              <button
                aria-label="Přidat akci"
                className="fixed bottom-5 right-5 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-[0_10px_24px_-8px_var(--k-accent)] transition hover:bg-accent-hover lg:hidden"
                onClick={() => openBookingForm({ date: selectedDate })}
                type="button"
              >
                <Plus size={26} />
              </button>
            ) : null}
      </main>

      {toast ? (
        <div
          className="fade-enter fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-page shadow-lg lg:bottom-6"
          role="status"
        >
          {toast}
        </div>
      ) : null}

      <Sheet onClose={closeSheet} open={sheet === "booking"} title="Nová akce">
        <BookingForm
          availableTrainers={availableTrainers}
          bookings={hallBookings}
          isSubmitting={isSubmitting}
          onRequestPatch={patchRequest}
          onSetWholeDay={setWholeDayBooking}
          onSubmit={submitBooking}
          request={request}
          submitMessage={submitMessage}
        />
      </Sheet>
      <Sheet onClose={closeSheet} open={sheet === "login"} title="Přihlášení">
        {openBookingAfterLogin ? (
          <p className="mb-2 text-sm text-ink-muted">
            Akce do kalendáře přidávají přihlášení správci sálu.
          </p>
        ) : null}
        <LoginForm onLogin={login} />
      </Sheet>
      <Sheet onClose={closeSheet} open={sheet === "password"} title="Změna hesla">
        <PasswordChangeForm />
      </Sheet>

      <ConfirmDialog
        error={cleanupError}
        isBusy={Boolean(cleanupBooking) && actions.pendingId.cleaning === cleanupBooking?.id}
        onCancel={closeCleanupPrompt}
        onConfirm={
          cleanupBooking && hasBookingEnded(cleanupBooking, currentDateKey, nowMinutes)
            ? confirmCleanup
            : undefined
        }
        open={cleanupBooking !== null}
        title={
          cleanupBooking && !hasBookingEnded(cleanupBooking, currentDateKey, nowMinutes)
            ? "Akce ještě neskončila"
            : "Je sál uklizený?"
        }
      >
        {cleanupBooking ? (
          hasBookingEnded(cleanupBooking, currentDateKey, nowMinutes) ? (
            <p>
              Po akci <strong className="text-ink">{cleanupBooking.title}</strong> (
              {formatCleanupDate(cleanupBooking)}) sál čeká na úklid. Je už uklizeno?
            </p>
          ) : (
            <p>
              Úklid po akci <strong className="text-ink">{cleanupBooking.title}</strong> půjde
              potvrdit až po jejím skončení ({formatCleanupDate(cleanupBooking)}).
            </p>
          )
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

function formatCleanupDate(booking: Booking) {
  const [, month, day] = booking.date.split("-").map(Number);

  return `${day}. ${month}., ${booking.start}–${booking.end}`;
}

// Whole weeks (Monday to Sunday) covering the given month, for the month grid.
function getMonthGridDates(monthKey: string) {
  const monthDates = getMonthDays(`${monthKey}-01`);
  const first = monthDates[0];
  const last = monthDates[monthDates.length - 1];
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - ((last.getDay() + 6) % 7)));
  const dates: Date[] = [];

  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    dates.push(new Date(date));
  }

  return dates;
}
