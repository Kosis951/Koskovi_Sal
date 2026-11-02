import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/api-auth";
import { appendAuditLog } from "@/lib/audit-log";
import { canManageBookings, getAdminAccess } from "@/lib/auth";
import { syncScheduleBookings } from "@/lib/bookings-db";
import {
  getScheduleBlocks,
  maxScheduleBodyLength,
  maxScheduleTitleLength,
  parseSchedule,
} from "@/lib/public-schedule";
import { getPublicSchedule, savePublicSchedule } from "@/lib/public-schedule-db";

export const dynamic = "force-dynamic";

const pragueDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" });
const shortDay = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", weekday: "short" });

// Public: the schedule once it is published (the header asks whether to show
// its tab). Hall managers also get the unpublished draft.
export async function GET() {
  const schedule = getPublicSchedule();
  const canEdit = canManageBookings(getAdminAccess(await cookies()));

  return NextResponse.json(
    schedule.published || canEdit
      ? schedule
      : { body: "", published: false, title: schedule.title },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// { title, body, published, cancelTrainings } – hall managers only. A
// published schedule puts one block per day into the hall calendar; an
// unpublished one takes them out again.
export async function PUT(request: NextRequest) {
  const auth = await requireManager();

  if (auth.error) {
    return auth.error;
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const title = typeof payload?.title === "string" ? payload.title.replace(/\s+/g, " ").trim() : "";
  const body = typeof payload?.body === "string" ? payload.body.replace(/\r\n/g, "\n").trim() : "";

  if (title.length > maxScheduleTitleLength) {
    return NextResponse.json(
      { message: `Název může mít nejvýš ${maxScheduleTitleLength} znaků.` },
      { status: 400 },
    );
  }

  if (body.length > maxScheduleBodyLength) {
    return NextResponse.json(
      { message: `Rozpis může mít nejvýš ${maxScheduleBodyLength} znaků.` },
      { status: 400 },
    );
  }

  const published = payload?.published === true;
  const cancelTrainings = payload?.cancelTrainings === true;

  if (published && !body) {
    return NextResponse.json({ message: "Prázdný rozpis nejde zveřejnit." }, { status: 400 });
  }

  const actor = auth.access.username;
  const schedule = savePublicSchedule({ body, cancelTrainings, published, title }, actor);
  const sync = await syncScheduleBookings({
    actor,
    blocks: published ? getScheduleBlocks(parseSchedule(body, pragueDate.format(new Date()))) : [],
    cancelTrainings,
    title: schedule.title,
  });

  // Logged like any other change, so it is in the history and today's
  // changes go out as notifications.
  for (const [action, list] of [
    ["booking.create", sync.created],
    ["booking.update", sync.updated],
    ["booking.delete", sync.removed],
  ] as const) {
    for (const booking of list) {
      await appendAuditLog({
        action,
        actor,
        bookingId: booking.id,
        details: {
          booking,
          date: booking.date,
          end: booking.end,
          previousBooking: sync.previous.find((old) => old.id === booking.id),
          start: booking.start,
          title: booking.title,
        },
      });
    }
  }

  const skipped = sync.skipped.map(
    ({ conflict, date }) =>
      `${shortDay.format(new Date(`${date}T12:00:00`))} (koliduje s ${conflict.title} ${conflict.start}–${conflict.end})`,
  );

  return NextResponse.json({
    message: [
      published ? "Uloženo a zveřejněno." : "Uloženo (zatím nezveřejněno).",
      skipped.length > 0 ? `Do kalendáře sálu se nevešlo: ${skipped.join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    schedule,
    skipped: skipped.length,
  });
}
