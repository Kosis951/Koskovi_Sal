import { getDb } from "@/lib/db";

// Once the log reaches the limit, the oldest entries are dropped down to the
// target, so trimming does not run on every append.
const maxAuditLogBytes = 20 * 1024 * 1024;
const targetTrimBytes = 15 * 1024 * 1024;
const trimCheckInterval = 100;

let appendsSinceTrimCheck = trimCheckInterval;

export type AuditAction =
  | "booking.clean"
  | "booking.create"
  | "booking.delete"
  | "booking.rename"
  | "booking.undo"
  | "booking.update";

export type AuditLogEntry = {
  action: AuditAction;
  actor: string;
  bookingId?: string;
  details?: Record<string, unknown>;
  timestamp: string;
};

type AuditLogRow = {
  action: AuditAction;
  actor: string;
  booking_id: string | null;
  details: string | null;
  timestamp: string;
};

export async function appendAuditLog(entry: Omit<AuditLogEntry, "timestamp">) {
  getDb()
    .prepare(
      "INSERT INTO audit_log (timestamp, action, actor, booking_id, details) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      new Date().toISOString(),
      entry.action,
      entry.actor,
      entry.bookingId ?? null,
      entry.details ? JSON.stringify(entry.details) : null,
    );

  appendsSinceTrimCheck += 1;

  if (appendsSinceTrimCheck >= trimCheckInterval) {
    appendsSinceTrimCheck = 0;
    trimAuditLog();
  }

  // Every booking change is logged here, so this is where changes to today
  // get announced right away (instead of on the next minute check). Imported
  // lazily to keep push code out of this module's dependencies.
  void import("@/lib/push-notifications")
    .then(({ queuePushCheck }) => queuePushCheck())
    .catch((error) => console.error("[push] kontrolu nešlo naplánovat:", error));
}

// Newest first.
export async function readAuditLog(limit = 100) {
  const rows = getDb()
    .prepare(
      "SELECT timestamp, action, actor, booking_id, details FROM audit_log ORDER BY id DESC LIMIT ?",
    )
    .all(limit) as AuditLogRow[];

  return rows.map(
    (row): AuditLogEntry => ({
      action: row.action,
      actor: row.actor,
      bookingId: row.booking_id ?? undefined,
      details: row.details ? (JSON.parse(row.details) as Record<string, unknown>) : undefined,
      timestamp: row.timestamp,
    }),
  );
}

function trimAuditLog() {
  const db = getDb();
  const sizeOf =
    "COALESCE(length(details), 0) + length(timestamp) + length(action) + length(actor)";
  const { total } = db.prepare(`SELECT COALESCE(SUM(${sizeOf}), 0) AS total FROM audit_log`).get() as {
    total: number;
  };

  if (total <= maxAuditLogBytes) {
    return;
  }

  // Find the newest entries that fit into the target size and drop the rest.
  const cutoff = db
    .prepare(
      `SELECT id FROM (
         SELECT id, SUM(${sizeOf}) OVER (ORDER BY id DESC) AS running
         FROM audit_log
       ) WHERE running > ? ORDER BY id DESC LIMIT 1`,
    )
    .get(targetTrimBytes) as { id: number } | undefined;

  if (cutoff) {
    db.prepare("DELETE FROM audit_log WHERE id <= ?").run(cutoff.id);
  }
}
