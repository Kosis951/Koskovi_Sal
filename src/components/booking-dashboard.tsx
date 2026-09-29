"use client";

import { MapPin, Sparkles, User } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getDayAvailabilitySegments,
  getMonthDays,
  getOccupancyNotice,
  getSlotStateKey,
  getWeekStartDate,
  isCountableEvent,
  scrollCurrentTimeIntoView,
  formatEventCount,
  type SlotState,
} from "@/components/booking-dashboard-utils";
import {
  MobileCalendarSummary,
  RecurringCancellationPanel,
} from "@/components/booking-dashboard-panels";
import { AccountBar } from "@/components/dashboard/account-bar";
import { BookingFormPanel } from "@/components/dashboard/booking-form-panel";
import {
  DayCalendar,
  MonthCalendar,
  WeekCalendar,
} from "@/components/dashboard/calendar-grids";
import { CalendarToolbar } from "@/components/dashboard/calendar-toolbar";
import { CampLessonsSection } from "@/components/dashboard/camp-lessons-section";
import { DayDetailPanel } from "@/components/dashboard/day-detail-panel";
import { LoginForm } from "@/components/dashboard/login-form";
import {
  allLessonsFilter,
  type AppMode,
  type LessonFilter,
  type ViewMode,
} from "@/components/dashboard/types";
import { useBookingActions } from "@/components/dashboard/use-booking-actions";
import { useCalendarData } from "@/components/dashboard/use-calendar-data";
import { useNow } from "@/components/dashboard/use-now";
import { SiteShell } from "@/components/site-shell";
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
  createTimeSlots,
  formatDateKey,
  formatOpeningHoursForDate,
  getOpeningHoursForDate,
  getOpeningHoursGroups,
  getWeekDays,
  hallSettings,
  isCleanupSlot,
  isDepartureSlot,
  isSlotBooked,
  isSlotOpen,
  trainerOptions,
  type Booking,
  type BookingRequest,
} from "@/lib/schedule";

const initialRequest: BookingRequest = {
  name: "",
  date: "2026-05-20",
  start: "16:00",
  end: "18:00",
  eventType: "soustredeni",
  bookingKind: "hall",
  trainer: "",
  note: "",
  cleanupRequired: false,
};

const closedSlotState: SlotState = {
  booking: undefined,
  cleanupBooking: undefined,
  isDeparture: false,
  isOpen: false,
};

type BookingDashboardProps = {
  initialBookings: Booking[];
  initialDate: string;
  initialAppMode?: AppMode;
  initialRecurringCancellations: RecurringCancellationNotice[];
  initialRecurringOverrides: RecurringOverrideNotice[];
  initialSession: {
    authenticated: boolean;
    lessonFilter?: LessonFilter;
    role: AdminRole | null;
    username: string | null;
  };
};

