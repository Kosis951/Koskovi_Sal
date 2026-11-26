import { NextRequest, NextResponse } from "next/server";
import { setScheduleLink } from "@/lib/admin-users-db";
import { requireSession } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// { confirm: boolean } – the answer to "Are these lessons in the schedule
// yours?" (found by the account's surname and first name).
export async function POST(request: NextRequest) {
  const auth = await requireSession();

  if (auth.error) {
    return auth.error;
  }

  const payload = (await request.json().catch(() => null)) as { confirm?: unknown } | null;

  if (typeof payload?.confirm !== "boolean") {
    return NextResponse.json({ message: "Chybí odpověď." }, { status: 400 });
  }

  await setScheduleLink(auth.access.username, payload.confirm ? "confirmed" : "declined");

  return NextResponse.json({
    message: payload.confirm
      ? "Hotovo, tvoje lekce z rozpisu se teď propojují samy."
      : "Dobře, podle jména je propojovat nebudeme. Jméno v rozpisu můžeš vyplnit v profilu.",
  });
}
