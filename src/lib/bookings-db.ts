import { bookingToRow, getDb } from "@/lib/db";
import type { Booking } from "@/lib/schedule";

const recurringHorizonDays = 28;
const latBaseWeekMonday = "2026-05-18";
let databaseQueue = Promise.resolve();

export type BookingInput = Omit<Booking, "id">;

export type RecurringTrainingKey =
  | "deti"
  | "prvni-krucky"
  | "juniori-utery"
  | "practise"
  | "latino-ladies"
  | "pohybovka"
  | "spolecna"
  | "juniori-patek";

export type RecurringTrainerConfig = Partial<Record<RecurringTrainingKey, string>>;
export type RecurringCancellationNotice = {
  date: string;
  end: string;
  id: string;
  start: string;
  title: string;
};
export type RecurringHoliday = {
  end: string;
  id: string;
  label: string;
  start: string;
};
export type RecurringOverrideNotice = {
  date: string;
  end: string;
  hasTimeChange: boolean;
  hasTitleChange: boolean;
  id: string;
  newTitle: string;
  originalEnd: string;
  originalStart: string;
  originalTitle: string;
  start: string;
};
type RecurringBookingOverride = {
  end?: string;
  originalEnd?: string;
  originalStart?: string;
  originalTitle?: string;
  start?: string;
  title?: string;
  trainer?: string;
};
type RecurringBookingOverrides = Record<string, RecurringBookingOverride>;
type RecurringConfig = {
  cancelledIds: Set<string>;
  holidays: RecurringHoliday[];
  overrides: RecurringBookingOverrides;
  trainers: RecurringTrainerConfig;
};

const pragueDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const pragueDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "2-digit",
  timeZone: "Europe/Prague",
  year: "numeric",
});

export const recurringTrainingLabels: Array<{
  end: string;
  key: RecurringTrainingKey;
  label: string;
  schedule: string;
  start: string;
}> = [
  { end: "17:00", key: "deti", label: "Děti", schedule: "Pondělí 15:15-17:00", start: "15:15" },
  { end: "16:30", key: "prvni-krucky", label: "První krůčky", schedule: "Úterý 15:45-16:30", start: "15:45" },
  { end: "17:15", key: "juniori-utery", label: "Junioři", schedule: "Úterý 16:30-17:15", start: "16:30" },
  { end: "19:30", key: "practise", label: "Practise", schedule: "Úterý 17:30-19:30", start: "17:30" },
  { end: "21:00", key: "latino-ladies", label: "Latino Ladies", schedule: "Úterý 20:00-21:00", start: "20:00" },
  { end: "18:00", key: "pohybovka", label: "Pohybovka", schedule: "Čtvrtek 17:15-18:00", start: "17:15" },
  { end: "19:30", key: "spolecna", label: "Společná LAT/STT", schedule: "Čtvrtek 18:00-19:30", start: "18:00" },
  { end: "17:00", key: "juniori-patek", label: "Junioři", schedule: "Pátek 16:00-17:00", start: "16:00" },
];

export async function getBookings() {
  return readBookings();
}

export async function getRecurringTrainers() {
  return readRecurringTrainers();
}

export async function getRecurringCancellationNotices() {
  const notices = (await readRecurringCancellations())
    .map(createRecurringCancellationNotice)
    .filter((notice): notice is RecurringCancellationNotice => Boolean(notice))
    .filter((notice) => notice.date >= getTodayPragueDateKey())
    .sort((left, right) =>
      `${left.date}${left.start}`.localeCompare(`${right.date}${right.start}`),
    );

  return notices;
}

export async function getRecurringHolidays() {
  return readRecurringHolidays();
}

export async function getRecurringOverrideNotices() {
  const overrides = await readRecurringOverrides();

  return Object.entries(overrides)
    .map(([id, override]) => {
      const recurringNotice = createRecurringCancellationNotice(id);
      const hasTitleChange = Boolean(override.title && override.originalTitle);
      const hasTimeChange = Boolean(override.start || override.end);

      return recurringNotice && (hasTitleChange || hasTimeChange)
        ? {
            date: recurringNotice.date,
            end: override.end ?? recurringNotice.end,
            hasTimeChange,
            hasTitleChange,
            id,
            newTitle: override.title ?? recurringNotice.title,
            originalEnd: recurringNotice.end,
            originalStart: recurringNotice.start,
            originalTitle: override.originalTitle ?? recurringNotice.title,
            start: override.start ?? recurringNotice.start,
          }
        : null;
    })
    .filter((notice): notice is RecurringOverrideNotice => Boolean(notice))
    .filter((notice) => notice.date >= getTodayPragueDateKey())
    .sort((left, right) =>
      `${left.date}${left.start}`.localeCompare(`${right.date}${right.start}`),
    );
}

