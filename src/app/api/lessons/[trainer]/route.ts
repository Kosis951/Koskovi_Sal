import { NextRequest, NextResponse } from "next/server";
import { isDateKey, isTimeValue } from "@/lib/booking-validation";
import { getDisplayName, requireTrainerAccess } from "@/lib/lessons-auth";
import { getTrainerCalendar, maxLessonNoteLength, requestLesson } from "@/lib/lessons-db";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ trainer: string }> };

// The trainer's calendar as the signed-in user may see it: free and taken
// slots, the user's own requests, and for the trainer everything with names.
export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireTrainerAccess((await context.params).trainer);

  if (auth.error) {
    return auth.error;
  }

  return NextResponse.json(
    getTrainerCalendar(auth.trainer, { canManage: auth.canManage, username: auth.access.username }),
    { headers: { "Cache-Control": "no-store" } },
  );
}

// Request a free slot: { date, start, end, note? }.
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireTrainerAccess((await context.params).trainer);

  if (auth.error) {
    return auth.error;
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const note = typeof payload?.note === "string" ? payload.note.trim() : "";

  if (!isDateKey(payload?.date) || !isTimeValue(payload?.start) || !isTimeValue(payload?.end)) {
    return NextResponse.json({ message: "Neplatný termín." }, { status: 400 });
  }

  if (note.length > maxLessonNoteLength) {
    return NextResponse.json(
      { message: `Poznámka může mít nejvýš ${maxLessonNoteLength} znaků.` },
      { status: 400 },
    );
  }

  const result = requestLesson({
    date: payload.date,
    end: payload.end,
    note,
    requester: getDisplayName(auth.access.username),
    start: payload.start,
    trainer: auth.trainer,
  });

  if ("error" in result) {
    return NextResponse.json({ message: result.error }, { status: result.status });
  }

  return NextResponse.json({ lesson: result.lesson, message: "Žádost je odeslaná." });
}
