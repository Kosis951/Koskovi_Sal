import { NextRequest, NextResponse } from "next/server";
import { getTimeRangeError, isDateKey } from "@/lib/booking-validation";
import { forbidden, requireTrainerAccess } from "@/lib/lessons-auth";
import {
  addTrainerWindow,
  deleteTrainerWindow,
  lessonLengths,
  type TrainerWindowInput,
} from "@/lib/lessons-db";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ trainer: string }> };

// Add a time the trainer can teach: weekly ({ weekday, validFrom?, validUntil? })
// or one day ({ date }), with { start, end, lessonMinutes }.
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireTrainerAccess((await context.params).trainer);

  if (auth.error) {
    return auth.error;
  }

  if (!auth.canManage) {
    return forbidden();
  }

  const parsed = parseWindow(await request.json().catch(() => null));

  if ("error" in parsed) {
    return NextResponse.json({ message: parsed.error }, { status: 400 });
  }

  const result = addTrainerWindow(auth.trainer, parsed.input);

  if ("error" in result) {
    return NextResponse.json({ message: result.error }, { status: 409 });
  }

  return NextResponse.json({ message: "Nabídka je přidaná.", window: result.window });
}

// Remove an offered time: { id }. Requested and confirmed lessons stay.
export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireTrainerAccess((await context.params).trainer);

  if (auth.error) {
    return auth.error;
  }

  if (!auth.canManage) {
    return forbidden();
  }

  const payload = (await request.json().catch(() => null)) as { id?: unknown } | null;

  if (typeof payload?.id !== "string" || !deleteTrainerWindow(auth.trainer, payload.id)) {
    return NextResponse.json({ message: "Nabídka nenalezena." }, { status: 404 });
  }

  return NextResponse.json({ deleted: true, message: "Nabídka je smazaná." });
}

function parseWindow(payload: unknown): { error: string } | { input: TrainerWindowInput } {
  const value = (payload ?? {}) as Record<string, unknown>;
  const timeError = getTimeRangeError(value.start, value.end);
  const lessonMinutes = Number(value.lessonMinutes);
  const optionalDate = (field: string) =>
    typeof value[field] === "string" && value[field] ? (value[field] as string) : undefined;
  const date = optionalDate("date");
  const validFrom = optionalDate("validFrom");
  const validUntil = optionalDate("validUntil");
  const weekday = value.weekday === undefined || value.weekday === null ? undefined : Number(value.weekday);

  if (timeError) {
    return { error: timeError };
  }

  if (!lessonLengths.includes(lessonMinutes)) {
    return { error: "Vyber délku lekce." };
  }

  const [start, end] = [value.start as string, value.end as string];
  const windowMinutes = toMinutes(end) - toMinutes(start);

  if (windowMinutes < lessonMinutes) {
    return { error: "Do tohoto času se nevejde ani jedna lekce." };
  }

  if ([date, validFrom, validUntil].some((item) => item && !isDateKey(item))) {
    return { error: "Neplatné datum." };
  }

  if (date) {
    return { input: { date, end, lessonMinutes, start } };
  }

  if (weekday === undefined || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    return { error: "Vyber den v týdnu nebo konkrétní datum." };
  }

  if (validFrom && validUntil && validUntil < validFrom) {
    return { error: "Konec období musí být po jeho začátku." };
  }

  return { input: { end, lessonMinutes, start, validFrom, validUntil, weekday } };
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}