export async function addRecurringHoliday(input: {
  end: string;
  label: string;
  start: string;
}) {
  return withDatabaseLock(async () => {
    const holidays = await readRecurringHolidays();
    const holiday: RecurringHoliday = {
      end: input.end,
      id: crypto.randomUUID(),
      label: input.label.trim() || "Prázdniny",
      start: input.start,
    };

    await writeRecurringHolidays([...holidays, holiday]);

    return holiday;
  });
}

export async function deleteRecurringHoliday(id: string) {
  return withDatabaseLock(async () => {
    const holidays = await readRecurringHolidays();
    await writeRecurringHolidays(holidays.filter((holiday) => holiday.id !== id));
  });
}

export async function updateBookingTitle(id: string, title: string) {
  return withDatabaseLock(async () => {
    const bookings = await readBookings();
    const bookingIndex = bookings.findIndex((candidate) => candidate.id === id);
    const booking = bookings[bookingIndex];

    if (!booking) {
      return null;
    }

    const normalizedTitle = title.trim();

    if (!id.startsWith("recurring-")) {
      const updatedBooking = {
        ...booking,
        title: normalizedTitle,
        updatedAt: new Date().toISOString(),
      };

      bookings[bookingIndex] = updatedBooking;
      await writeBookings(bookings);

      return updatedBooking;
    }

    const overrides = await readRecurringOverrides();
    const originalTitle = overrides[id]?.originalTitle ?? booking.title;

    await updateRecurringOverride(id, {
      originalTitle:
        normalizedTitle && normalizedTitle !== originalTitle
          ? originalTitle
          : undefined,
      title:
        normalizedTitle && normalizedTitle !== originalTitle
          ? normalizedTitle
          : undefined,
    });

    return (await readBookings()).find((candidate) => candidate.id === id) ?? null;
  });
}

export async function updateRecurringTrainers(input: RecurringTrainerConfig) {
  return withDatabaseLock(async () => {
    const nextConfig = normalizeRecurringTrainers(input);

    await writeRecurringTrainers(nextConfig);

    return nextConfig;
  });
}

export async function createBooking(input: BookingInput) {
  return withDatabaseLock(async () => {
    const bookings = removeRecurringConflicts(await readBookings(), input);
    const conflict = findBookingConflict(bookings, input);

    if (conflict) {
      return { booking: null, conflict };
    }

    const booking: Booking = {
      ...input,
      createdAt: input.createdAt ?? new Date().toISOString(),
      id: crypto.randomUUID(),
    };

    await writeBookings([...bookings, booking]);

    return { booking, conflict: null };
  });
}

export async function updateBooking(id: string, input: BookingInput) {
  return withDatabaseLock(async () => {
    const bookings = removeRecurringConflicts(await readBookings(), input, id);
    const index = bookings.findIndex((booking) => booking.id === id);

    if (index === -1) {
      return { booking: null, conflict: null, notFound: true };
    }

    const conflict = findBookingConflict(bookings, input, id);

    if (conflict) {
      return { booking: null, conflict, notFound: false };
    }

    const previousBooking = bookings[index];
    const booking: Booking = {
      ...previousBooking,
      ...input,
      createdAt: previousBooking.createdAt,
      createdBy: previousBooking.createdBy,
      id,
      updatedAt: input.updatedAt ?? new Date().toISOString(),
    };

    bookings[index] = booking;
    await writeBookings(bookings);

    return { booking, conflict: null, notFound: false };
  });
}

