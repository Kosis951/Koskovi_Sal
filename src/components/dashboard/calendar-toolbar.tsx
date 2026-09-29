import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import {
  dayFormatter,
  getWeekStartDate,
  monthLabelFormatter,
} from "@/components/booking-dashboard-utils";
import type { AppMode, ViewMode } from "@/components/dashboard/types";
import { ThemeToggle } from "@/components/theme-toggle";

const weekControlFormatter = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "numeric",
});

const viewModeButtons: Array<{ icon: typeof Clock3; label: string; mode: ViewMode }> = [
  { icon: Clock3, label: "Den", mode: "today" },
  { icon: CalendarDays, label: "Týden", mode: "week" },
  { icon: CalendarDays, label: "Měsíc", mode: "month" },
];

const previousLabels: Record<ViewMode, string> = {
  month: "Předchozí měsíc",
  today: "Předchozí den",
  week: "Předchozí týden",
};

const nextLabels: Record<ViewMode, string> = {
  month: "Další měsíc",
  today: "Další den",
  week: "Další týden",
};

export function CalendarToolbar({
  activeAppMode,
  onChangePeriod,
  onShowCurrentPeriod,
  onViewModeChange,
  selectedDate,
  viewMode,
}: {
  activeAppMode: AppMode;
  onChangePeriod: (offset: number) => void;
  onShowCurrentPeriod: () => void;
  onViewModeChange: (viewMode: ViewMode) => void;
  selectedDate: string;
  viewMode: ViewMode;
}) {
  const isHall = activeAppMode === "hall";
  const selectedDateObject = new Date(`${selectedDate}T12:00:00`);

  return (
    <div className="flex flex-col gap-4 border-b border-[#ded6c9] pb-5 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-xl font-semibold">
          {!isHall
            ? "Soustředění"
            : viewMode === "today"
              ? `Denní dostupnost - ${dayFormatter.format(selectedDateObject)}`
              : viewMode === "week"
                ? "Týdenní dostupnost"
                : `Měsíční dostupnost - ${monthLabelFormatter.format(selectedDateObject)}`}
        </h2>
        <p className="mt-1 text-sm text-[#66706f]">
          {!isHall
            ? "Rozpis pro soustředění se vytváří importem z Excelu."
            : viewMode === "week"
              ? "Kliknutím na den zobrazíš rychlý detail a volné časy."
              : "Dny jsou pod sebou, časy najdeš v horní hlavičce tabulky."}
        </p>
      </div>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
        {isHall ? (
          <>
            <label className="mobile-view-select field-label">
              Volba časového rozmezí:
              <select
                className="field-input mt-1"
                onChange={(event) => onViewModeChange(event.target.value as ViewMode)}
                value={viewMode}
              >
                <option value="today">Den</option>
                <option value="week">Týden</option>
                <option value="month">Měsíc</option>
              </select>
            </label>
            <div className="hidden h-10 overflow-hidden rounded-md border border-[#ded6c9] bg-white sm:inline-flex md:h-11">
              {viewModeButtons.map(({ icon: Icon, label, mode }, index) => (
                <button
                  className={`inline-flex items-center gap-1.5 px-2 text-xs font-semibold transition md:gap-2 md:px-3 md:text-sm ${
                    index > 0 ? "border-l border-[#ded6c9]" : ""
                  } ${
                    viewMode === mode
                      ? "bg-[#003758] text-white"
                      : "text-[#35505b] hover:bg-[#f6f1e8]"
                  }`}
                  key={mode}
                  onClick={() => onViewModeChange(mode)}
                  type="button"
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
          </>
        ) : null}
        <div className="flex w-full items-center gap-3 sm:w-auto">
          <ThemeToggle />
          {isHall ? (
            <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-md border border-[#ded6c9] bg-white sm:flex-none">
              <button
                aria-label={previousLabels[viewMode]}
                className="inline-flex h-11 w-10 shrink-0 items-center justify-center text-[#003758] transition hover:bg-[#f6f1e8]"
                onClick={() => onChangePeriod(-1)}
                type="button"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="inline-flex h-11 min-w-0 flex-1 items-center justify-center border-x border-[#ded6c9] px-3 text-sm font-semibold capitalize text-[#003758] transition hover:bg-[#f6f1e8] sm:min-w-36"
                onClick={onShowCurrentPeriod}
                type="button"
              >
                <span className="truncate">
                  {getPeriodLabel(viewMode, selectedDate, selectedDateObject)}
                </span>
              </button>
              <button
                aria-label={nextLabels[viewMode]}
                className="inline-flex h-11 w-10 shrink-0 items-center justify-center text-[#003758] transition hover:bg-[#f6f1e8]"
                onClick={() => onChangePeriod(1)}
                type="button"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function getPeriodLabel(
  viewMode: ViewMode,
  selectedDate: string,
  selectedDateObject: Date,
) {
  if (viewMode === "month") {
    return monthLabelFormatter.format(selectedDateObject);
  }

  if (viewMode === "week") {
    const weekStart = getWeekStartDate(selectedDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    return `${weekControlFormatter.format(weekStart)}-${weekControlFormatter.format(
      weekEnd,
    )}`;
  }

  return dayFormatter.format(selectedDateObject);
}