export function BookingDashboard({
  initialBookings,
  initialDate,
  initialAppMode = "hall",
  initialRecurringCancellations,
  initialRecurringOverrides,
  initialSession,
}: BookingDashboardProps) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [appMode, setAppMode] = useState<AppMode>(initialAppMode);
  const [request, setRequest] = useState({ ...initialRequest, date: initialDate });
  const [submitMessage, setSubmitMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBookingFormOpen, setIsBookingFormOpen] = useState(false);
  const [selectedLessonTrainer, setSelectedLessonTrainer] = useState("");
  const [session, setSession] = useState({
    isAuthenticated: initialSession.authenticated,
    lessonFilter: initialSession.lessonFilter ?? allLessonsFilter,
    role: initialSession.role,
    username: initialSession.username,
  });
  const calendarScrollerRef = useRef<HTMLDivElement | null>(null);
  const bookingFormPanelRef = useRef<HTMLDivElement | null>(null);
  const bookingNameInputRef = useRef<HTMLInputElement | null>(null);
  const bookingTitleSelectRef = useRef<HTMLSelectElement | null>(null);
  const loginUsernameInputRef = useRef<HTMLInputElement | null>(null);

  const now = useNow();
  const calendar = useCalendarData({
    initialBookings,
    initialRecurringCancellations,
    initialRecurringOverrides,
  });
  const { syncCalendar } = calendar;
  const actions = useBookingActions(syncCalendar);

  const { isAuthenticated } = session;
  const canUseLessonMode = isAuthenticated || initialAppMode === "lessons";
  const activeAppMode: AppMode = canUseLessonMode ? appMode : "hall";
  const canManageBookings = isAuthenticated && canRoleManageBookings(session.role);
  const isMainAdmin = isAuthenticated && session.role === "admin";
  const shouldShowBookingPanel =
    (!isAuthenticated || canManageBookings) && isBookingFormOpen;
  const isExpandedBookingLayout = canManageBookings && isBookingFormOpen;
  const activeSlotMinutes =
    activeAppMode === "lessons" ? 45 : hallSettings.slotMinutes;
  const currentDateKey = now ? formatDateKey(now) : "";
  const currentTimeMinutes = now ? now.getHours() * 60 + now.getMinutes() : null;
  const todayDateKey = currentDateKey || initialDate;

  const days = useMemo(
    () => getWeekDays(getWeekStartDate(selectedDate)),
    [selectedDate],
  );
  const selectedMonthKey = `${selectedDate.slice(0, 7)}-01`;
  const monthDays = useMemo(() => getMonthDays(selectedMonthKey), [selectedMonthKey]);
  const activeModeBookings = useMemo(
    () =>
      calendar.bookings.filter((booking) =>
        activeAppMode === "lessons"
          ? booking.bookingKind === "individual-lesson"
          : booking.bookingKind !== "individual-lesson",
      ),
    [activeAppMode, calendar.bookings],
  );
  const selectedBookings = useMemo(
    () => activeModeBookings.filter((booking) => booking.date === selectedDate),
    [activeModeBookings, selectedDate],
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
  const activeLessonTrainer = availableTrainers.includes(selectedLessonTrainer)
    ? selectedLessonTrainer
    : availableTrainers[0] ?? "";

  // Rows cover the opening hours of every day the week and month views can
  // show, extended for bookings that start earlier or end later.
  const timeSlots = useMemo(() => {
    const visibleDateKeys = new Set([
      todayDateKey,
      ...days.map(formatDateKey),
      ...monthDays.map(formatDateKey),
    ]);

    return createTimeSlots(
      activeSlotMinutes,
      activeModeBookings
        .filter((booking) => visibleDateKeys.has(booking.date))
        .map((booking) => ({ end: booking.end, start: booking.start })),
    );
  }, [activeModeBookings, activeSlotMinutes, days, monthDays, todayDateKey]);
  const bookingDayCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const booking of activeModeBookings) {
      if (isCountableEvent(booking)) {
        counts.set(booking.date, (counts.get(booking.date) ?? 0) + 1);
      }
    }

    return counts;
  }, [activeModeBookings]);
  const weeklyEventCount = useMemo(() => {
    const weekDateKeys = new Set(days.map(formatDateKey));

    return activeModeBookings.filter(
      (booking) => weekDateKeys.has(booking.date) && isCountableEvent(booking),
    ).length;
  }, [activeModeBookings, days]);
  // Only the days the current view renders; the selected day is always among
  // them. The selected date is a dependency only in the day view, so clicking
  // around a week does not recompute every slot.
  const dayViewDateKey = viewMode === "today" ? selectedDate : "";
  const slotDateKeys = useMemo(
    () =>
      dayViewDateKey
        ? [dayViewDateKey]
        : (viewMode === "week" ? days : monthDays).map(formatDateKey),
    [dayViewDateKey, days, monthDays, viewMode],
  );
  const slotStateMap = useSlotStateMap({
    activeModeBookings,
    dateKeys: slotDateKeys,
    slotMinutes: activeSlotMinutes,
    timeSlots,
  });
  const getSlotState = (dateKey: string, time: string) =>
    slotStateMap.get(getSlotStateKey(dateKey, time)) ?? closedSlotState;
  const selectedDaySegments = useMemo(
    () =>
      getDayAvailabilitySegments(selectedDate, activeModeBookings, activeSlotMinutes),
    [activeModeBookings, activeSlotMinutes, selectedDate],
  );
  const freeHours =
    timeSlots.filter((time) => {
      const slot = getSlotState(selectedDate, time);

      return slot.isOpen && !slot.isDeparture && !slot.booking && !slot.cleanupBooking;
    }).length *
    (activeSlotMinutes / 60);
  const todaysOpeningHours = useMemo(() => formatOpeningHoursForDate(new Date()), []);
  const openingHoursGroups = useMemo(() => getOpeningHoursGroups(), []);
  const occupancyNotice = useMemo(
    () => getOccupancyNotice(selectedBookings, selectedDate, now),
    [selectedBookings, selectedDate, now],
  );

  // Jump to today once the client knows its own date (and again at midnight).
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSelectedDate(todayDateKey);
      setRequest((current) => ({ ...current, date: todayDateKey }));
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [todayDateKey]);

  useEffect(() => {
    if (!currentDateKey) {
      return undefined;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      scrollCurrentTimeIntoView(calendarScrollerRef.current);
    });
    const timeout = window.setTimeout(() => {
      scrollCurrentTimeIntoView(calendarScrollerRef.current);
    }, 360);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
    };
  }, [currentDateKey, selectedDate, viewMode]);

  function patchRequest(patch: Partial<BookingRequest>) {
    setSubmitMessage("");
    setRequest((current) => ({ ...current, ...patch }));
  }

  function selectDate(dateKey: string) {
    setSelectedDate(dateKey);
    patchRequest({ date: dateKey });
  }

  function selectSlot(dateKey: string, time: string, isFree: boolean) {
    setSelectedDate(dateKey);

    if (isFree) {
      patchRequest({ date: dateKey, start: time });
    }
  }

  function changeViewMode(nextViewMode: ViewMode) {
    setViewMode(nextViewMode);

    if (nextViewMode === "today" || nextViewMode === "month") {
      selectDate(todayDateKey);
    }
  }

  function changeDisplayedPeriod(offset: number) {
    const date = new Date(`${selectedDate}T12:00:00`);

    if (viewMode === "month") {
      date.setDate(1);
      date.setMonth(date.getMonth() + offset);
    } else {
      date.setDate(date.getDate() + (viewMode === "week" ? offset * 7 : offset));
    }

    const nextDateKey = formatDateKey(date);
    setSelectedDate(nextDateKey);
    setRequest((current) => ({ ...current, date: nextDateKey }));
  }

  function showCurrentPeriod() {
    setSelectedDate(todayDateKey);
    setRequest((current) => ({ ...current, date: todayDateKey }));
    window.setTimeout(() => {
      scrollCurrentTimeIntoView(calendarScrollerRef.current);
    }, 120);
  }

  function setWholeDayBooking() {
    const openingHours = getOpeningHoursForDate(new Date(`${request.date}T12:00:00`));

    if (!openingHours) {
      setSubmitMessage("V tento den není nastavena otevírací doba.");
      return;
    }

    patchRequest({ end: openingHours.end, start: openingHours.start });
  }

  function openBookingForm() {
    setSubmitMessage("");
    setIsBookingFormOpen(true);
    setRequest((current) => ({ ...current, bookingKind: "hall", date: selectedDate }));

    window.setTimeout(() => {
      if (window.matchMedia("(max-width: 1023px)").matches) {
        bookingFormPanelRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }, 0);

    window.setTimeout(() => {
      const target = canManageBookings
        ? bookingTitleSelectRef.current ?? bookingNameInputRef.current
        : loginUsernameInputRef.current;

      target?.focus({ preventScroll: true });
    }, 450);
  }

  function switchAppMode(nextMode: AppMode) {
    setAppMode(nextMode);
    setIsBookingFormOpen(false);

    if (nextMode === "lessons") {
      setViewMode("week");
    }

    setRequest((current) =>
      nextMode === "lessons"
        ? {
            ...current,
            bookingKind: "individual-lesson",
            cleanupRequired: false,
            eventType: "tanecni-lekce",
            trainer: activeLessonTrainer,
          }
        : {
            ...current,
            bookingKind: "hall",
            eventType: "soustredeni",
            trainer: "",
          },
    );
  }

  async function login(username: string, password: string) {
    try {
      await loginAdmin(username, password);
      const nextSession = await getAdminSession();

      setSession({
        isAuthenticated: true,
        lessonFilter: nextSession.lessonFilter ?? allLessonsFilter,
        role: nextSession.role ?? null,
        username: nextSession.username ?? username.trim(),
      });
    } catch (error) {
      return error instanceof Error ? error.message : "Přihlášení se nepodařilo.";
    }

    // Signed-in users also receive individual lessons, which anonymous
    // visitors do not.
    void syncCalendar();

    return null;
  }

  async function logout() {
    await logoutAdmin();
    setSession({
      isAuthenticated: false,
      lessonFilter: allLessonsFilter,
      role: null,
      username: null,
    });
    setSubmitMessage("");
    void syncCalendar();
  }

  async function submitBooking(bookingName: string) {
    setIsSubmitting(true);
    setSubmitMessage("");

    try {
      const response = await fetch("/api/booking-request", {
        body: JSON.stringify({
          ...request,
          bookingKind: activeAppMode === "lessons" ? "individual-lesson" : "hall",
          name: bookingName,
        }),
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
      }

      setSubmitMessage("Rezervace je uložena v databázi.");
      await syncCalendar();
    } finally {
      setIsSubmitting(false);
    }
  }

  const modeButtonClass = (mode: AppMode) =>
    `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 transition ${
      activeAppMode === mode
        ? "border-white/35 bg-white/20 text-white"
        : "border-white/20 bg-white/10 hover:bg-white/15"
    }`;
  const calendarProps = {
    bookingDayCounts,
    currentDateKey,
    currentTimeMinutes,
    getSlotState,
    onSelectDate: selectDate,
    onSelectSlot: selectSlot,
    scrollerRef: calendarScrollerRef,
    selectedDate,
    slotMinutes: activeSlotMinutes,
    timeSlots,
  };

  return (
    <SiteShell
      maxWidthClassName="max-w-[1840px]"
      contentClassName={`grid gap-5 px-4 py-5 transition-[grid-template-columns] duration-300 lg:grid-cols-[minmax(0,1fr)_320px] lg:pl-6 lg:pr-4 xl:pl-8 xl:pr-5 ${
        isExpandedBookingLayout
          ? "xl:grid-cols-[minmax(0,1fr)_minmax(560px,620px)] 2xl:grid-cols-[minmax(900px,1fr)_minmax(640px,760px)] 2xl:pl-12"
          : "xl:grid-cols-[minmax(0,1fr)_340px]"
      }`}
      description={<>Přehled dostupnosti sálu TK Koškovi pro volný trénink.</>}
      eyebrow={
        <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-[#d7e6ed]">
          <button
            className={modeButtonClass("hall")}
            onClick={() => switchAppMode("hall")}
            type="button"
          >
            <Sparkles size={15} />
            Rezervace sálu
          </button>
          {canUseLessonMode ? (
            <button
              className={modeButtonClass("lessons")}
              onClick={() => switchAppMode("lessons")}
              type="button"
            >
              <User size={15} />
              Soustředění
            </button>
          ) : (
            <span className="inline-flex items-center gap-2">
              <MapPin size={15} />
              {hallSettings.location}
            </span>
          )}
        </div>
      }
      infoPanel={{
        items: openingHoursGroups.map((group) => ({
          label: group.days,
          value: group.hours,
        })),
        sideContent: (
          <RecurringCancellationPanel
            cancellations={calendar.recurringCancellations}
            changes={calendar.recurringOverrides}
            isAuthenticated={isAuthenticated}
            onReinstate={actions.reinstate}
            reinstatingId={actions.pendingId.reinstating}
          />
        ),
        subtitle: "Pravidelný provoz sálu",
        title: "Otevírací doba",
      }}
      metrics={[
        { label: "Dnes volno", value: `${freeHours.toLocaleString("cs-CZ")} h` },
        { label: "Dnes otevřeno", value: todaysOpeningHours },
        ...(isAuthenticated
          ? [{ label: "Tento týden", value: formatEventCount(weeklyEventCount) }]
          : []),
      ]}
      title={activeAppMode === "lessons" ? "Soustředění" : "Dostupnost tanečního sálu"}
    >
      <div className="min-w-0 space-y-6">
        <CalendarToolbar
          activeAppMode={activeAppMode}
          onChangePeriod={changeDisplayedPeriod}
          onShowCurrentPeriod={showCurrentPeriod}
          onViewModeChange={changeViewMode}
          selectedDate={selectedDate}
          viewMode={viewMode}
        />

        {isAuthenticated ? (
          <AccountBar
            canManageBookings={canManageBookings}
            isBookingFormOpen={isBookingFormOpen}
            isMainAdmin={isMainAdmin}
            onLogout={logout}
            onOpenBookingForm={openBookingForm}
            showAddBooking={activeAppMode === "hall"}
            username={session.username}
          />
        ) : null}

        {activeAppMode === "lessons" ? (
          <CampLessonsSection
            accountFilter={session.lessonFilter}
            availableTrainers={availableTrainers}
            canImport={isMainAdmin}
            isAuthenticated={isAuthenticated}
            loginForm={<LoginForm onLogin={login} variant="lessons" />}
          />
        ) : (
          <>
            <div className="calendar-view-transition lg:hidden" key={`mobile-${viewMode}`}>
              <MobileCalendarSummary
                bookingDayCounts={bookingDayCounts}
                days={viewMode === "month" ? monthDays : days}
                onSelectDate={selectDate}
                selectedDate={selectedDate}
                viewMode={viewMode}
              />
            </div>
            <div
              className="calendar-view-transition hidden lg:block"
              key={`desktop-${viewMode}`}
            >
              {viewMode === "today" ? (
                <DayCalendar {...calendarProps} />
              ) : viewMode === "week" ? (
                <WeekCalendar {...calendarProps} days={days} />
              ) : (
                <MonthCalendar {...calendarProps} monthDays={monthDays} />
              )}
            </div>
          </>
        )}
      </div>

      <aside
        className={`flex flex-col gap-5 lg:max-h-[min(760px,calc(100svh-112px))] lg:overflow-y-auto lg:pr-1 ${
          isExpandedBookingLayout
            ? "xl:grid xl:max-h-none xl:grid-cols-[minmax(360px,1fr)_minmax(220px,260px)] xl:items-start xl:overflow-visible xl:pr-0 2xl:grid-cols-[minmax(420px,1fr)_minmax(260px,320px)]"
            : ""
        }`}
      >
        <DayDetailPanel
          actions={actions}
          availableTrainers={availableTrainers}
          bookings={calendar.bookings}
          canManageBookings={canManageBookings}
          className={isExpandedBookingLayout ? "lg:order-2" : "lg:order-1"}
          currentDateKey={currentDateKey}
          currentTimeMinutes={currentTimeMinutes}
          occupancyNotice={occupancyNotice}
          onLoginClick={
            activeAppMode === "hall" && !isAuthenticated && !isBookingFormOpen
              ? openBookingForm
              : undefined
          }
          segments={selectedDaySegments}
          selectedDate={selectedDate}
        />

        {shouldShowBookingPanel ? (
          <BookingFormPanel
            activeAppMode={activeAppMode}
            availableTrainers={availableTrainers}
            canManageBookings={canManageBookings}
            className={isExpandedBookingLayout ? "lg:order-1" : "lg:order-2"}
            isSubmitting={isSubmitting}
            loginForm={
              <LoginForm
                onLogin={login}
                usernameInputRef={loginUsernameInputRef}
                variant="panel"
              />
            }
            nameInputRef={bookingNameInputRef}
            onClearMessage={() => setSubmitMessage("")}
            onClose={() => setIsBookingFormOpen(false)}
            onLogout={logout}
            onRequestPatch={patchRequest}
            onSetWholeDay={setWholeDayBooking}
            onSubmit={submitBooking}
            onTrainerSelected={(trainer) => {
              if (activeAppMode === "lessons") {
                setSelectedLessonTrainer(trainer);
              }
            }}
            panelRef={bookingFormPanelRef}
            request={request}
            submitMessage={submitMessage}
            titleSelectRef={bookingTitleSelectRef}
            username={session.username}
          />
        ) : null}
      </aside>
    </SiteShell>
  );
}

// State of every rendered slot, computed once per data change instead of per
// cell render.
function useSlotStateMap({
  activeModeBookings,
  dateKeys,
  slotMinutes,
  timeSlots,
}: {
  activeModeBookings: Booking[];
  dateKeys: string[];
  slotMinutes: number;
  timeSlots: string[];
}) {
  const bookingsByDate = useMemo(() => {
    const groups = new Map<string, Booking[]>();

    for (const booking of activeModeBookings) {
      const dateBookings = groups.get(booking.date);

      if (dateBookings) {
        dateBookings.push(booking);
      } else {
        groups.set(booking.date, [booking]);
      }
    }

    return groups;
  }, [activeModeBookings]);
  const pendingCleanupBookings = useMemo(
    () =>
      activeModeBookings.filter(
        (booking) => booking.cleanupRequired && !booking.cleanedAt,
      ),
    [activeModeBookings],
  );

  return useMemo(() => {
    const states = new Map<string, SlotState>();

    for (const dateKey of dateKeys) {
      const date = new Date(`${dateKey}T12:00:00`);
      const dateBookings = bookingsByDate.get(dateKey) ?? [];

      for (const time of timeSlots) {
        const isOpen = isSlotOpen(date, time);
        const booking = isSlotBooked(dateBookings, dateKey, time, slotMinutes);
        const cleanupBooking =
          isOpen && !booking
            ? pendingCleanupBookings.find((candidate) =>
                isCleanupSlot(candidate, dateKey, time, activeModeBookings),
              )
            : undefined;

        states.set(getSlotStateKey(dateKey, time), {
          booking,
          cleanupBooking,
          isDeparture: isDepartureSlot(date, time, slotMinutes),
          isOpen,
        });
      }
    }

    return states;
  }, [
    activeModeBookings,
    bookingsByDate,
    dateKeys,
    pendingCleanupBookings,
    slotMinutes,
    timeSlots,
  ]);
}
