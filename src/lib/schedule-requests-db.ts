import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { lessonKey } from "@/lib/public-schedule";

// Requests from the public schedule to cancel a lesson or move it elsewhere.
// Nothing changes by itself: a manager answers and edits the schedule.

export type ScheduleRequest = {
  createdAt: string;
  date: string;
  doneAt?: string;
  doneBy?: string;
  end: string;
  id: string;
  kind: "cancel" | "move";
  lessonName: string;
  note?: string;
  phone?: string;
  // When a move would suit (free text).
  preferred?: string;
  requesterName: string;
  start: string;
  status: "done" | "pending";
};

export type ScheduleRequestInput = Omit<
  ScheduleRequest,
  "createdAt" | "doneAt" | "doneBy" | "id" | "status"
>;

type RequestRow = {
  created_at: string;
  date: string;
  done_at: string | null;
  done_by: string | null;
  end: string;
  id: string;
  kind: "cancel" | "move";
  lesson_name: string;
  note: string | null;
  phone: string | null;
  preferred: string | null;
  requester_name: string;
  start: string;
  status: "done" | "pending";
};

// Keys of lessons with a pending request, for the public page.
export function getPendingLessonKeys() {
  const rows = getDb()
    .prepare("SELECT date, start, lesson_name FROM schedule_requests WHERE status = 'pending'")
    .all() as Array<{ date: string; lesson_name: string; start: string }>;

  return rows.map((row) => lessonKey({ date: row.date, lessonName: row.lesson_name, start: row.start }));
}

// Pending ones first (by lesson time), then the most recently done.
export function getScheduleRequests(): ScheduleRequest[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM schedule_requests
       ORDER BY status = 'done',
         CASE WHEN status = 'pending' THEN date || ' ' || start END,
         done_at DESC
       LIMIT 100`,
    )
    .all() as RequestRow[];

  return rows.map((row) => ({
    createdAt: row.created_at,
    date: row.date,
    doneAt: row.done_at ?? undefined,
    doneBy: row.done_by ?? undefined,
    end: row.end,
    id: row.id,
    kind: row.kind,
    lessonName: row.lesson_name,
    note: row.note ?? undefined,
    phone: row.phone ?? undefined,
    preferred: row.preferred ?? undefined,
    requesterName: row.requester_name,
    start: row.start,
    status: row.status,
  }));
}

// Null when a request for this lesson is already waiting.
export function addScheduleRequest(input: ScheduleRequestInput) {
  if (getPendingLessonKeys().includes(lessonKey(input))) {
    return null;
  }

  const id = randomUUID();

  getDb()
    .prepare(
      `INSERT INTO schedule_requests (id, date, start, "end", lesson_name, kind, preferred,
         requester_name, phone, note, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    )
    .run(
      id,
      input.date,
      input.start,
      input.end,
      input.lessonName,
      input.kind,
      input.preferred ?? null,
      input.requesterName,
      input.phone ?? null,
      input.note ?? null,
      new Date().toISOString(),
    );

  return id;
}

export function setScheduleRequestStatus(id: string, status: "done" | "pending", actor: string) {
  const done = status === "done";

  return (
    getDb()
      .prepare("UPDATE schedule_requests SET status = ?, done_at = ?, done_by = ? WHERE id = ?")
      .run(status, done ? new Date().toISOString() : null, done ? actor : null, id).changes > 0
  );
}
