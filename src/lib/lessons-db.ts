import { randomBytes, randomUUID } from "node:crypto";
import { getAdminUsers } from "@/lib/admin-users-db";
import { normalizeUsername } from "@/lib/auth";
import { getDb } from "@/lib/db";

// Trainers' lesson calendars. A trainer offers windows ("every Tuesday
// 14–16, lessons of 45 minutes" or one day); the windows are cut into lesson
// slots for the next weeks. A signed-in person requests a free slot, the
// trainer confirms or declines. Independent of the hall calendar.

// How far ahead slots are offered.
const horizonDays = 42;
const maxWindowsPerTrainer = 50;
const maxPendingPerRequester = 5;
export const maxLessonNoteLength = 300;
export const lessonLengths = [30, 45, 60, 90];

export type TrainerWindow = {
  // One-off windows have a date, weekly ones a weekday (1 = Monday … 7).
  date?: string;
  end: string;
  id: string;
  lessonMinutes: number;
  start: string;
  validFrom?: string;
  validUntil?: string;
  weekday?: number;
};
export type TrainerWindowInput = Omit<TrainerWindow, "id">;

export type LessonStatus = "cancelled" | "confirmed" | "declined" | "pending";
export type TrainerLesson = {
  date: string;
  end: string;
  id: string;
  note?: string;
  requester: string;
  start: string;
  status: LessonStatus;
};

// "taken" is all other people learn about someone else's lesson.
export type LessonSlotState =
  | "confirmed"
  | "free"
  | "mine-confirmed"
  | "mine-pending"
  | "pending"
  | "taken";
export type LessonSlot = {
  date: string;
  end: string;
  lessonId?: string;
  // Only for the trainer and administrators.
  requester?: string;
  start: string;
  state: LessonSlotState;
};

export type TrainerCalendar = {
  canManage: boolean;
  // Only when canManage.
  inviteToken?: string;
  // Confirmed lessons (canManage) with names.
  lessons: TrainerLesson[];
  // The viewer's own requests and lessons.
  mine: TrainerLesson[];
  // Requests waiting for the trainer (canManage).
  requests: TrainerLesson[];
  slots: LessonSlot[];
  trainer: string;
  windows: TrainerWindow[];
};

type WindowRow = {
  date: string | null;
  end: string;
  id: string;
  lesson_minutes: number;
  start: string;
  valid_from: string | null;
  valid_until: string | null;
  weekday: number | null;
};
type LessonRow = {
  date: string;
  end: string;
  id: string;
  note: string | null;
  requester: string;
  start: string;
  status: LessonStatus;
};

const pragueFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  timeZone: "Europe/Prague",
  year: "numeric",
});

// Accounts with the trainer role, by their display name.
export async function getTrainers() {
  return (await getAdminUsers())
    .filter((user) => user.role === "trainer")
    .map((user) => user.username);
}

// The trainer's account name as stored, or null when there is no such trainer.
export async function findTrainer(name: string) {
  const key = normalizeUsername(name);

  return (await getTrainers()).find((trainer) => normalizeUsername(trainer) === key) ?? null;
}

export function getTrainerCalendar(
  trainer: string,
  viewer: { canManage: boolean; username: string },
): TrainerCalendar {
  const trainerKey = normalizeUsername(trainer);
  const viewerKey = normalizeUsername(viewer.username);
  const now = getPragueNow();
  const windows = readWindows(trainerKey);
  const lessons = readLessons(trainerKey, now.dateKey);
  const active = lessons.filter(isActive);
  const slots = generateSlots(windows, now).map((slot): LessonSlot => {
    const lesson = active.find((item) => overlaps(item, slot));

    if (!lesson) {
      return { ...slot, state: "free" };
    }

    if (normalizeUsername(lesson.requester) === viewerKey) {
      return {
        ...slot,
        lessonId: lesson.id,
        state: lesson.status === "pending" ? "mine-pending" : "mine-confirmed",
      };
    }

    return viewer.canManage
      ? { ...slot, lessonId: lesson.id, requester: lesson.requester, state: lesson.status as "confirmed" | "pending" }
      : { ...slot, state: "taken" };
  });
  const upcoming = lessons.filter((lesson) => !isPast(lesson, now));

  return {
    canManage: viewer.canManage,
    inviteToken: viewer.canManage ? getInviteToken(trainerKey) : undefined,
    lessons: viewer.canManage ? upcoming.filter((lesson) => lesson.status === "confirmed") : [],
    mine: upcoming.filter(
      (lesson) =>
        normalizeUsername(lesson.requester) === viewerKey && lesson.status !== "cancelled",
    ),
    requests: viewer.canManage ? upcoming.filter((lesson) => lesson.status === "pending") : [],
    slots,
    trainer,
    windows: viewer.canManage ? windows : [],
  };
}

