import { LockKeyhole, LogOut, Send, ShieldCheck, User, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { Field } from "@/components/booking-dashboard-panels";
import type { AppMode } from "@/components/dashboard/types";
import type { BookingRequest } from "@/lib/schedule";

const hallTitlePresets = ["Seminář", "Soustředění"];
const customHallTitle = "custom";

// Booking form for managers; anyone else sees the login form in its place.
export function BookingFormPanel({
  activeAppMode,
  availableTrainers,
  canManageBookings,
  className,
  isSubmitting,
  loginForm,
  nameInputRef,
  onClearMessage,
  onClose,
  onLogout,
  onRequestPatch,
  onSetWholeDay,
  onSubmit,
  onTrainerSelected,
  panelRef,
  request,
  submitMessage,
  titleSelectRef,
  username,
}: {
  activeAppMode: AppMode;
  availableTrainers: string[];
  canManageBookings: boolean;
  className: string;
  isSubmitting: boolean;
  loginForm: ReactNode;
  nameInputRef: RefObject<HTMLInputElement | null>;
  onClearMessage: () => void;
  onClose: () => void;
  onLogout: () => void;
  onRequestPatch: (patch: Partial<BookingRequest>) => void;
  onSetWholeDay: () => void;
  onSubmit: (bookingName: string) => void;
  onTrainerSelected: (trainer: string) => void;
  panelRef: RefObject<HTMLDivElement | null>;
  request: BookingRequest;
  submitMessage: string;
  titleSelectRef: RefObject<HTMLSelectElement | null>;
  username: string | null;
}) {
  const [hallTitleChoice, setHallTitleChoice] = useState(hallTitlePresets[0]);
  const isHall = activeAppMode === "hall";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(
      isHall && hallTitleChoice !== customHallTitle
        ? hallTitleChoice
        : request.name.trim(),
    );
  }

  return (
    <div
      className={`booking-panel-transition scroll-mt-4 rounded-lg border border-[#ded6c9] bg-white p-5 ${className}`}
      ref={panelRef}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">
            {isHall ? "Rezervace sálu" : "Rezervace individuální lekce"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#66706f]">
            Vkládání rezervací je dostupné jen po přihlášení oprávněného uživatele.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LockKeyhole className="text-[#003758]" size={21} />
          {isHall ? (
            <button
              aria-label="Zavřít rezervační formulář"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#ded6c9] text-[#003758] transition hover:bg-[#f6f1e8]"
              onClick={onClose}
              title="Zavřít rezervační formulář"
              type="button"
            >
              <X size={17} />
            </button>
          ) : null}
        </div>
      </div>

      {!canManageBookings ? (
        loginForm
      ) : (
        <form className="mt-5" onSubmit={handleSubmit}>
          <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-[#d8eadf] bg-[#f3fbf5] p-3 text-sm text-[#245d3f]">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck size={17} />
              Jsi přihlášen jako: {username ?? "uživatel"}
            </span>
            <button
              className="inline-flex items-center gap-1.5 rounded-md border border-[#c9ded0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#245d3f] transition hover:bg-[#eef8f2]"
              onClick={onLogout}
              type="button"
            >
              <LogOut size={14} />
              Odhlásit
            </button>
          </div>

          <div className="grid gap-3">
            {isHall ? (
              <>
                <Field icon={<User size={16} />} label="Název akce">
                  <select
                    className="field-input"
                    onChange={(event) => {
                      const choice = event.target.value;

                      onClearMessage();
                      setHallTitleChoice(choice);

                      if (choice === customHallTitle) {
                        window.setTimeout(() => nameInputRef.current?.focus(), 0);
                      }
                    }}
                    ref={titleSelectRef}
                    value={hallTitleChoice}
                  >
                    {hallTitlePresets.map((title) => (
                      <option key={title} value={title}>
                        {title}
                      </option>
                    ))}
                    <option value={customHallTitle}>Vlastní</option>
                  </select>
                </Field>
                {hallTitleChoice === customHallTitle ? (
                  <label className="field-label">
                    Vlastní název akce
                    <input
                      className="field-input mt-1"
                      onChange={(event) => onRequestPatch({ name: event.target.value })}
                      placeholder="Např. workshop, kurz nebo jméno pořadatele"
                      ref={nameInputRef}
                      required
                      value={request.name}
                    />
                  </label>
                ) : null}
              </>
            ) : (
              <Field icon={<User size={16} />} label="Taneční pár">
                <input
                  className="field-input"
                  onChange={(event) => onRequestPatch({ name: event.target.value })}
                  placeholder="Jména tanečního páru"
                  ref={nameInputRef}
                  required
                  value={request.name}
                />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="field-label col-span-2">
                Datum
                <input
                  className="field-input mt-1"
                  onChange={(event) => onRequestPatch({ date: event.target.value })}
                  required
                  type="date"
                  value={request.date}
                />
              </label>
              <label className="field-label">
                Od
                <input
                  className="field-input mt-1"
                  onChange={(event) => onRequestPatch({ start: event.target.value })}
                  required
                  type="time"
                  value={request.start}
                />
              </label>
              <label className="field-label">
                Do
                <input
                  className="field-input mt-1"
                  onChange={(event) => onRequestPatch({ end: event.target.value })}
                  required
                  type="time"
                  value={request.end}
                />
              </label>
              {isHall ? (
                <>
                  <button
                    className="col-span-2 inline-flex min-h-10 items-center justify-center rounded-md border border-[#ded6c9] bg-[#fcfaf6] px-3 py-2 text-center text-sm font-semibold leading-5 text-[#003758] transition hover:bg-[#f6f1e8]"
                    onClick={onSetWholeDay}
                    type="button"
                  >
                    Zabookovat celý den podle otevírací doby
                  </button>
                  <label className="field-label col-span-2">
                    Typ
                    <select
                      className="field-input mt-1"
                      onChange={(event) => {
                        const eventType = event.target.value as BookingRequest["eventType"];

                        onRequestPatch({
                          eventType,
                          trainer: eventType === "seminar" ? request.trainer : "",
                        });
                      }}
                      value={request.eventType}
                    >
                      <option value="soustredeni">Soustředění</option>
                      <option value="seminar">Seminář</option>
                      <option value="obsazeno">Obsazeno</option>
                    </select>
                  </label>
                </>
              ) : (
                <div className="col-span-2 rounded-md border border-[#ded6c9] bg-[#fcfaf6] px-3 py-2 text-sm font-semibold text-[#43504f]">
                  Individuální lekce · sloty po 45 minutách
                </div>
              )}
              {request.eventType === "seminar" || !isHall ? (
                <label className="field-label col-span-2">
                  Trenér
                  <select
                    className="field-input mt-1"
                    onChange={(event) => {
                      onRequestPatch({ trainer: event.target.value });
                      onTrainerSelected(event.target.value);
                    }}
                    required={!isHall}
                    value={request.trainer}
                  >
                    <option value="">Bez vybraného trenéra</option>
                    {availableTrainers.map((trainer) => (
                      <option key={trainer} value={trainer}>
                        {trainer}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            <label className="field-label">
              Poznámka
              <textarea
                className="field-input mt-1 min-h-24 resize-none"
                onChange={(event) => onRequestPatch({ note: event.target.value })}
                placeholder="Počet lidí, příprava sálu, technika..."
                value={request.note}
              />
            </label>

            {isHall ? (
              <label className="flex items-start gap-3 rounded-md border border-[#ded6c9] bg-[#fcfaf6] p-3 text-sm font-semibold text-[#43504f]">
                <input
                  checked={Boolean(request.cleanupRequired)}
                  className="mt-1 h-4 w-4 accent-[#003758]"
                  onChange={(event) =>
                    onRequestPatch({ cleanupRequired: event.target.checked })
                  }
                  type="checkbox"
                />
                <span>
                  Sál po akci bude potřeba uklidit
                  <span className="mt-1 block text-xs font-medium text-[#66706f]">
                    Po konci akce se místo volna ukáže čekání na úklid, dokud ho
                    někdo nepotvrdí.
                  </span>
                </span>
              </label>
            ) : null}
          </div>

          {submitMessage ? (
            <div className="mt-4 flex items-start gap-3 rounded-md border border-[#cbe3d1] bg-[#f1faf2] p-3 text-sm text-[#245d3f]">
              <ShieldCheck size={18} />
              {submitMessage}
            </div>
          ) : null}

          <button
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#003758] px-4 text-sm font-semibold text-white transition hover:bg-[#0b4d76] disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting}
            type="submit"
          >
            <Send size={17} />
            {isSubmitting ? "Ukládám..." : "Uložit rezervaci"}
          </button>
        </form>
      )}
    </div>
  );
}
