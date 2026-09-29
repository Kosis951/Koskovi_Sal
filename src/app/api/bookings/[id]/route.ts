import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit-log";
import { requireManager } from "@/lib/api-auth";
import { parseBookingInput } from "@/lib/booking-validation";
import {
  deleteBooking,
  getBookings,
  updateBooking,
} from "@/lib/bookings-db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireManager();

  if (auth.error) {
    return auth.error;
  }

  const actor = auth.access.username;
  const { id } = await context.params;
  const parsed = parseBookingInput(await request.json());

  if (!parsed.ok) {
    return NextResponse.json({ message: parsed.error }, { status: 400 });
  }

  const previousBooking = (await getBookings()).find((booking) => booking.id === id);
  const result = await updateBooking(id, {
    ...parsed.input,
    updatedBy: actor,
  });

  if (result.notFound) {
    return NextResponse.json({ message: "Akce nenalezena." }, { status: 404 });
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
        date: result.booking.date,
        end: result.booking.end,
        booking: result.booking,
        previousBooking,
        start: result.booking.start,
        title: result.booking.title,
      },
    });
  }

  return NextResponse.json({ booking: result.booking });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireManager();

  if (auth.error) {
    return auth.error;
  }

  const actor = auth.access.username;
  const { id } = await context.params;
  const existingBooking = (await getBookings()).find((booking) => booking.id === id);
  const deleted = await deleteBooking(id);

  if (!deleted) {
    return NextResponse.json({ message: "Akce nenalezena." }, { status: 404 });
  }

  await appendAuditLog({
    action: "booking.delete",
    actor,
    bookingId: id,
    details: existingBooking
      ? {
          date: existingBooking.date,
          end: existingBooking.end,
          booking: existingBooking,
          start: existingBooking.start,
          title: existingBooking.title,
        }
      : undefined,
  });

  return NextResponse.json({ deleted: true });
}
