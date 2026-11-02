import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/api-auth";
import { getClientIp } from "@/lib/login-rate-limit";
import { nameKey, parseSchedule } from "@/lib/public-schedule";
import { getPublicSchedule } from "@/lib/public-schedule-db";
import { addScheduleRequest, getScheduleRequests } from "@/lib/schedule-requests-db";
import { isRateLimited } from "@/lib/simple-rate-limit";
import { maxPhoneInputLength, normalizePhone } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const maxNameLength = 60;
const maxPreferredLength = 120;
const maxNoteLength = 300;
const pragueNow = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  timeZone: "Europe/Prague",
  year: "numeric",
});

// All requests – hall managers only.
export async function GET() {
  const auth = await requireManager();

  if (auth.error) {
    return auth.error;
  }

  return NextResponse.json(
    { requests: getScheduleRequests() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// From the public schedule, without signing in: { date, start, lessonName,
// kind: "cancel" | "move", preferred?, requesterName, phone?, note? }. Only for
// a lesson that is in the published schedule and still ahead.
export async function POST(request: NextRequest) {
  if (isRateLimited(`schedule-request:${getClientIp(request.headers)}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json(
      { message: "Příliš mnoho žádostí z jednoho místa, zkus to později." },
      { status: 429 },
    );
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const text = (field: string) => {
    const value = payload?.[field];

    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  };
  const kind = payload?.kind === "move" ? "move" : payload?.kind === "cancel" ? "cancel" : null;
  const requesterName = text("requesterName");
  const preferred = text("preferred");
  const note = text("note");
  const phoneInput = text("phone");
  const phone = phoneInput.length > maxPhoneInputLength ? null : normalizePhone(phoneInput);

  if (!kind) {
    return NextResponse.json({ message: "Vyber, jestli lekci zrušit, nebo přesunout." }, { status: 400 });
  }

  if (!requesterName || requesterName.length > maxNameLength) {
    return NextResponse.json({ message: "Vyplň své jméno." }, { status: 400 });
  }

  if (preferred.length > maxPreferredLength || note.length > maxNoteLength) {
    return NextResponse.json({ message: "Text je příliš dlouhý." }, { status: 400 });
  }

  if (phone === null) {
    return NextResponse.json(
      { message: "Telefon zadej jako číslo, např. 777 123 456 nebo +421 900 123 456." },
      { status: 400 },
    );
  }

  // The lesson has to be in the published schedule and not over yet.
  const schedule = getPublicSchedule();
  const parts = Object.fromEntries(pragueNow.formatToParts(new Date()).map((part) => [part.type, part.value]));
  const todayKey = `${parts.year}-${parts.month}-${parts.day}`;
  const nowTime = `${parts.hour}:${parts.minute}`;
  const lessonName = text("lessonName");
  const day = schedule.published
    ? parseSchedule(schedule.body, todayKey).find((item) => item.dateKey === payload?.date)
    : undefined;
  const row = day?.rows.find(
    (item) =>
      item.kind === "lesson" &&
      item.start === payload?.start &&
      nameKey(item.text) === nameKey(lessonName),
  );

  if (!day?.dateKey || !row?.start || !row.end) {
    return NextResponse.json({ message: "Tahle lekce už v rozpisu není." }, { status: 404 });
  }

  if (day.dateKey < todayKey || (day.dateKey === todayKey && row.end <= nowTime)) {
    return NextResponse.json({ message: "Tahle lekce už proběhla." }, { status: 400 });
  }

  const id = addScheduleRequest({
    date: day.dateKey,
    end: row.end,
    kind,
    lessonName: row.text,
    note: note || undefined,
    phone: phone || undefined,
    preferred: kind === "move" ? preferred || undefined : undefined,
    requesterName,
    start: row.start,
  });

  if (!id) {
    return NextResponse.json(
      { message: "O tuhle lekci už žádost čeká, ozveme se." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    message:
      kind === "cancel"
        ? "Žádost o zrušení je odeslaná. Lekce platí, dokud ti ji nepotvrdíme."
        : "Žádost o přesun je odeslaná. Ozveme se s novým časem.",
  });
}
