import { NextRequest, NextResponse } from "next/server";
import { requireManager, requireSession } from "@/lib/api-auth";
import {
  getTimeRangeError,
  maxBookingTitleLength,
  maxTrainerLength,
} from "@/lib/booking-validation";
import {
  createRecurringTraining,
  deleteRecurringTraining,
  getRecurringTrainings,
  updateRecurringTraining,
  type RecurringTrainingInput,
} from "@/lib/bookings-db";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSession();

  if (auth.error) {
    return auth.error;
  }

  return NextResponse.json(
    { trainings: await getRecurringTrainings() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireManager();

  if (auth.error) {
    return auth.error;
  }

  const parsed = parseTraining(await request.json());

  if (!parsed.ok) {
    return NextResponse.json({ message: parsed.error }, { status: 400 });
  }

  const training = await createRecurringTraining(parsed.input);

  return NextResponse.json({ message: "Trénink je přidaný.", training });
}

export async function PUT(request: NextRequest) {
  const auth = await requireManager();

  if (auth.error) {
    return auth.error;
  }

  const payload = (await request.json()) as { key?: unknown };
  const parsed = parseTraining(payload);

  if (typeof payload.key !== "string" || !payload.key) {
    return NextResponse.json({ message: "Chybí trénink." }, { status: 400 });
  }

  if (!parsed.ok) {
    return NextResponse.json({ message: parsed.error }, { status: 400 });
  }

  const training = await updateRecurringTraining(payload.key, parsed.input);

  if (!training) {
    return NextResponse.json({ message: "Trénink nenalezen." }, { status: 404 });
  }

  return NextResponse.json({ message: "Trénink je uložený.", training });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireManager();

  if (auth.error) {
    return auth.error;
  }

  const payload = (await request.json()) as { key?: unknown };

  if (typeof payload.key !== "string" || !payload.key) {
    return NextResponse.json({ message: "Chybí trénink." }, { status: 400 });
  }

  if (!(await deleteRecurringTraining(payload.key))) {
    return NextResponse.json({ message: "Trénink nenalezen." }, { status: 404 });
  }

  return NextResponse.json({ deleted: true, message: "Trénink je smazaný." });
}

function parseTraining(
  payload: unknown,
): { error: string; ok: false } | { input: RecurringTrainingInput; ok: true } {
  const value = (payload ?? {}) as Record<string, unknown>;
  const text = (field: string) =>
    typeof value[field] === "string" ? (value[field] as string).trim() : "";
  const title = text("title");
  const alternateTitle = text("alternateTitle");
  const trainer = text("trainer");
  const weekday = Number(value.weekday);

  if (!title || title.length > maxBookingTitleLength) {
    return { error: `Název musí mít 1 až ${maxBookingTitleLength} znaků.`, ok: false };
  }

  if (alternateTitle.length > maxBookingTitleLength) {
    return { error: "Střídavý název je příliš dlouhý.", ok: false };
  }

  if (trainer.length > maxTrainerLength) {
    return { error: "Jméno trenéra je příliš dlouhé.", ok: false };
  }

  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    return { error: "Vyber den v týdnu.", ok: false };
  }

  const timeError = getTimeRangeError(value.start, value.end);

  if (timeError) {
    return { error: timeError, ok: false };
  }

  return {
    input: {
      alternateTitle: alternateTitle || undefined,
      end: value.end as string,
      start: value.start as string,
      title,
      trainer: trainer || undefined,
      weekday,
    },
    ok: true,
  };
}
