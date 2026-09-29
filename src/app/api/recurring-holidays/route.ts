import { NextRequest, NextResponse } from "next/server";
import { requireManager, requireSession } from "@/lib/api-auth";
import { isDateKey } from "@/lib/booking-validation";
import {
  addRecurringHoliday,
  deleteRecurringHoliday,
  getRecurringHolidays,
} from "@/lib/bookings-db";

export const dynamic = "force-dynamic";

const maxLabelLength = 80;

export async function GET() {
  const auth = await requireSession();

  if (auth.error) {
    return auth.error;
  }

  return NextResponse.json(
    { holidays: await getRecurringHolidays() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireManager();

  if (auth.error) {
    return auth.error;
  }

  const payload = (await request.json()) as {
    end?: unknown;
    label?: unknown;
    start?: unknown;
  };
  const label = typeof payload.label === "string" ? payload.label.trim() : "";

  if (
    !isDateKey(payload.start) ||
    !isDateKey(payload.end) ||
    payload.start > payload.end
  ) {
    return NextResponse.json(
      { message: "Vyber platné období prázdnin." },
      { status: 400 },
    );
  }

  if (label.length > maxLabelLength) {
    return NextResponse.json(
      { message: `Název období může mít nejvýš ${maxLabelLength} znaků.` },
      { status: 400 },
    );
  }

  const holiday = await addRecurringHoliday({
    end: payload.end,
    label,
    start: payload.start,
  });

  return NextResponse.json({ holiday });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireManager();

  if (auth.error) {
    return auth.error;
  }

  const payload = (await request.json()) as { id?: unknown };

  if (typeof payload.id !== "string" || !payload.id) {
    return NextResponse.json({ message: "Chybí období." }, { status: 400 });
  }

  await deleteRecurringHoliday(payload.id);

  return NextResponse.json({ deleted: true });
}