export function addTrainerWindow(trainer: string, input: TrainerWindowInput) {
  const trainerKey = normalizeUsername(trainer);
  const db = getDb();
  const { count } = db
    .prepare("SELECT COUNT(*) AS count FROM trainer_windows WHERE trainer = ?")
    .get(trainerKey) as { count: number };

  if (count >= maxWindowsPerTrainer) {
    return { error: "Je tu už příliš mnoho nabídek, nejdřív nějakou smaž." };
  }

  const isDuplicate = readWindows(trainerKey).some(
    (window) =>
      window.date === input.date &&
      window.weekday === input.weekday &&
      window.start === input.start &&
      window.end === input.end &&
      window.validFrom === input.validFrom &&
      window.validUntil === input.validUntil,
  );

  if (isDuplicate) {
    return { error: "Tuhle nabídku už máš." };
  }

  const id = randomUUID();

  db.prepare(
    `INSERT INTO trainer_windows
       (id, trainer, weekday, date, start, "end", lesson_minutes, valid_from, valid_until, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    trainerKey,
    input.weekday ?? null,
    input.date ?? null,
    input.start,
    input.end,
    input.lessonMinutes,
    input.validFrom ?? null,
    input.validUntil ?? null,
    new Date().toISOString(),
  );

  return { window: { ...input, id } };
}

// Lessons already requested or confirmed in the window stay.
export function deleteTrainerWindow(trainer: string, id: string) {
  return (
    getDb()
      .prepare("DELETE FROM trainer_windows WHERE id = ? AND trainer = ?")
      .run(id, normalizeUsername(trainer)).changes > 0
  );
}

export function requestLesson(input: {
  date: string;
  end: string;
  note?: string;
  requester: string;
  start: string;
  trainer: string;
}) {
  const trainerKey = normalizeUsername(input.trainer);
  const db = getDb();

  if (trainerKey === normalizeUsername(input.requester)) {
    return { error: "O lekci u sebe žádat nejde.", status: 400 };
  }

  // One transaction, so two people cannot take the same slot at once.
  return db.transaction((): { error: string; status: number } | { lesson: TrainerLesson } => {
    const now = getPragueNow();
    const slot = generateSlots(readWindows(trainerKey), now).find(
      (item) => item.date === input.date && item.start === input.start && item.end === input.end,
    );

    if (!slot) {
      return { error: "Tento termín už trenér nenabízí.", status: 409 };
    }

    const lessons = readLessons(trainerKey, now.dateKey).filter(isActive);

    if (lessons.some((lesson) => overlaps(lesson, slot))) {
      return { error: "Termín už je obsazený.", status: 409 };
    }

    const pending = lessons.filter(
      (lesson) =>
        lesson.status === "pending" &&
        normalizeUsername(lesson.requester) === normalizeUsername(input.requester),
    ).length;

    if (pending >= maxPendingPerRequester) {
      return {
        error: `Čeká už ${maxPendingPerRequester} tvých žádostí. Počkej, až je trenér vyřídí.`,
        status: 429,
      };
    }

    const lesson: TrainerLesson = {
      date: slot.date,
      end: slot.end,
      id: randomUUID(),
      note: input.note || undefined,
      requester: input.requester,
      start: slot.start,
      status: "pending",
    };

    db.prepare(
      `INSERT INTO trainer_lessons (id, trainer, date, start, "end", requester, note, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    ).run(
      lesson.id,
      trainerKey,
      lesson.date,
      lesson.start,
      lesson.end,
      lesson.requester,
      lesson.note ?? null,
      new Date().toISOString(),
    );

    return { lesson };
  })();
}

// confirm / decline: the trainer (or an administrator) decides a pending
// request. cancel: the trainer, an administrator or the requester calls off
// a pending request or a confirmed lesson.
export function changeLesson(input: {
  action: "cancel" | "confirm" | "decline";
  actor: string;
  canManage: boolean;
  id: string;
  trainer: string;
}) {
  const db = getDb();
  const lesson = db
    .prepare('SELECT id, date, start, "end", requester, note, status FROM trainer_lessons WHERE id = ? AND trainer = ?')
    .get(input.id, normalizeUsername(input.trainer)) as LessonRow | undefined;

  if (!lesson) {
    return { error: "Lekce nenalezena.", status: 404 };
  }

  const isRequester = normalizeUsername(lesson.requester) === normalizeUsername(input.actor);

  if (input.action === "cancel" ? !input.canManage && !isRequester : !input.canManage) {
    return { error: "Na tuto lekci nemáš oprávnění.", status: 403 };
  }

  const allowedFrom: LessonStatus[] =
    input.action === "cancel" ? ["pending", "confirmed"] : ["pending"];

  if (!allowedFrom.includes(lesson.status)) {
    return { error: "Lekce už je vyřízená.", status: 409 };
  }

  const status: LessonStatus =
    input.action === "confirm" ? "confirmed" : input.action === "decline" ? "declined" : "cancelled";

  db.prepare(
    "UPDATE trainer_lessons SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?",
  ).run(status, new Date().toISOString(), input.actor, lesson.id);

  return { lesson: { ...rowToLesson(lesson), status } };
}

