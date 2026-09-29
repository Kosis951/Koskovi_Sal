import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

export type Statement = {
  all: (...parameters: unknown[]) => unknown[];
  get: (...parameters: unknown[]) => unknown;
  run: (...parameters: unknown[]) => { changes: number };
};

export type Database = {
  exec: (source: string) => void;
  pragma: (source: string, options?: { simple?: boolean }) => unknown;
  prepare: (source: string) => Statement;
  transaction: <T extends (...args: never[]) => unknown>(fn: T) => T;
};

const schemaVersion = 2;

// Regular trainings that existed before they became editable. `weekday` is
// ISO (1 = Monday … 7 = Sunday); `alternate_title` is used every other week.
const defaultTrainings = [
  { key: "deti", title: "Děti", weekday: 1, start: "15:15", end: "17:00" },
  { key: "prvni-krucky", title: "První krůčky", weekday: 2, start: "15:45", end: "16:30" },
  { key: "juniori-utery", title: "Junioři", weekday: 2, start: "16:30", end: "17:15" },
  { key: "practise", title: "Practise", weekday: 2, start: "17:30", end: "19:30" },
  { key: "latino-ladies", title: "Latino Ladies", weekday: 2, start: "20:00", end: "21:00" },
  { key: "pohybovka", title: "Pohybovka", weekday: 4, start: "17:15", end: "18:00" },
  {
    alternateTitle: "Společná STT",
    key: "spolecna",
    title: "Společná LAT",
    weekday: 4,
    start: "18:00",
    end: "19:30",
  },
  { key: "juniori-patek", title: "Junioři", weekday: 5, start: "16:00", end: "17:00" },
];
const legacyDataDir = path.join(process.cwd(), "data");

let database: Database | null = null;