export async function updateBookingTime(id: string, start: string, end: string) {
  return withDatabaseLock(async () => {
    const bookings = await readBookings();
    const index = bookings.findIndex((booking) => booking.id === id);

    if (index === -1) {
      return { booking: null, conflict: null, notFound: true };
    }

    const previousBooking = bookings[index];
    const candidate: Booking = {
      ...previousBooking,
      end,
      start,
      updatedAt: new Date().toISOString(),
    };
    const conflict = findBookingConflict(bookings, candidate, id);

    if (conflict) {
      return { booking: null, conflict, notFound: false };
    }

    if (id.startsWith("recurring-")) {
      const hasTimeChange =
        start !== previousBooking.start || end !== previousBooking.end;

      await updateRecurringOverride(id, {
        end: hasTimeChange ? end : undefined,
        originalEnd: hasTimeChange ? previousBooking.end : undefined,
        originalStart: hasTimeChange ? previousBooking.start : undefined,
        start: hasTimeChange ? start : undefined,
      });

      const nextBookings = await readBookings();

      return {
        booking: nextBookings.find((booking) => booking.id === id) ?? null,
        conflict: null,
        notFound: false,
      };
    }

    bookings[index] = candidate;
    await writeBookings(bookings);

    return { booking: candidate, conflict: null, notFound: false };
  });
}

export async function restoreBookingSnapshot(snapshot: Booking) {
  return withDatabaseLock(async () => {
    const bookings = await readBookings();
    const index = bookings.findIndex((booking) => booking.id === snapshot.id);
    const conflict = findBookingConflict(bookings, snapshot, snapshot.id);

    if (conflict) {
      return { booking: null, conflict };
    }

    if (index === -1) {
      await writeBookings([...bookings, snapshot]);
      return { booking: snapshot, conflict: null };
    }

    bookings[index] = snapshot;
    await writeBookings(bookings);

    return { booking: snapshot, conflict: null };
  });
}

export async function reinstateRecurringBooking(id: string) {
  return withDatabaseLock(async () => {
    if (!id.startsWith("recurring-")) {
      return { booking: null };
    }

    await removeRecurringCancellation(id);

    const bookings = await readBookings();

    return {
      booking: bookings.find((booking) => booking.id === id) ?? null,
    };
  });
}

export async function updateBookingTrainer(id: string, trainer: string) {
  return withDatabaseLock(async () => {
    const normalizedTrainer = trainer.trim();

    if (id.startsWith("recurring-")) {
      await updateRecurringOverride(id, { trainer: normalizedTrainer || undefined });

      const bookings = await readBookings();

      return {
        booking: bookings.find((booking) => booking.id === id) ?? null,
        notFound: !bookings.some((booking) => booking.id === id),
      };
    }

    const bookings = await readBookings();
    const index = bookings.findIndex((booking) => booking.id === id);

    if (index === -1) {
      return { booking: null, notFound: true };
    }

    const booking = {
      ...bookings[index],
      trainer: normalizedTrainer || undefined,
      updatedAt: new Date().toISOString(),
    };

    bookings[index] = booking;
    await writeBookings(bookings);

    return { booking, notFound: false };
  });
}

export async function deleteBooking(id: string) {
  return withDatabaseLock(async () => {
    const bookings = await readBookings();
    const nextBookings = bookings.filter((booking) => booking.id !== id);

    if (nextBookings.length === bookings.length) {
      return false;
    }

    if (id.startsWith("recurring-")) {
      await addRecurringCancellation(id);
    }

    await writeBookings(nextBookings);
    return true;
  });
}

export async function markBookingCleaned(id: string) {
  return withDatabaseLock(async () => {
    const bookings = await readBookings();
    const index = bookings.findIndex((booking) => booking.id === id);

    if (index === -1) {
      return { booking: null, notFound: true };
    }

    const booking = bookings[index];

    // Nothing to write for repeated clicks, which also keeps this public
    // endpoint from being used to flood storage and the audit log.
    if (!booking.cleanupRequired || booking.cleanedAt) {
      return { alreadyCleaned: true, booking, notFound: false };
    }

    if (!hasBookingEndedInPrague(booking)) {
      return {
        booking,
        cleanupNotReady: true,
        notFound: false,
      };
    }

    const updatedBooking = {
      ...booking,
      cleanedAt: new Date().toISOString(),
      cleanedBy: "public",
    };

    bookings[index] = updatedBooking;
    await writeBookings(bookings);

    return { booking: updatedBooking, notFound: false, previousBooking: booking };
  });
}

// Reads never write: stale or duplicate entries are dropped from the returned
// list and are pruned from storage by the next write (or the refresh cron).
async function readBookings() {
  const [storedBookings, recurringConfig] = await Promise.all([
    readStoredBookings(),
    readRecurringConfig(),
  ]);

  return normalizeBookings(storedBookings, recurringConfig);
}

async function readStoredBookings() {
  return (getDb().prepare("SELECT * FROM bookings").all() as BookingRow[]).map(rowToBooking);
}

