import type { LessonFilter } from "@/components/dashboard/types";

export type ImportedLesson = {
  dateOrDay: string;
  end: string;
  name: string;
  start: string;
  trainer: string;
};

export function filterLessons(
  lessons: ImportedLesson[],
  {
    accountFilter,
    dancerQuery,
    day,
    trainer,
  }: {
    accountFilter: LessonFilter;
    dancerQuery: string;
    day: string;
    trainer: string;
  },
) {
  const normalizedDancerQuery = normalizeSearch(dancerQuery);
  const enforcedQuery =
    accountFilter.type === "all" ? "" : normalizeSearch(accountFilter.value);

  return lessons.filter((lesson) => {
    if (
      accountFilter.type === "trainer" &&
      !normalizeSearch(lesson.trainer).includes(enforcedQuery)
    ) {
      return false;
    }

    if (
      accountFilter.type === "dancer" &&
      !normalizeSearch(lesson.name).includes(enforcedQuery)
    ) {
      return false;
    }

    if (day && lesson.dateOrDay !== day) {
      return false;
    }

    if (trainer && lesson.trainer !== trainer) {
      return false;
    }

    return (
      !normalizedDancerQuery ||
      normalizeSearch(lesson.name).includes(normalizedDancerQuery)
    );
  });
}

export function groupLessonsByDay(lessons: ImportedLesson[]) {
  const groups = new Map<string, ImportedLesson[]>();

  for (const lesson of lessons) {
    const dayLessons = groups.get(lesson.dateOrDay) ?? [];
    dayLessons.push(lesson);
    groups.set(lesson.dateOrDay, dayLessons);
  }

  return [...groups.entries()].map(([dateOrDay, dayLessons]) => ({
    dateOrDay,
    lessons: dayLessons,
  }));
}

// Parses a block copied from Excel (tab, semicolon or comma separated). A
// header row is optional; without one, columns are recognised by content.
export function parsePastedLessonTable(
  pastedValue: string,
  trainers: string[],
): ImportedLesson[] {
  const rows = pastedValue
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => row.split(/\t|;|,/).map((cell) => cell.trim()));

  if (rows.length === 0) {
    return [];
  }

  const firstRow = rows[0].map(normalizeSearch);
  const hasHeader = firstRow.some((cell) =>
    ["datum", "den", "cas", "od", "trener", "par", "jmeno"].includes(cell),
  );
  const header = hasHeader ? firstRow : [];
  const bodyRows = hasHeader ? rows.slice(1) : rows;

  return bodyRows
    .map((cells) => {
      const timeCell =
        getCellByHeader(cells, header, ["cas", "od"]) ??
        cells.find((cell) => parseTimeRange(cell));
      const parsedTime = timeCell ? parseTimeRange(timeCell) : null;

      if (!parsedTime) {
        return null;
      }

      const trainer =
        getCellByHeader(cells, header, ["trener"]) ??
        cells.find((cell) =>
          trainers.some(
            (trainerName) => normalizeSearch(trainerName) === normalizeSearch(cell),
          ),
        ) ??
        "";
      const dateOrDay =
        getCellByHeader(cells, header, ["datum", "den"]) ??
        cells.find((cell) => cell !== timeCell && cell !== trainer) ??
        "";
      const name =
        getCellByHeader(cells, header, ["par", "jmeno"]) ??
        cells
          .filter((cell) => cell !== timeCell && cell !== trainer && cell !== dateOrDay)
          .join(" ")
          .trim();

      if (!trainer || !name) {
        return null;
      }

      return {
        dateOrDay,
        end: parsedTime.end,
        name,
        start: parsedTime.start,
        trainer,
      };
    })
    .filter((lesson): lesson is ImportedLesson => Boolean(lesson));
}

function getCellByHeader(cells: string[], header: string[], aliases: string[]) {
  const index = header.findIndex((cell) => aliases.includes(cell));

  return index >= 0 ? cells[index] : undefined;
}

function parseTimeRange(value: string) {
  const match = value.match(/(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/);

  if (!match) {
    return null;
  }

  return {
    end: `${match[3].padStart(2, "0")}:${match[4]}`,
    start: `${match[1].padStart(2, "0")}:${match[2]}`,
  };
}

// Case- and diacritics-insensitive, so "Barca" finds "Barča".
function normalizeSearch(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("cs-CZ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
