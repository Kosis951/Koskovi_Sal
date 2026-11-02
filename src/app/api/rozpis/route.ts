import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/api-auth";
import { canManageBookings, getAdminAccess } from "@/lib/auth";
import { maxScheduleBodyLength, maxScheduleTitleLength } from "@/lib/public-schedule";
import { getPublicSchedule, savePublicSchedule } from "@/lib/public-schedule-db";

export const dynamic = "force-dynamic";

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

// { title, body, published } – hall managers only.
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

  if (published && !body) {
    return NextResponse.json({ message: "Prázdný rozpis nejde zveřejnit." }, { status: 400 });
  }

  const schedule = savePublicSchedule({ body, published, title }, auth.access.username);

  return NextResponse.json({
    message: published ? "Uloženo a zveřejněno." : "Uloženo (zatím nezveřejněno).",
    schedule,
  });
}