async function readRecurringConfig(): Promise<RecurringConfig> {
  const [cancelledIds, holidays, overrides, trainers] = await Promise.all([
    readRecurringCancellations(),
    readRecurringHolidays(),
    readRecurringOverrides(),
    readRecurringTrainers(),
  ]);

  return {
    cancelledIds: new Set(cancelledIds),
    holidays,
    overrides,
    trainers,
  };
}

// Stores the given list as the full set of one-off bookings: changed rows are
// upserted, rows no longer in the list (deleted or past) are removed.
// Generated recurring trainings are never stored.
async function writeBookings(bookings: Booking[]) {
  const db = getDb();
  const nextBookings = normalizeStoredBookings(bookings);
  const nextIds = new Set(nextBookings.map((booking) => booking.id));
  const upsert = db.prepare(`
    INSERT INTO bookings (id, date, start, "end", title, organizer, status, booking_kind,
      event_type, trainer, note, cleanup_required, cleaned_at, cleaned_by, created_at,
      created_by, updated_at, updated_by)
    VALUES (@id, @date, @start, @end, @title, @organizer, @status, @bookingKind,
      @eventType, @trainer, @note, @cleanupRequired, @cleanedAt, @cleanedBy, @createdAt,
      @createdBy, @updatedAt, @updatedBy)
    ON CONFLICT(id) DO UPDATE SET
      date = excluded.date, start = excluded.start, "end" = excluded."end",
      title = excluded.title, organizer = excluded.organizer, status = excluded.status,
      booking_kind = excluded.booking_kind, event_type = excluded.event_type,
      trainer = excluded.trainer, note = excluded.note,
      cleanup_required = excluded.cleanup_required, cleaned_at = excluded.cleaned_at,
      cleaned_by = excluded.cleaned_by, created_at = excluded.created_at,
      created_by = excluded.created_by, updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `);
  const remove = db.prepare("DELETE FROM bookings WHERE id = ?");

  db.transaction(() => {
    for (const { id } of db.prepare("SELECT id FROM bookings").all() as Array<{ id: string }>) {
      if (!nextIds.has(id)) {
        remove.run(id);
      }
    }

    for (const booking of nextBookings) {
      upsert.run(bookingToRow(booking));
    }
  })();
}

type BookingRow = {
  booking_kind: Booking["bookingKind"] | null;
  cleaned_at: string | null;
  cleaned_by: string | null;
  cleanup_required: number;
  created_at: string | null;
  created_by: string | null;
  date: string;
  end: string;
  event_type: Booking["eventType"] | null;
  id: string;
  note: string | null;
  organizer: string;
  start: string;
  status: Booking["status"];
  title: string;
  trainer: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

function rowToBooking(row: BookingRow): Booking {
  const booking: Booking = {
    date: row.date,
    end: row.end,
    id: row.id,
    organizer: row.organizer,
    start: row.start,
    status: row.status,
    title: row.title,
  };
  const optional: Partial<Booking> = {
    bookingKind: row.booking_kind ?? undefined,
    cleanedAt: row.cleaned_at ?? undefined,
    cleanedBy: row.cleaned_by ?? undefined,
    cleanupRequired: row.cleanup_required ? true : undefined,
    createdAt: row.created_at ?? undefined,
    createdBy: row.created_by ?? undefined,
    eventType: row.event_type ?? undefined,
    note: row.note ?? undefined,
    trainer: row.trainer ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    updatedBy: row.updated_by ?? undefined,
  };

  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) {
      Object.assign(booking, { [key]: value });
    }
  }

  return booking;
}

function sortBookings(bookings: Booking[]) {
  return [...bookings].sort((left, right) =>
    `${left.date}${left.start}`.localeCompare(`${right.date}${right.start}`),
  );
}

function normalizeBookings(bookings: Booking[], recurringConfig: RecurringConfig) {
  const uniqueBookings = new Map<string, Booking>();

  for (const booking of addRecurringBookings(
    removePastBookings(bookings),
    recurringConfig,
  )) {
    uniqueBookings.set(booking.id, booking);
  }

  return sortBookings([...uniqueBookings.values()]);
}

