import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { getWeekStartDate, monthLabelFormatter } from "@/components/booking-dashboard-utils";
import type { ViewMode } from "@/components/dashboard/types";
import { buttonPrimary } from "@/components/ui/styles";

const shortDateFormatter = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "numeric",
});
const longDayFormatter = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "long",
  weekday: "long",
});

const viewModes: Array<{ label: string; mode: ViewMode }> = [
  { label: "Den", mode: "today" },
  { label: "Týden", mode: "week" },
  { label: "Měsíc", mode: "month" },
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
  isShowingToday,
  onAddBooking,
  onChangePeriod,
  onShowToday,
  onViewModeChange,
  selectedDate,
  viewMode,
}: {
  isShowingToday: boolean;
  // Omitted for accounts that cannot add bookings.
  onAddBooking?: () => void;
  onChangePeriod: (offset: number) => void;
  onShowToday: () => void;
  onViewModeChange: (viewMode: ViewMode) => void;
  selectedDate: string;
  viewMode: ViewMode;
}) {
  const iconButton =
    "inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted transition hover:bg-subtle hover:text-ink";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center">
        <button
          aria-label={previousLabels[viewMode]}
          className={iconButton}
          onClick={() => onChangePeriod(-1)}
          type="button"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          aria-label={nextLabels[viewMode]}
          className={iconButton}
          onClick={() => onChangePeriod(1)}
          type="button"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <h2 className="min-w-0 text-base font-semibold capitalize text-ink sm:text-lg">
        {getPeriodLabel(viewMode, selectedDate)}
      </h2>
      {!isShowingToday ? (
        <button
          className="h-8 rounded-md border border-line-strong px-2.5 text-xs font-semibold text-ink transition hover:bg-subtle"
          onClick={onShowToday}
          type="button"
        >
          Dnes
        </button>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        <div className="inline-flex rounded-lg border border-line bg-subtle p-0.5">
          {viewModes.map(({ label, mode }) => (
            <button
              aria-pressed={viewMode === mode}
              className={`h-8 rounded-md px-3 text-sm font-semibold transition ${
                viewMode === mode
                  ? "bg-surface text-ink shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
              key={mode}
              onClick={() => onViewModeChange(mode)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        {onAddBooking ? (
          <span className="hidden lg:block">
            <button className={buttonPrimary} onClick={onAddBooking} type="button">
              <Plus size={16} />
              Přidat akci
            </button>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function getPeriodLabel(viewMode: ViewMode, selectedDate: string) {
  const date = new Date(`${selectedDate}T12:00:00`);

  if (viewMode === "month") {
    return monthLabelFormatter.format(date);
  }

  if (viewMode === "week") {
    const weekStart = getWeekStartDate(selectedDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    return `${shortDateFormatter.format(weekStart)} – ${shortDateFormatter.format(weekEnd)} ${weekEnd.getFullYear()}`;
  }

  return longDayFormatter.format(date);
}
