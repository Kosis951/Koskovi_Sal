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

const schemaVersion = 1;
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
    db.pragma(`user_version = ${schemaVersion}`);
  })();
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