function addRecurringBookings(
  bookings: Booking[],
  recurringConfig: RecurringConfig,
) {
  const lastHorizonDateKey = getLastRecurringHorizonDateKey();
  const nextBookings = bookings.filter(
    (booking) =>
      !isRecurringBooking(booking) || booking.date <= lastHorizonDateKey,
  );
  const nonRecurringBookings = nextBookings.filter(
    (booking) => !isRecurringBooking(booking),
  );

  for (const recurringBooking of createRecurringBookings(recurringConfig)) {
    const existingIndex = nextBookings.findIndex(
      (booking) => booking.id === recurringBooking.id,
    );

    if (existingIndex !== -1) {
      nextBookings[existingIndex] = recurringBooking;
      continue;
    }

    const conflict = findBookingConflict(nonRecurringBookings, recurringBooking);

    if (!conflict) {
      nextBookings.push(recurringBooking);
    }
  }

  return nextBookings;
}

async function addRecurringCancellation(id: string) {
  const cancellations = new Set(await readRecurringCancellations());

  cancellations.add(id);
  await writeRecurringCancellations([...cancellations]);
}

async function removeRecurringCancellation(id: string) {
  const cancellations = new Set(await readRecurringCancellations());

  cancellations.delete(id);
  await writeRecurringCancellations([...cancellations]);
}

export async function refreshRecurringBookings() {
  return withDatabaseLock(async () => {
    const bookings = await readBookings();
    await writeBookings(bookings);

    return {
      bookings,
      recurringCount: bookings.filter(isRecurringBooking).length,
    };
  });
}

function createRecurringBookings({
  cancelledIds,
  holidays: recurringHolidays,
  overrides: recurringOverrides,
  trainers: recurringTrainers,
}: RecurringConfig) {
  const today = dateKeyToUtcDate(getTodayPragueDateKey());
  const bookings: Booking[] = [];

  for (let offset = 0; offset <= recurringHorizonDays; offset += 1) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() + offset);
    const day = date.getUTCDay();
    const dateKey = formatUtcDateKey(date);

    if (isRecurringHolidayDate(dateKey, recurringHolidays)) {
      continue;
    }

    if (day === 1) {
      pushRecurringBooking(bookings, cancelledIds, buildRecurringBooking("deti", recurringTrainers, recurringOverrides, {
        id: `recurring-deti-${dateKey}`,
        title: "Děti",
        organizer: "Koškovi",
        date: dateKey,
        start: "15:15",
        end: "17:00",
        status: "confirmed",
        note: "Pravidelny pondelni trenink deti",
      }));
    }

    if (day === 2) {
      pushRecurringBooking(bookings, cancelledIds, buildRecurringBooking("prvni-krucky", recurringTrainers, recurringOverrides, {
        id: `recurring-prvni-krucky-${dateKey}`,
        title: "První krůčky",
        organizer: "Koškovi",
        date: dateKey,
        start: "15:45",
        end: "16:30",
        status: "confirmed",
        note: "Pravidelny uterni trenink Prvni krucky",
      }));

      pushRecurringBooking(bookings, cancelledIds, buildRecurringBooking("juniori-utery", recurringTrainers, recurringOverrides, {
        id: `recurring-juniori-utery-${dateKey}`,
        title: "Junioři",
        organizer: "Koškovi",
        date: dateKey,
        start: "16:30",
        end: "17:15",
        status: "confirmed",
        note: "Pravidelny uterni trenink junioru",
      }));

      pushRecurringBooking(bookings, cancelledIds, buildRecurringBooking("practise", recurringTrainers, recurringOverrides, {
        id: `recurring-practise-${dateKey}`,
        title: "Practise",
        organizer: "Koškovi",
        date: dateKey,
        start: "17:30",
        end: "19:30",
        status: "confirmed",
        note: "Pravidelna uterni akce",
      }));

      pushRecurringBooking(bookings, cancelledIds, buildRecurringBooking("latino-ladies", recurringTrainers, recurringOverrides, {
        id: `recurring-latino-ladies-${dateKey}`,
        title: "Latino Ladies",
        organizer: "Koškovi",
        date: dateKey,
        start: "20:00",
        end: "21:00",
        status: "confirmed",
        note: "Pravidelny uterni trenink Latino Ladies",
      }));
    }

    if (day === 4) {
      const danceStyle = getAlternatingDanceStyle(dateKey);

      pushRecurringBooking(bookings, cancelledIds, buildRecurringBooking("pohybovka", recurringTrainers, recurringOverrides, {
        id: `recurring-pohybovka-${dateKey}`,
        title: "Pohybovka",
        organizer: "Koškovi",
        date: dateKey,
        start: "17:15",
        end: "18:00",
        status: "confirmed",
        note: "Pravidelna ctvrtecni akce",
      }));

      pushRecurringBooking(bookings, cancelledIds, buildRecurringBooking("spolecna", recurringTrainers, recurringOverrides, {
        id: `recurring-spolecna-${dateKey}`,
        title: `Společná ${danceStyle}`,
        organizer: "Koškovi",
        date: dateKey,
        start: "18:00",
        end: "19:30",
        status: "confirmed",
        note: "LAT a STT se stridaji po tydnu",
      }));
    }

    if (day === 5) {
      pushRecurringBooking(bookings, cancelledIds, buildRecurringBooking("juniori-patek", recurringTrainers, recurringOverrides, {
        id: `recurring-juniori-patek-${dateKey}`,
        title: "Junioři",
        organizer: "Koškovi",
        date: dateKey,
        start: "16:00",
        end: "17:00",
        status: "confirmed",
        note: "Pravidelny patecni trenink junioru",
      }));
    }
  }

  return bookings;
}

