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

const dateLine =
  /^\s*(?:[\p{L}]+\s+)?(\d{1,2})\.\s*(\d{1,2})\.?(?:\s*(\d{4}))?\s*:?\s*$/u;
const timeLine =
  /^\s*(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})\s*(?:[-–—:]\s*)?(.*)$/;
const breakWords = /oběd|obed|coffee|káva|kafe|pauza|přestávka|prestavka|break|svačina/i;
const groupWords = /group|skupin/i;

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
