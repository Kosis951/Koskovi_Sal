import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { refreshRecurringBookings } from "@/lib/bookings-db";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { message: "CRON_SECRET není nastavený." },
      { status: 503 },
    );
  }

  const providedSecret =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.nextUrl.searchParams.get("secret") ??
    "";

  if (secret && !safeCompare(providedSecret, secret)) {
    return NextResponse.json({ message: "Neplatný cron secret." }, { status: 401 });
  }

  const result = await refreshRecurringBookings();

  return NextResponse.json({
    ok: true,
    recurringCount: result.recurringCount,
    bookingCount: result.bookings.length,
  });
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