function buildRecurringBooking(
  key: RecurringTrainingKey,
  recurringTrainers: RecurringTrainerConfig,
  recurringOverrides: RecurringBookingOverrides,
  booking: Booking,
) {
  const trainer = (
    recurringOverrides[booking.id]?.trainer ??
    recurringTrainers[key] ??
    ""
  ).trim();
  const title = recurringOverrides[booking.id]?.title?.trim() || booking.title;
  const start = recurringOverrides[booking.id]?.start?.trim() || booking.start;
  const end = recurringOverrides[booking.id]?.end?.trim() || booking.end;

  return {
    ...booking,
    end,
    note: trainer ? `${booking.note}\nTrenér: ${trainer}` : booking.note,
    recurringKey: key,
    start,
    title,
    trainer: trainer || undefined,
  };
}

function pushRecurringBooking(
  bookings: Booking[],
  cancelledIds: Set<string>,
  booking: Booking,
) {
  if (!cancelledIds.has(booking.id)) {
    bookings.push(booking);
  }
}

async function readRecurringCancellations() {
  return (
    getDb().prepare("SELECT id FROM recurring_cancellations ORDER BY id").all() as Array<{
      id: string;
    }>
  ).map((row) => row.id);
}

function createRecurringCancellationNotice(
  id: string,
): RecurringCancellationNotice | null {
  if (!id.startsWith("recurring-")) {
    return null;
  }

  const date = id.slice(-10);
  const key = id.slice("recurring-".length, -11) as RecurringTrainingKey;
  const training = recurringTrainingLabels.find((item) => item.key === key);

  if (!training || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  return {
    date,
    end: training.end,
    id,
    start: training.start,
    title: key === "spolecna"
      ? training.label.replace("LAT/STT", getAlternatingDanceStyle(date))
      : training.label,
  };
}

async function updateRecurringOverride(
  id: string,
  override: RecurringBookingOverride,
) {
  const overrides = await readRecurringOverrides();
  const nextOverride = {
    ...overrides[id],
    ...override,
  };

  if (!nextOverride.end) {
    delete nextOverride.end;
  }

  if (!nextOverride.originalEnd) {
    delete nextOverride.originalEnd;
  }

  if (!nextOverride.originalStart) {
    delete nextOverride.originalStart;
  }

  if (!nextOverride.start) {
    delete nextOverride.start;
  }

  if (!nextOverride.trainer) {
    delete nextOverride.trainer;
  }

  if (!nextOverride.title) {
    delete nextOverride.title;
  }

  if (!nextOverride.originalTitle) {
    delete nextOverride.originalTitle;
  }

  if (Object.keys(nextOverride).length === 0) {
    delete overrides[id];
  } else {
    overrides[id] = nextOverride;
  }

  await writeRecurringOverrides(overrides);
}

async function readRecurringOverrides() {
  const rows = getDb().prepare("SELECT * FROM recurring_overrides").all() as Array<
    Record<string, string | null> & { id: string }
  >;
  const overrides: RecurringBookingOverrides = {};

  for (const row of rows) {
    overrides[row.id] = {
      end: row.end ?? undefined,
      originalEnd: row.original_end ?? undefined,
      originalStart: row.original_start ?? undefined,
      originalTitle: row.original_title ?? undefined,
      start: row.start ?? undefined,
      title: row.title ?? undefined,
      trainer: row.trainer ?? undefined,
    };
  }

  return normalizeRecurringOverrides(overrides);
}

async function writeRecurringOverrides(overrides: RecurringBookingOverrides) {
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO recurring_overrides
      (id, title, original_title, start, "end", original_start, original_end, trainer)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    db.exec("DELETE FROM recurring_overrides");

    for (const [id, override] of Object.entries(normalizeRecurringOverrides(overrides))) {
      insert.run(
        id,
        override.title ?? null,
        override.originalTitle ?? null,
        override.start ?? null,
        override.end ?? null,
        override.originalStart ?? null,
        override.originalEnd ?? null,
        override.trainer ?? null,
      );
    }
  })();
}