// The secret part of the trainer's invite link; created on first use.
export function getInviteToken(trainer: string) {
  const trainerKey = normalizeUsername(trainer);
  const row = getDb()
    .prepare("SELECT token FROM trainer_invites WHERE trainer = ?")
    .get(trainerKey) as { token: string } | undefined;

  return row?.token ?? regenerateInviteToken(trainerKey);
}

// The previous link stops working.
export function regenerateInviteToken(trainer: string) {
  const token = randomBytes(18).toString("base64url");

  getDb()
    .prepare(
      `INSERT INTO trainer_invites (trainer, token, created_at) VALUES (?, ?, ?)
       ON CONFLICT(trainer) DO UPDATE SET token = excluded.token, created_at = excluded.created_at`,
    )
    .run(normalizeUsername(trainer), token, new Date().toISOString());

  return token;
}

// The trainer an invite link belongs to, if the link is valid and the
// account still is a trainer.
export async function findTrainerByInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    return null;
  }

  const row = getDb()
    .prepare("SELECT trainer FROM trainer_invites WHERE token = ?")
    .get(token) as { trainer: string } | undefined;

  return row ? findTrainer(row.trainer) : null;
}

function readWindows(trainerKey: string): TrainerWindow[] {
  const rows = getDb()
    .prepare(
      `SELECT id, weekday, date, start, "end", lesson_minutes, valid_from, valid_until
       FROM trainer_windows WHERE trainer = ? ORDER BY weekday IS NULL, weekday, date, start`,
    )
    .all(trainerKey) as WindowRow[];

  return rows.map((row) => ({
    date: row.date ?? undefined,
    end: row.end,
    id: row.id,
    lessonMinutes: row.lesson_minutes,
    start: row.start,
    validFrom: row.valid_from ?? undefined,
    validUntil: row.valid_until ?? undefined,
    weekday: row.weekday ?? undefined,
  }));
}

function readLessons(trainerKey: string, fromDate: string) {
  const rows = getDb()
    .prepare(
      `SELECT id, date, start, "end", requester, note, status FROM trainer_lessons
       WHERE trainer = ? AND date >= ? ORDER BY date, start`,
    )
    .all(trainerKey, fromDate) as LessonRow[];

  return rows.map(rowToLesson);
}

function rowToLesson(row: LessonRow): TrainerLesson {
  return {
    date: row.date,
    end: row.end,
    id: row.id,
    note: row.note ?? undefined,
    requester: row.requester,
    start: row.start,
    status: row.status,
  };
}

// Future lesson slots from the windows, earliest first, without overlaps.
function generateSlots(windows: TrainerWindow[], now: PragueNow) {
  const slots: Array<{ date: string; end: string; start: string }> = [];
  const today = new Date(`${now.dateKey}T12:00:00Z`);

  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() + offset);
    const dateKey = date.toISOString().slice(0, 10);
    const weekday = date.getUTCDay() || 7;
    const daySlots: Array<{ date: string; end: string; start: string }> = [];

    for (const window of windows) {
      const applies = window.date
        ? window.date === dateKey
        : window.weekday === weekday &&
          (!window.validFrom || dateKey >= window.validFrom) &&
          (!window.validUntil || dateKey <= window.validUntil);

      if (!applies) {
        continue;
      }

      const windowEnd = toMinutes(window.end);

      for (
        let start = toMinutes(window.start);
        start + window.lessonMinutes <= windowEnd;
        start += window.lessonMinutes
      ) {
        if (offset === 0 && start <= now.minutes) {
          continue;
        }

        daySlots.push({
          date: dateKey,
          end: toTime(start + window.lessonMinutes),
          start: toTime(start),
        });
      }
    }

    daySlots.sort((left, right) => left.start.localeCompare(right.start));

    for (const slot of daySlots) {
      const previous = slots[slots.length - 1];

      // Two windows covering the same time offer it only once.
      if (!previous || previous.date !== slot.date || previous.end <= slot.start) {
        slots.push(slot);
      }
    }
  }

  return slots;
}

function isActive(lesson: TrainerLesson) {
  return lesson.status === "pending" || lesson.status === "confirmed";
}

function isPast(lesson: TrainerLesson, now: PragueNow) {
  return lesson.date < now.dateKey || (lesson.date === now.dateKey && toMinutes(lesson.end) <= now.minutes);
}

function overlaps(
  left: { date: string; end: string; start: string },
  right: { date: string; end: string; start: string },
) {
  return left.date === right.date && left.start < right.end && right.start < left.end;
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

function toTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
