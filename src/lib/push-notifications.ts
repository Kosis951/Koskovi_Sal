import {
  getBookings,
  getRecurringCancellationNotices,
} from "@/lib/bookings-db";
import { readStoredAdminUsersSync } from "@/lib/auth";
import { parseSchedule, rowBelongsTo } from "@/lib/public-schedule";
import { getPublicSchedule } from "@/lib/public-schedule-db";
import {
  getLessonReminderDevices,
  isPushConfigured,
  prunePushState,
  readPushState,
  sendLessonReminder,
  sendToTopic,
  writePushState,
} from "@/lib/push";
import { getRelayUrl } from "@/lib/push-relay";
import type { Booking } from "@/lib/schedule";

// When the morning summary goes out, and after which hour changes to today
// are no longer announced (the hall closes at 22:00 at the latest).
const digestAtMinutes = 7 * 60;
const quietAfterMinutes = 22 * 60;
// How long before their own lesson dancers with the app are reminded.
const lessonReminderMinutes = 60;

// What subscribers hear about: today's hall bookings other than trainings,
// and today's cancelled trainings. `signature` changes when the entry does.
type TodayItem = {
  end: string;
  key: string;
  kind: "block" | "cancelled";
  signature: string;
  start: string;
  title: string;
};

type TodaySnapshot = { date: string; items: TodayItem[] };

const pragueFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  timeZone: "Europe/Prague",
  year: "numeric",
});

let running: Promise<void> = Promise.resolve();
let queuedTimer: ReturnType<typeof setTimeout> | null = null;

// Checks and sends due notifications. Runs every minute (see
// instrumentation.ts) and shortly after every change to bookings; runs never
// overlap.
export function runPushChecks() {
  running = running.then(checkNow).catch((error) => {
    console.error("[push] kontrola selhala:", error);
  });

  return running;
}

// Called after a booking changes; several quick edits end up in one check.
export function queuePushCheck() {
  if (!isPushConfigured() && !getRelayUrl()) {
    return;
  }

  if (queuedTimer) {
    clearTimeout(queuedTimer);
  }

  queuedTimer = setTimeout(() => {
    queuedTimer = null;
    void runPushChecks();
  }, 3000);
}

async function checkNow() {
  const now = getPragueNow();

  if (getRelayUrl()) {
    await checkLessons(now);
  }

  if (!isPushConfigured()) {
    return;
  }

  const bookings = await getBookings();

  await checkToday(now, bookings);
  await checkCleanups(now, bookings);

  if (now.minutes === 3 * 60) {
    prunePushState();
  }
}

async function checkToday(now: PragueNow, bookings: Booking[]) {
  const digestKey = `digest:${now.dateKey}`;
  const items = await readTodayItems(now.dateKey, bookings);

  if (!readPushState(digestKey)) {
    // Before the morning summary nothing is announced: it will contain it all.
    if (now.minutes < digestAtMinutes) {
      return;
    }

    writeSnapshot({ date: now.dateKey, items });
    writePushState(digestKey, new Date().toISOString());

    if (items.length > 0 && now.minutes < quietAfterMinutes) {
      await sendToTopic("hall", {
        body: items.map(formatItem).join("\n"),
        tag: `today-${now.dateKey}`,
        title: items.some((item) => item.kind === "block")
          ? "Dnes je sál obsazený"
          : "Dnes odpadá trénink",
        url: "/",
      });
    }

    return;
  }

  const previous = readSnapshot();
  const previousItems = previous?.date === now.dateKey ? previous.items : [];
  const lines = describeChanges(previousItems, items);

  if (lines.length === 0) {
    return;
  }

  writeSnapshot({ date: now.dateKey, items });

  if (now.minutes < quietAfterMinutes) {
    await sendToTopic("hall", {
      body: lines.join("\n"),
      title: "Změna v sále dnes",
      url: "/",
    });
  }
}

// A booking that asked for cleanup has ended today and nobody has confirmed it.
async function checkCleanups(now: PragueNow, bookings: Booking[]) {
  const ended = bookings.filter(
    (booking) =>
      booking.cleanupRequired &&
      !booking.cleanedAt &&
      booking.date === now.dateKey &&
      toMinutes(booking.end) <= now.minutes,
  );

  for (const booking of ended) {
    const key = `cleanup:${booking.id}`;

    if (readPushState(key)) {
      continue;
    }

    writePushState(key, new Date().toISOString());
    await sendToTopic("cleanup", {
      body: `Po akci ${booking.title} (${booking.start}–${booking.end}). Po úklidu to prosím potvrďte v aplikaci.`,
      tag: key,
      title: "Sál čeká na úklid",
      url: "/",
    });
  }
}