function normalizeRecurringOverrides(overrides: RecurringBookingOverrides) {
  const normalized: RecurringBookingOverrides = {};

  for (const [id, override] of Object.entries(overrides)) {
    if (!id.startsWith("recurring-") || typeof override !== "object") {
      continue;
    }

    const trainer = override.trainer?.trim();
    const start = override.start?.trim();
    const end = override.end?.trim();
    const originalStart = override.originalStart?.trim();
    const originalEnd = override.originalEnd?.trim();
    const title = override.title?.trim();
    const originalTitle = override.originalTitle?.trim();
    const normalizedOverride: RecurringBookingOverride = {};

    if (trainer) {
      normalizedOverride.trainer = trainer;
    }

    if (title && originalTitle && title !== originalTitle) {
      normalizedOverride.title = title;
      normalizedOverride.originalTitle = originalTitle;
    }

    if (
      start &&
      end &&
      originalStart &&
      originalEnd &&
      isTimeValue(start) &&
      isTimeValue(end) &&
      isTimeValue(originalStart) &&
      isTimeValue(originalEnd) &&
      start < end &&
      (start !== originalStart || end !== originalEnd)
    ) {
      normalizedOverride.end = end;
      normalizedOverride.originalEnd = originalEnd;
      normalizedOverride.originalStart = originalStart;
      normalizedOverride.start = start;
    }

    if (Object.keys(normalizedOverride).length > 0) {
      normalized[id] = normalizedOverride;
    }
  }

  return normalized;
}

async function readRecurringHolidays() {
  return normalizeRecurringHolidays(
    getDb().prepare('SELECT id, label, start, "end" FROM recurring_holidays').all() as RecurringHoliday[],
  );
}

async function writeRecurringHolidays(holidays: RecurringHoliday[]) {
  const db = getDb();
  const insert = db.prepare(
    'INSERT INTO recurring_holidays (id, label, start, "end") VALUES (?, ?, ?, ?)',
  );

  db.transaction(() => {
    db.exec("DELETE FROM recurring_holidays");

    for (const holiday of normalizeRecurringHolidays(holidays)) {
      insert.run(holiday.id, holiday.label, holiday.start, holiday.end);
    }
  })();
}

function normalizeRecurringHolidays(holidays: RecurringHoliday[]) {
  if (!Array.isArray(holidays)) {
    return [];
  }

  return holidays
    .filter(
      (holiday) =>
        holiday &&
        typeof holiday.id === "string" &&
        isDateKey(holiday.start) &&
        isDateKey(holiday.end) &&
        holiday.start <= holiday.end,
    )
    .map((holiday) => ({
      end: holiday.end,
      id: holiday.id,
      label: holiday.label?.trim() || "Prázdniny",
      start: holiday.start,
    }))
    .sort((left, right) => left.start.localeCompare(right.start));
}

