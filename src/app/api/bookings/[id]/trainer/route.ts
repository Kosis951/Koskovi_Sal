import { NextRequest, NextResponse } from "next/server";
import { requireBookingEditor } from "@/lib/api-auth";
import { maxTrainerLength } from "@/lib/booking-validation";
import { getBookings, updateBookingTrainer } from "@/lib/bookings-db";

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

  const payload = (await request.json()) as { trainer?: unknown };
  const trainer = typeof payload.trainer === "string" ? payload.trainer : "";

  if (trainer.trim().length > maxTrainerLength) {
    return NextResponse.json(
      { message: "Jméno trenéra je příliš dlouhé." },
      { status: 400 },
    );
  }

  const result = await updateBookingTrainer(id, trainer);

  if (result.notFound) {
    return NextResponse.json({ message: "Akce nenalezena." }, { status: 404 });
  }

  return NextResponse.json(
    { booking: result.booking },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
