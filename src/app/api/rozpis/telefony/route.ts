import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/api-auth";
import { getContactPhones, setContactPhone } from "@/lib/contact-phones-db";
import { maxPhoneInputLength, normalizePhone } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const maxNameLength = 60;

// Phone numbers of the people in the public schedule – hall managers only.
export async function GET() {
  const auth = await requireManager();

  if (auth.error) {
    return auth.error;
  }

  return NextResponse.json(
    { phones: getContactPhones() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// { name, phone } – an empty phone removes the number.
export async function PUT(request: NextRequest) {
  const auth = await requireManager();

  if (auth.error) {
    return auth.error;
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof payload?.name === "string" ? payload.name.replace(/\s+/g, " ").trim() : "";
  const phoneInput = typeof payload?.phone === "string" ? payload.phone : "";
  const phone = phoneInput.length > maxPhoneInputLength ? null : normalizePhone(phoneInput);

  if (!name || name.length > maxNameLength) {
    return NextResponse.json({ message: "Chybí jméno." }, { status: 400 });
  }

  if (phone === null) {
    return NextResponse.json(
      { message: "Telefon zadej jako číslo, např. 777 123 456 nebo +421 900 123 456." },
      { status: 400 },
    );
  }

  setContactPhone(name, phone, auth.access.username);

  return NextResponse.json({ phone });
}