function isRecurringHolidayDate(dateKey: string, holidays: RecurringHoliday[]) {
  return holidays.some(
    (holiday) => holiday.start <= dateKey && dateKey <= holiday.end,
  );
}

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimeValue(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

async function writeRecurringCancellations(ids: string[]) {
  const db = getDb();
  const insert = db.prepare("INSERT INTO recurring_cancellations (id) VALUES (?)");

  db.transaction(() => {
    db.exec("DELETE FROM recurring_cancellations");

    for (const id of new Set(ids)) {
      insert.run(id);
    }
  })();
}

async function readRecurringTrainers() {
  const rows = getDb()
    .prepare("SELECT training_key, trainer FROM recurring_trainers")
    .all() as Array<{ trainer: string; training_key: string }>;

  return normalizeRecurringTrainers(
    Object.fromEntries(rows.map((row) => [row.training_key, row.trainer])),
  );
}

async function writeRecurringTrainers(config: RecurringTrainerConfig) {
  const db = getDb();
  const insert = db.prepare(
    "INSERT INTO recurring_trainers (training_key, trainer) VALUES (?, ?)",
  );

  db.transaction(() => {
    db.exec("DELETE FROM recurring_trainers");

    for (const [key, trainer] of Object.entries(normalizeRecurringTrainers(config))) {
      insert.run(key, trainer);
    }
  })();
}

function normalizeRecurringTrainers(config: RecurringTrainerConfig) {
  const validKeys = new Set(recurringTrainingLabels.map((training) => training.key));
  const normalized: RecurringTrainerConfig = {};

  for (const [key, value] of Object.entries(config)) {
    if (!validKeys.has(key as RecurringTrainingKey) || typeof value !== "string") {
      continue;
    }

    const trainer = value.trim();

    if (trainer) {
      normalized[key as RecurringTrainingKey] = trainer;
    }
  }

  return normalized;
}

function findBookingConflict(
  bookings: Booking[],
  input: BookingInput,
  ignoredId?: string,
) {
  return bookings.find((booking) => {
    if (booking.id === ignoredId || booking.date !== input.date) {
      return false;
    }

    if (
      !timeRangesOverlap(
      input.start,
      input.end,
      booking.start,
      booking.end,
      )
    ) {
      return false;
    }

    return resourcesConflict(booking, input);
  });
}

function resourcesConflict(booking: Booking, input: BookingInput) {
  const bookingIsIndividualLesson =
    booking.bookingKind === "individual-lesson";
  const inputIsIndividualLesson = input.bookingKind === "individual-lesson";

  if (bookingIsIndividualLesson && inputIsIndividualLesson) {
    if (!booking.trainer || !input.trainer) {
      return true;
    }

    return booking.trainer === input.trainer;
  }

  return true;
}

function removeRecurringConflicts(
  bookings: Booking[],
  input: BookingInput,
  ignoredId?: string,
) {
  if (input.status !== "maintenance") {
    return bookings;
  }

  return bookings.filter((booking) => {
    if (booking.id === ignoredId || !isRecurringBooking(booking)) {
      return true;
    }

    if (booking.date !== input.date) {
      return true;
    }

    return !timeRangesOverlap(input.start, input.end, booking.start, booking.end);
  });
}

function isRecurringBooking(booking: Booking) {
  return booking.id.startsWith("recurring-");
}

function getLastRecurringHorizonDateKey() {
  const lastHorizonDate = dateKeyToUtcDate(getTodayPragueDateKey());
  lastHorizonDate.setUTCDate(lastHorizonDate.getUTCDate() + recurringHorizonDays);

  return formatUtcDateKey(lastHorizonDate);
}

function timeRangesOverlap(
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string,
) {
  return leftStart < rightEnd && leftEnd > rightStart;
}

function hasBookingEndedInPrague(booking: Booking) {
  const current = getCurrentPragueDateAndMinutes();

  if (booking.date < current.dateKey) {
    return true;
  }

  if (booking.date > current.dateKey) {
    return false;
  }

  return timeToMinutes(booking.end) <= current.minutes;
}

function getCurrentPragueDateAndMinutes() {
  const parts = pragueDateTimeFormatter.formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}

function removePastBookings(bookings: Booking[]) {
  const today = getTodayPragueDateKey();

  return bookings.filter(
    (booking) =>
      booking.date >= today ||
      (Boolean(booking.cleanupRequired) && !booking.cleanedAt),
  );
}

function normalizeStoredBookings(bookings: Booking[]) {
  const uniqueBookings = new Map<string, Booking>();

  for (const booking of removePastBookings(bookings)) {
    if (isRecurringBooking(booking)) {
      continue;
    }

    uniqueBookings.set(booking.id, booking);
  }

  return sortBookings([...uniqueBookings.values()]);
}

function getTodayPragueDateKey() {
  return pragueDateFormatter.format(new Date());
}

function getAlternatingDanceStyle(dateKey: string) {
  const baseDate = dateKeyToUtcDate(latBaseWeekMonday);
  const targetDate = dateKeyToUtcDate(dateKey);
  const weekOffset = Math.floor(
    (targetDate.getTime() - baseDate.getTime()) / (7 * 24 * 60 * 60 * 1000),
  );

  return weekOffset % 2 === 0 ? "LAT" : "STT";
}

function dateKeyToUtcDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day));
}

function formatUtcDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function withDatabaseLock<T>(operation: () => Promise<T>) {
  const nextOperation = databaseQueue.then(operation, operation);

  databaseQueue = nextOperation.then(
    () => undefined,
    () => undefined,
  );

  return nextOperation;
}
