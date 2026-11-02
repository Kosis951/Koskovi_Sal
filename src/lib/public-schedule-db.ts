import { getDb } from "@/lib/db";

// The one public schedule (see public-schedule.ts for its text format).
export type PublicSchedule = {
  body: string;
  published: boolean;
  title: string;
  updatedAt?: string;
  updatedBy?: string;
};

const defaultTitle = "Externí trenér";

type ScheduleRow = {
  body: string;
  published: number;
  title: string;
  updated_at: string | null;
  updated_by: string | null;
};

export function getPublicSchedule(): PublicSchedule {
  const row = getDb()
    .prepare("SELECT title, body, published, updated_at, updated_by FROM public_schedule WHERE id = 1")
    .get() as ScheduleRow | undefined;

  if (!row) {
    return { body: "", published: false, title: defaultTitle };
  }

  return {
    body: row.body,
    published: row.published === 1,
    title: row.title,
    updatedAt: row.updated_at ?? undefined,
    updatedBy: row.updated_by ?? undefined,
  };
}

export function savePublicSchedule(
  input: { body: string; published: boolean; title: string },
  actor: string,
): PublicSchedule {
  const updatedAt = new Date().toISOString();
  const title = input.title || defaultTitle;

  getDb()
    .prepare(
      `INSERT INTO public_schedule (id, title, body, published, updated_at, updated_by)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, body = excluded.body,
         published = excluded.published, updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
    .run(title, input.body, input.published ? 1 : 0, updatedAt, actor);

  return { body: input.body, published: input.published, title, updatedAt, updatedBy: actor };
}