// An hour before a lesson in the visiting trainer's published schedule, the
// phones of the dancer's account get a reminder (and iPhones a countdown).
async function checkLessons(now: PragueNow) {
  const devices = getLessonReminderDevices();

  if (devices.length === 0) {
    return;
  }

  const schedule = getPublicSchedule();
  const today = schedule.published
    ? parseSchedule(schedule.body, now.dateKey).find((day) => day.dateKey === now.dateKey)
    : undefined;

  if (!today) {
    return;
  }

  const names = new Map(
    readStoredAdminUsersSync()
      .filter((user) => !user.deleted && user.scheduleName?.trim())
      .map((user) => [user.username, user.scheduleName!.trim()]),
  );

  for (const row of today.rows) {
    if (row.kind !== "lesson" || !row.start || !row.end) {
      continue;
    }

    const minutesLeft = toMinutes(row.start) - now.minutes;

    if (minutesLeft <= 0 || minutesLeft > lessonReminderMinutes) {
      continue;
    }

    const due = devices.filter((device) => {
      const name = names.get(device.username!);
      return name && rowBelongsTo(row.text, name) && !readPushState(lessonKey(device.token, now.dateKey, row.start!));
    });

    if (due.length === 0) {
      continue;
    }

    for (const device of due) {
      writePushState(lessonKey(device.token, now.dateKey, row.start), new Date().toISOString());
    }

    const time = `${row.start}–${row.end}`;
    const delivered = await sendLessonReminder(due, {
      body: `${time} · ${row.text}`,
      lesson: {
        endsAt: pragueEpoch(now.dateKey, row.end),
        startsAt: pragueEpoch(now.dateKey, row.start),
        time,
        title: schedule.title || "Lekce",
      },
      tag: `lesson-${now.dateKey}-${row.start}`,
      title: minutesLeft >= 55 ? "Za hodinu máš lekci" : `Za ${minutesLeft} min máš lekci`,
      url: "/rozpis",
    });

    console.info(`[push] lekce ${time} ${row.text} → ${delivered}/${due.length}`);
  }
}

function lessonKey(token: string, dateKey: string, start: string) {
  return `lesson:${dateKey}:${start}:${token.slice(-24)}`;
}

// Unix seconds of a Prague date and time.
function pragueEpoch(dateKey: string, time: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hours, minutes);
  const parts = Object.fromEntries(
    pragueFormatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]),
  );
  const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);

  return Math.round((guess - (shown - guess)) / 1000);
}

async function readTodayItems(dateKey: string, bookings: Booking[]): Promise<TodayItem[]> {
  const blocks = bookings
    .filter(
      (booking) =>
        booking.date === dateKey &&
        !booking.id.startsWith("recurring-") &&
        booking.bookingKind !== "individual-lesson",
    )
    .map(
      (booking): TodayItem => ({
        end: booking.end,
        key: `block:${booking.id}`,
        kind: "block",
        signature: [booking.start, booking.end, booking.title, booking.status].join("|"),
        start: booking.start,
        title: booking.title,
      }),
    );
  const cancelled = (await getRecurringCancellationNotices())
    .filter((notice) => notice.date === dateKey)
    .map(
      (notice): TodayItem => ({
        end: notice.end,
        key: `cancelled:${notice.id}`,
        kind: "cancelled",
        signature: [notice.start, notice.end, notice.title].join("|"),
        start: notice.start,
        title: notice.title,
      }),
    );

  return [...blocks, ...cancelled].sort((left, right) => left.start.localeCompare(right.start));
}

function describeChanges(previous: TodayItem[], current: TodayItem[]) {
  const previousByKey = new Map(previous.map((item) => [item.key, item]));
  const currentKeys = new Set(current.map((item) => item.key));
  const lines: string[] = [];

  for (const item of current) {
    const before = previousByKey.get(item.key);

    if (!before) {
      lines.push(item.kind === "block" ? `Nově: ${formatTime(item)}` : `Odpadá: ${formatTime(item)}`);
    } else if (before.signature !== item.signature) {
      lines.push(`Změna: ${formatTime(item)}`);
    }
  }

  for (const item of previous) {
    if (!currentKeys.has(item.key)) {
      lines.push(
        item.kind === "block"
          ? `Zrušeno: ${formatTime(item)}`
          : `Trénink se koná: ${formatTime(item)}`,
      );
    }
  }

  return lines;
}

function formatItem(item: TodayItem) {
  return item.kind === "block" ? formatTime(item) : `Odpadá: ${formatTime(item)}`;
}

function formatTime(item: TodayItem) {
  return `${item.start}–${item.end} ${item.title}`;
}

function readSnapshot(): TodaySnapshot | null {
  const value = readPushState("today");

  try {
    return value ? (JSON.parse(value) as TodaySnapshot) : null;
  } catch {
    return null;
  }
}

function writeSnapshot(snapshot: TodaySnapshot) {
  writePushState("today", JSON.stringify(snapshot));
}

type PragueNow = { dateKey: string; minutes: number };

function getPragueNow(): PragueNow {
  const parts = Object.fromEntries(
    pragueFormatter.formatToParts(new Date()).map((part) => [part.type, part.value]),
  );

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}
