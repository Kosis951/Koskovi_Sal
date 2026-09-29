import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit-log";
import { requireManager } from "@/lib/api-auth";
import { parseBookingInput } from "@/lib/booking-validation";
import { createBooking } from "@/lib/bookings-db";
import type { BookingRequest } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireManager();

  if (auth.error) {
    return auth.error;
  }

  const actor = auth.access.username;
  const payload = (await request.json()) as Partial<BookingRequest>;
  const name = typeof payload.name === "string" ? payload.name.trim() : "";

  if (!name || !payload.date || !payload.start || !payload.end) {
    return NextResponse.json(
      { message: "Chybí povinné údaje rezervace." },
      { status: 400 },
    );
  }

  if (payload.bookingKind === "individual-lesson" && !payload.trainer) {
    return NextResponse.json(
      { message: "Pro soustředění vyber trenéra." },
      { status: 400 },
    );
  }

  const isIndividualLesson = payload.bookingKind === "individual-lesson";

  if (!isIndividualLesson && !isHallEventType(payload.eventType)) {
    return NextResponse.json(
      { message: "Vyber platný typ rezervace." },
      { status: 400 },
    );
  }

  const trainer =
    (isIndividualLesson || payload.eventType === "seminar") &&
    typeof payload.trainer === "string"
      ? payload.trainer.trim()
      : "";
  const note = typeof payload.note === "string" ? payload.note.trim() : "";
  const parsed = parseBookingInput({
    bookingKind: isIndividualLesson ? "individual-lesson" : "hall",
    cleanupRequired: payload.cleanupRequired === true,
    date: payload.date,
    end: payload.end,
    eventType: isIndividualLesson ? undefined : payload.eventType,
    note: [trainer ? `Trenér: ${trainer}` : null, note]
      .filter(Boolean)
      .join("\n"),
    organizer: name,
    start: payload.start,
    status: payload.eventType === "obsazeno" ? "maintenance" : "confirmed",
    title: name,
    trainer,
  });

  if (!parsed.ok) {
    return NextResponse.json({ message: parsed.error }, { status: 400 });
  }

  const result = await createBooking({
    ...parsed.input,
    createdBy: actor,
  });

  if (result.conflict) {
    return NextResponse.json(
      {
        message: "V tomto čase už existuje jiná akce.",
        conflict: result.conflict,
      },
      { status: 409 },
    );
  }

  if (result.booking) {
    await appendAuditLog({
      action: "booking.create",
      actor,
      bookingId: result.booking.id,
      details: {
        booking: result.booking,
        date: result.booking.date,
        end: result.booking.end,
        start: result.booking.start,
        title: result.booking.title,
      },
    });
  }

  return NextResponse.json(
    {
      status: "accepted",
      source: "database",
      message: "Rezervace je uložena v databázi.",
      booking: result.booking,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function isHallEventType(
  eventType: string | undefined,
): eventType is "soustredeni" | "seminar" | "obsazeno" {
  return ["soustredeni", "seminar", "obsazeno"].includes(eventType ?? "");
}
