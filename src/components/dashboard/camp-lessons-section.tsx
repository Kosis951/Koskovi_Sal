import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { formatEventCount } from "@/components/booking-dashboard-utils";
import {
  filterLessons,
  groupLessonsByDay,
  parsePastedLessonTable,
  type ImportedLesson,
} from "@/components/dashboard/camp-lessons";
import type { LessonFilter } from "@/components/dashboard/types";

// Camp schedule ("Soustředění"): a read-only lesson list for signed-in users,
// filtered by the account's own restriction, plus import tools for the admin.
export function CampLessonsSection({
  accountFilter,
  availableTrainers,
  canImport,
  isAuthenticated,
  loginForm,
}: {
  accountFilter: LessonFilter;
  availableTrainers: string[];
  canImport: boolean;
  isAuthenticated: boolean;
  loginForm: ReactNode;
}) {
  const [storedLessons, setStoredLessons] = useState<ImportedLesson[]>([]);
  const [pastedTable, setPastedTable] = useState("");
  // Empty means the server's configured default sheet.
  const [googleSheetUrl, setGoogleSheetUrl] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [dayFilter, setDayFilter] = useState("");
  const [trainerFilter, setTrainerFilter] = useState("");
  const [dancerFilter, setDancerFilter] = useState("");

  const pastedLessons = useMemo(
    () => parsePastedLessonTable(pastedTable, availableTrainers),
    [availableTrainers, pastedTable],
  );
  // A pasted table previews instead of the stored schedule until it is saved.
  const displayedLessons =
    pastedTable && pastedLessons.length > 0 ? pastedLessons : storedLessons;
  const campDays = useMemo(
    () => [...new Set(displayedLessons.map((lesson) => lesson.dateOrDay))],
    [displayedLessons],
  );
  const campTrainers = useMemo(
    () =>
      [...new Set(displayedLessons.map((lesson) => lesson.trainer))].sort(
        (left, right) => left.localeCompare(right, "cs-CZ"),
      ),
    [displayedLessons],
  );
  const filteredLessons = useMemo(
    () =>
      filterLessons(displayedLessons, {
        accountFilter,
        dancerQuery: dancerFilter,
        day: dayFilter,
        trainer: trainerFilter,
      }),
    [accountFilter, dancerFilter, dayFilter, displayedLessons, trainerFilter],
  );
  const groupedLessons = useMemo(
    () => groupLessonsByDay(filteredLessons),
    [filteredLessons],
  );

  const loadStoredLessons = useCallback(async () => {
    const response = await fetch("/api/individual-lessons", { cache: "no-store" });

    if (!response.ok) {
      setStoredLessons([]);
      return;
    }

    const data = (await response.json()) as { lessons?: ImportedLesson[] };
    setStoredLessons(data.lessons ?? []);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      void loadStoredLessons();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [isAuthenticated, loadStoredLessons]);

  async function saveLessons(
    url: string,
    body: unknown,
    fallback: { error: string; success: string },
    fallbackLessons: ImportedLesson[],
  ) {
    setImportMessage("");
    setIsImporting(true);

    try {
      const response = await fetch(url, {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as {
        lessons?: ImportedLesson[];
        message?: string;
      };

      if (!response.ok) {
        setImportMessage(data.message ?? fallback.error);
        return;
      }

      setStoredLessons(data.lessons ?? fallbackLessons);
      setPastedTable("");
      setImportMessage(data.message ?? fallback.success);
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <section className="rounded-lg border border-[#ded6c9] bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-[#66706f]">Soustředění</p>
          <h3 className="mt-1 text-xl font-semibold">Rozpis lekcí ze soustředění</h3>
        </div>
        <span className="rounded-full bg-[#e7f1f6] px-3 py-1 text-xs font-semibold text-[#003758]">
          {formatEventCount(filteredLessons.length)}
        </span>
      </div>

      {!isAuthenticated ? (
        <div className="mt-4 rounded-md border border-[#ded6c9] bg-[#fcfaf6] p-4">
          <h4 className="text-lg font-semibold">Přihlášení k soustředění</h4>
          <p className="mt-1 text-sm leading-6 text-[#66706f]">
            Rozpis lekcí je dostupný po přihlášení. Po přihlášení se
            automaticky zobrazí jen lekce povolené pro tvůj účet.
          </p>
          {loginForm}
        </div>
      ) : (
        <>
          {accountFilter.type !== "all" ? (
            <p className="mt-3 rounded-md border border-[#d8eadf] bg-[#f3fbf5] px-3 py-2 text-sm text-[#245d3f]">
              Zobrazení je omezené filtrem účtu:{" "}
              {accountFilter.type === "trainer" ? "trenér" : "tanečník"}{" "}
              <strong>{accountFilter.value}</strong>.
            </p>
          ) : null}

          {canImport ? (
            <div className="mt-4 grid gap-3 rounded-md border border-[#ded6c9] bg-[#fcfaf6] p-3">
              <label className="field-label">
                Google tabulka
                <input
                  className="field-input mt-1"
                  onChange={(event) => setGoogleSheetUrl(event.target.value)}
                  placeholder="Prázdné = výchozí tabulka soustředění"
                  value={googleSheetUrl}
                />
              </label>
              <button
                className="inline-flex h-10 items-center justify-center rounded-md bg-[#003758] px-4 text-sm font-semibold text-white transition hover:bg-[#0b4d76] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isImporting}
                onClick={() =>
                  saveLessons(
                    "/api/individual-lessons/import-google",
                    { url: googleSheetUrl },
                    {
                      error: "Import z Google tabulky se nepodařil.",
                      success: "Rozpis soustředění je naimportovaný.",
                    },
                    [],
                  )
                }
                type="button"
              >
                {isImporting ? "Importuji..." : "Importovat z Google tabulky"}
              </button>
              <textarea
                className="field-input min-h-28 w-full resize-y"
                onChange={(event) => setPastedTable(event.target.value)}
                placeholder={
                  "Zkopíruj oblast z Excelu a vlož ji sem.\nIdeálně sloupce: Datum/den, Čas, Trenér, Pár"
                }
                value={pastedTable}
              />
              <button
                className="inline-flex h-10 items-center justify-center rounded-md border border-[#003758] px-4 text-sm font-semibold text-[#003758] transition hover:bg-[#eef7fb] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={pastedLessons.length === 0 || isImporting}
                onClick={() =>
                  saveLessons(
                    "/api/individual-lessons",
                    { lessons: pastedLessons },
                    {
                      error: "Import se nepodařilo uložit.",
                      success: "Rozpis je uložený.",
                    },
                    pastedLessons,
                  )
                }
                type="button"
              >
                {isImporting ? "Ukládám..." : "Uložit rozpis z Excelu"}
              </button>
            </div>
          ) : null}

          {importMessage ? (
            <p className="mt-3 rounded-md border border-[#cde6d9] bg-[#f4fbf7] px-3 py-2 text-sm text-[#245d3f]">
              {importMessage}
            </p>
          ) : null}

          {displayedLessons.length > 0 ? (
            <>
              <div className="mt-4 grid gap-3 rounded-md border border-[#ded6c9] bg-[#fcfaf6] p-3 md:grid-cols-3">
                <label className="field-label">
                  Den soustředění
                  <select
                    className="field-input mt-1"
                    onChange={(event) => setDayFilter(event.target.value)}
                    value={dayFilter}
                  >
                    <option value="">Všechny dny</option>
                    {campDays.map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Trenér
                  <select
                    className="field-input mt-1"
                    onChange={(event) => setTrainerFilter(event.target.value)}
                    value={trainerFilter}
                  >
                    <option value="">Všichni trenéři</option>
                    {campTrainers.map((trainer) => (
                      <option key={trainer} value={trainer}>
                        {trainer}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Tanečník / pár
                  <input
                    className="field-input mt-1"
                    onChange={(event) => setDancerFilter(event.target.value)}
                    placeholder="Hledat jméno"
                    value={dancerFilter}
                  />
                </label>
              </div>
              <div className="mt-4 grid gap-3 md:hidden">
                {groupedLessons.map((group) => (
                  <article
                    className="overflow-hidden rounded-md border border-[#ded6c9] bg-[#fcfaf6]"
                    key={group.dateOrDay}
                  >
                    <div className="bg-[#003758] px-4 py-3 text-white">
                      <p className="text-xs font-semibold uppercase tracking-normal text-white/75">
                        Den soustředění
                      </p>
                      <h4 className="mt-1 text-lg font-semibold">{group.dateOrDay}</h4>
                    </div>
                    <div className="divide-y divide-[#ece3d5]">
                      {group.lessons.map((lesson, index) => (
                        <div
                          className="grid gap-2 px-4 py-3"
                          key={`${lesson.dateOrDay}-${lesson.start}-${lesson.trainer}-${lesson.name}-${index}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-base font-semibold text-[#132935]">
                                {lesson.name}
                              </p>
                              <p className="mt-1 text-sm text-[#66706f]">
                                {lesson.trainer}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-[#e7f1f6] px-3 py-1 text-sm font-semibold text-[#003758]">
                              {lesson.start}-{lesson.end}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
              <div className="mt-4 hidden overflow-hidden rounded-md border border-[#ded6c9] md:block">
                <div className="grid grid-cols-[1fr_96px_1fr_1.2fr] bg-[#003758] text-xs font-semibold uppercase text-white">
                  <div className="px-3 py-2">Den</div>
                  <div className="px-3 py-2">Čas</div>
                  <div className="px-3 py-2">Trenér</div>
                  <div className="px-3 py-2">Pár</div>
                </div>
                {filteredLessons.map((lesson, index) => (
                  <div
                    className="grid grid-cols-[1fr_96px_1fr_1.2fr] border-t border-[#ece3d5] text-sm"
                    key={`${lesson.dateOrDay}-${lesson.start}-${lesson.trainer}-${index}`}
                  >
                    <div className="min-w-0 px-3 py-2 font-semibold">{lesson.dateOrDay}</div>
                    <div className="px-3 py-2 text-[#246043]">
                      {lesson.start}-{lesson.end}
                    </div>
                    <div className="min-w-0 px-3 py-2">{lesson.trainer}</div>
                    <div className="min-w-0 px-3 py-2 font-semibold">{lesson.name}</div>
                  </div>
                ))}
              </div>
              {filteredLessons.length === 0 ? (
                <p className="mt-3 rounded-md border border-[#edd3cc] bg-[#fff0eb] px-3 py-2 text-sm text-[#8c2f20]">
                  Pro zadaný filtr není žádná lekce.
                </p>
              ) : null}
            </>
          ) : pastedTable ? (
            <p className="mt-3 rounded-md border border-[#edd3cc] bg-[#fff0eb] px-3 py-2 text-sm text-[#8c2f20]">
              Z vložené tabulky se zatím nepodařilo rozpoznat žádné lekce.
            </p>
          ) : (
            <p className="mt-4 rounded-md border border-[#d8eadf] bg-[#f3fbf5] p-4 text-sm text-[#246043]">
              Zatím není uložený žádný rozpis soustředění.
            </p>
          )}
        </>
      )}
    </section>
  );
}
