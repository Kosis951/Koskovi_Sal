import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit-log";
import { requireManager } from "@/lib/api-auth";
import { maxBookingTitleLength } from "@/lib/booking-validation";
import {
  getBookings,
  updateBookingTitle,
} from "@/lib/bookings-db";

export const dynamic = "force-dynamic";

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
  const payload = (await request.json()) as { title?: unknown };
  const title = typeof payload.title === "string" ? payload.title.trim() : "";

  if (!title || title.length > maxBookingTitleLength) {
    return NextResponse.json(
      {
        message: `Vyplň nový název aktivity (max. ${maxBookingTitleLength} znaků).`,
      },
      { status: 400 },
    );
  }

  const previousBooking = (await getBookings()).find(
    (booking) => booking.id === id,
  );
  const booking = await updateBookingTitle(id, title);

  if (!booking) {
    return NextResponse.json(
      { message: "Akce nebyla nalezena." },
      { status: 404 },
    );
  }

  await appendAuditLog({
    action: "booking.rename",
    actor,
    bookingId: booking.id,
    details: {
      booking,
      date: booking.date,
      end: booking.end,
      previousBooking,
      start: booking.start,
      title: booking.title,
    },
  });

  return NextResponse.json({ booking });
}
