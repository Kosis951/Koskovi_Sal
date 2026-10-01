import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit-log";
import { requireBookingEditor } from "@/lib/api-auth";
import { getTimeRangeError } from "@/lib/booking-validation";
import { getBookings, updateBookingTime } from "@/lib/bookings-db";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const existing =(await getBookings()).find((booking) => booking.id === id);
  const auth = await requireBookingEditor(existing);

  if (auth.error) {
    return auth.error;
  }

  const actor = auth.access.username;
  const payload = (await request.json()) as {
    end?: unknown;
    start?: unknown;
  };
  const start = typeof payload.start === "string" ? payload.start.trim() : "";
  const end = typeof payload.end === "string" ? payload.end.trim() : "";
  const timeError = getTimeRangeError(start, end);

  if (timeError) {
    return NextResponse.json({ message: timeError }, { status: 400 });
  }

  const previousBooking = (await getBookings()).find(
    (booking) => booking.id === id,
  );
  const result = await updateBookingTime(id, start, end);

  if (result.notFound) {
    return NextResponse.json(
      { message: "Akce nebyla nalezena." },
      { status: 404 },
    );
  }

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
      action: "booking.update",
      actor,
      bookingId: result.booking.id,
      details: {
        booking: result.booking,
        date: result.booking.date,
        end: result.booking.end,
        previousBooking,
        start: result.booking.start,
        title: result.booking.title,
      },
    });
  }

  return NextResponse.json({ booking: result.booking });
}