// One SQLite file holds everything. DATABASE_PATH overrides the default
// location (use a path outside the app folder in production).
export function getDb() {
  if (database) {
    return database;
  }

  const databasePath =
    process.env.DATABASE_PATH?.trim() || path.join(legacyDataDir, "koskovi.sqlite");

  mkdirSync(path.dirname(databasePath), { recursive: true });

  const Sqlite = require("better-sqlite3") as new (filename: string) => Database;
  const db = new Sqlite(databasePath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  database = db;

  return db;
}

function migrate(db: Database) {
  const version = db.pragma("user_version", { simple: true }) as number;

  if (version >= schemaVersion) {
    return;
  }

  db.transaction(() => {
    if (version < 1) {
      migrateToV1(db);
    }

    if (version < 2) {
      migrateToV2(db);
    }

    db.pragma(`user_version = ${schemaVersion}`);
  })();
}

// Regular trainings move from code into the database so they can be added,
// edited and removed; user accounts gain a "deleted" flag for accounts that
// come from server configuration and cannot be removed from it.
function migrateToV2(db: Database) {
  db.exec(`
    CREATE TABLE recurring_trainings (
      key TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      alternate_title TEXT,
      weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
      start TEXT NOT NULL,
      "end" TEXT NOT NULL,
      trainer TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    ALTER TABLE admin_users ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
  `);

  const trainers = new Map(
    (
      db.prepare("SELECT training_key, trainer FROM recurring_trainers").all() as Array<{
        trainer: string;
        training_key: string;
      }>
    ).map((row) => [row.training_key, row.trainer]),
  );
  const insert = db.prepare(`
    INSERT INTO recurring_trainings
      (key, title, alternate_title, weekday, start, "end", trainer, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();

  for (const training of defaultTrainings) {
    insert.run(
      training.key,
      training.title,
      training.alternateTitle ?? null,
      training.weekday,
      training.start,
      training.end,
      trainers.get(training.key) ?? null,
      now,
    );
  }

  db.exec("DROP TABLE recurring_trainers");
}

function migrateToV1(db: Database) {
  {
    db.exec(`
      CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        start TEXT NOT NULL,
        "end" TEXT NOT NULL,
        title TEXT NOT NULL,
        organizer TEXT NOT NULL,
        status TEXT NOT NULL,
        booking_kind TEXT,
        event_type TEXT,
        trainer TEXT,
        note TEXT,
        cleanup_required INTEGER NOT NULL DEFAULT 0,
        cleaned_at TEXT,
        cleaned_by TEXT,
        created_at TEXT,
        created_by TEXT,
        updated_at TEXT,
        updated_by TEXT
      );
      CREATE INDEX IF NOT EXISTS bookings_date ON bookings (date, start);

      CREATE TABLE IF NOT EXISTS recurring_cancellations (id TEXT PRIMARY KEY);

      CREATE TABLE IF NOT EXISTS recurring_overrides (
        id TEXT PRIMARY KEY,
        title TEXT,
        original_title TEXT,
        start TEXT,
        "end" TEXT,
        original_start TEXT,
        original_end TEXT,
        trainer TEXT
      );

      CREATE TABLE IF NOT EXISTS recurring_trainers (
        training_key TEXT PRIMARY KEY,
        trainer TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recurring_holidays (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        start TEXT NOT NULL,
        "end" TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_users (
        username_key TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        password_hash TEXT,
        role TEXT,
        lesson_filter TEXT,
        created_at TEXT,
        created_by TEXT,
        updated_at TEXT,
        updated_by TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        booking_id TEXT,
        details TEXT
      );
    `);

    importLegacyData(db);
  }
}

// Earlier versions stored each collection as one JSON document, either in
// data/*.json files or in a `json_store` table. Import them once.
function importLegacyData(db: Database) {
  const hasJsonStore = Boolean(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'json_store'")
      .get(),
  );

  function readLegacy(key: string) {
    if (hasJsonStore) {
      const row = db.prepare("SELECT value FROM json_store WHERE key = ?").get(key) as
        | { value?: string }
        | undefined;

      if (row?.value) {
        return row.value;
      }
    }

    const filePath = path.join(legacyDataDir, key);

    return existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
  }

  function parseLegacy<T>(key: string): T | null {
    const content = readLegacy(key);

    try {
      return content ? (JSON.parse(content) as T) : null;
    } catch {
      return null;
    }
  }

  const bookings = parseLegacy<Array<Record<string, unknown>>>("bookings.json") ?? [];
  const insertBooking = db.prepare(`
    INSERT OR IGNORE INTO bookings (id, date, start, "end", title, organizer, status,
      booking_kind, event_type, trainer, note, cleanup_required, cleaned_at, cleaned_by,
      created_at, created_by, updated_at, updated_by)
    VALUES (@id, @date, @start, @end, @title, @organizer, @status, @bookingKind,
      @eventType, @trainer, @note, @cleanupRequired, @cleanedAt, @cleanedBy,
      @createdAt, @createdBy, @updatedAt, @updatedBy)
  `);

  for (const booking of Array.isArray(bookings) ? bookings : []) {
    if (typeof booking?.id === "string" && !booking.id.startsWith("recurring-")) {
      insertBooking.run(bookingToRow(booking));
    }
  }

  const cancellations = parseLegacy<string[]>("recurring-cancellations.json") ?? [];

  for (const id of Array.isArray(cancellations) ? cancellations : []) {
    db.prepare("INSERT OR IGNORE INTO recurring_cancellations (id) VALUES (?)").run(id);
  }

  const overrides =
    parseLegacy<Record<string, Record<string, string>>>("recurring-overrides.json") ?? {};

  for (const [id, override] of Object.entries(overrides)) {
    db.prepare(`
      INSERT OR IGNORE INTO recurring_overrides
        (id, title, original_title, start, "end", original_start, original_end, trainer)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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

  const trainers = parseLegacy<Record<string, string>>("recurring-trainers.json") ?? {};

  for (const [key, trainer] of Object.entries(trainers)) {
    if (typeof trainer === "string" && trainer.trim()) {
      db.prepare(
        "INSERT OR IGNORE INTO recurring_trainers (training_key, trainer) VALUES (?, ?)",
      ).run(key, trainer.trim());
    }
  }

  const holidays = parseLegacy<Array<Record<string, string>>>("recurring-holidays.json") ?? [];

  for (const holiday of Array.isArray(holidays) ? holidays : []) {
    db.prepare(
      'INSERT OR IGNORE INTO recurring_holidays (id, label, start, "end") VALUES (?, ?, ?, ?)',
    ).run(holiday.id, holiday.label ?? "Prázdniny", holiday.start, holiday.end);
  }

  const users = parseLegacy<Array<Record<string, unknown>>>("admin-users.json") ?? [];

  for (const user of Array.isArray(users) ? users : []) {
    if (typeof user?.username !== "string") {
      continue;
    }

    db.prepare(`
      INSERT OR IGNORE INTO admin_users (username_key, username, password_hash, role,
        lesson_filter, created_at, created_by, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.username.trim().toLocaleLowerCase("cs-CZ"),
      user.username.trim(),
      user.passwordHash ?? null,
      user.role ?? null,
      user.lessonFilter ? JSON.stringify(user.lessonFilter) : null,
      user.createdAt ?? null,
      user.createdBy ?? null,
      user.updatedAt ?? null,
      user.updatedBy ?? null,
    );
  }

  const auditLog = readLegacy("audit-log.jsonl") ?? "";
  const insertAudit = db.prepare(
    "INSERT INTO audit_log (timestamp, action, actor, booking_id, details) VALUES (?, ?, ?, ?, ?)",
  );

  for (const line of auditLog.split("\n")) {
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;

      insertAudit.run(
        entry.timestamp,
        entry.action,
        entry.actor,
        entry.bookingId ?? null,
        entry.details ? JSON.stringify(entry.details) : null,
      );
    } catch {
      // Skip blank or broken lines.
    }
  }

  if (hasJsonStore) {
    db.exec("DROP TABLE json_store");
  }
}

export function bookingToRow(booking: Record<string, unknown>) {
  return {
    bookingKind: booking.bookingKind ?? null,
    cleanedAt: booking.cleanedAt ?? null,
    cleanedBy: booking.cleanedBy ?? null,
    cleanupRequired: booking.cleanupRequired ? 1 : 0,
    createdAt: booking.createdAt ?? null,
    createdBy: booking.createdBy ?? null,
    date: booking.date,
    end: booking.end,
    eventType: booking.eventType ?? null,
    id: booking.id,
    note: booking.note ?? null,
    organizer: booking.organizer ?? booking.title,
    start: booking.start,
    status: booking.status ?? "confirmed",
    title: booking.title,
    trainer: booking.trainer ?? null,
    updatedAt: booking.updatedAt ?? null,
    updatedBy: booking.updatedBy ?? null,
  };
}
