// The public lesson schedule of a visiting trainer, written as plain text the
// way it is usually sent around:
//
//   5.11.
//   10:00–10:45 – Bílý
//   13:00–13:45 – Oběd
//   18:00-19:00 - GROUP
//
// A line with a date starts a day; "from–to name" lines are rows (any dash,
// the dash before the name is optional). Anything else is kept as a note.
// Shared by the public page and the editor's preview.

export type ScheduleRowKind = "break" | "group" | "lesson" | "note";
export type ScheduleRow = {
  end?: string;
  kind: ScheduleRowKind;
  start?: string;
  text: string;
};
export type ScheduleDay = {
  // Missing when rows come before the first date.
  dateKey?: string;
  rows: ScheduleRow[];
};

export const maxScheduleTitleLength = 80;
export const maxScheduleBodyLength = 8000;

// Requests to cancel or move a lesson are accepted this long after the
// schedule is published.
export const scheduleRequestWindowMs = 24 * 60 * 60 * 1000;

export function scheduleRequestDeadline(publishedAt?: string) {
  const published = publishedAt ? Date.parse(publishedAt) : Number.NaN;

  return Number.isNaN(published) ? null : new Date(published + scheduleRequestWindowMs);
}

const dateLine =
  /^\s*(?:[\p{L}]+\s+)?(\d{1,2})\.\s*(\d{1,2})\.?(?:\s*(\d{4}))?\s*:?\s*$/u;
const timeLine =
  /^\s*(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})\s*(?:[-–—:]\s*)?(.*)$/;
const breakWords = /oběd|obed|coffee|káva|kafe|pauza|přestávka|prestavka|break|svačina/i;
// A lesson for everybody ("GROUP", "Seminář LAT"…), not one person's.
const groupWords = /group|skupin|semin[aá][rř]/i;

// `todayKey` (YYYY-MM-DD) picks the year for dates written without one: the
// one that puts the date closest to today.
export function parseSchedule(body: string, todayKey: string): ScheduleDay[] {
  const days: ScheduleDay[] = [];
  let current: ScheduleDay | null = null;

  for (const line of body.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const date = dateLine.exec(line);

    if (date) {
      const dateKey = toDateKey(Number(date[1]), Number(date[2]), date[3] ? Number(date[3]) : null, todayKey);

      if (dateKey) {
        current = { dateKey, rows: [] };
        days.push(current);
        continue;
      }
    }

    if (!current) {
      current = { rows: [] };
      days.push(current);
    }

    const time = timeLine.exec(line);

    if (time && isTime(time[1], time[2]) && isTime(time[3], time[4])) {
      const text = time[5].trim();

      current.rows.push({
        end: formatTime(time[3], time[4]),
        kind: breakWords.test(text) ? "break" : groupWords.test(text) ? "group" : "lesson",
        start: formatTime(time[1], time[2]),
        text,
      });
    } else {
      current.rows.push({ kind: "note", text: line.trim() });
    }
  }

  return days.filter((day) => day.rows.length > 0 || day.dateKey);
}

export type ScheduleBlock = {
  date: string;
  end: string;
  // Unique within the schedule: the date, plus the start time for the
  // day's other blocks.
  key: string;
  start: string;
  // A seminar's own name; the trainer's blocks are named after the schedule.
  title?: string;
};

// Blocks for the hall calendar. The trainer's time from the first lesson to
// the end of the last one is one block, breaks included; a seminar ("GROUP")
// is a block of its own and the trainer's time is cut around it.
export function getScheduleBlocks(days: ScheduleDay[]): ScheduleBlock[] {
  return days.flatMap((day) => {
    const date = day.dateKey;

    if (!date) {
      return [];
    }

    const timed = day.rows
      .filter((row) => row.start && row.end && row.start < row.end)
      .sort((a, b) => (a.start as string).localeCompare(b.start as string));
    const seminars = timed.filter((row) => row.kind === "group");
    const runs: ScheduleRow[][] = [[]];

    for (const row of timed) {
      if (row.kind === "group") {
        runs.push([]);
      } else {
        runs[runs.length - 1].push(row);
      }
    }

    const blocks: ScheduleBlock[] = [];

    // A run of only breaks is no time of the trainer's.
    for (const run of runs.filter((items) => items.some((row) => row.kind !== "break"))) {
      let start = run.map((row) => row.start as string).sort()[0];
      let end = run.map((row) => row.end as string).sort().at(-1) as string;

      for (const seminar of seminars) {
        const from = seminar.start as string;
        const until = seminar.end as string;

        if (from < end && until > start) {
          if (from <= start) {
            start = until;
          } else {
            end = from;
          }
        }
      }

      if (start < end) {
        blocks.push({ date, end, key: blocks.length === 0 ? date : `${date}-${start.replace(":", "")}`, start });
      }
    }

    for (const seminar of seminars) {
      const base = `${date}-seminar-${(seminar.start as string).replace(":", "")}`;
      const key = blocks.some((block) => block.key === base) ? `${base}-${blocks.length}` : base;

      blocks.push({ date, end: seminar.end as string, key, start: seminar.start as string, title: rowLabel(seminar) });
    }

    return blocks.sort((a, b) => a.start.localeCompare(b.start));
  });
}

// Names compare without case and extra spaces ("Novák" = "novák ").
export function nameKey(name: string) {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

// One lesson row of the schedule: day, start and name.
export function lessonKey(lesson: { date: string; lessonName: string; start: string }) {
  return `${lesson.date}|${lesson.start}|${nameKey(lesson.lessonName)}`;
}

// What a row shows: "GROUP" is called a seminar ("GROUP LAT" → "Seminář LAT").
export function rowLabel(row: ScheduleRow) {
  return row.kind === "group" ? row.text.replace(/\bgroup\b/gi, "Seminář") : row.text;
}

function isTime(hours: string, minutes: string) {
  return Number(hours) < 24 && Number(minutes) < 60;
}

function formatTime(hours: string, minutes: string) {
  return `${hours.padStart(2, "0")}:${minutes}`;
}

function toDateKey(day: number, month: number, year: number | null, todayKey: string) {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const todayYear = Number(todayKey.slice(0, 4));
  const today = Date.parse(`${todayKey}T12:00:00Z`);
  const candidates = (year ? [year] : [todayYear - 1, todayYear, todayYear + 1])
    .map((candidate) => new Date(Date.UTC(candidate, month - 1, day, 12)))
    // 31.11. and the like do not exist.
    .filter((date) => date.getUTCDate() === day);

  if (candidates.length === 0) {
    return null;
  }

  const closest = candidates.reduce((best, date) =>
    Math.abs(date.getTime() - today) < Math.abs(best.getTime() - today) ? date : best,
  );

  return closest.toISOString().slice(0, 10);
}
