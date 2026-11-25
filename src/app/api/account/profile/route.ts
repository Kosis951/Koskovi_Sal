import { NextRequest, NextResponse } from "next/server";
import { getUserProfile, isEmailTaken, updateUserProfile } from "@/lib/admin-users-db";
import { requireSession } from "@/lib/api-auth";
import { emailMessage, isEmail } from "@/lib/registration";
import { maxPhoneInputLength, normalizePhone } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const maxNameLength = 60;

// The signed-in account's own profile.
export async function GET() {
  const auth = await requireSession();

  if (auth.error) {
    return auth.error;
  }

  return NextResponse.json(
    { profile: getUserProfile(auth.access.username), username: auth.access.username },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// { displayName?, email?, partnerName?, phone?, scheduleName? } – empty values clear the field. The
// phone is only for the trainer's WhatsApp messages.
export async function PUT(request: NextRequest) {
  const auth = await requireSession();

  if (auth.error) {
    return auth.error;
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const text = (field: string) => {
    const value = payload?.[field];

    // Collapses whitespace, which also removes line breaks and tabs.
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  };
  const displayName = text("displayName");
  const partnerName = text("partnerName");

  if (displayName.length > maxNameLength || partnerName.length > maxNameLength) {
    return NextResponse.json(
      { message: `Jméno může mít nejvýš ${maxNameLength} znaků.` },
      { status: 400 },
    );
  }

  const phoneInput = text("phone");
  const phone = phoneInput.length > maxPhoneInputLength ? null : normalizePhone(phoneInput);

  if (phone === null) {
    return NextResponse.json(
      { message: "Telefon zadej jako číslo, např. 777 123 456 nebo +421 900 123 456." },
      { status: 400 },
    );
  }

  // Older forms do not send these: keep the stored ones then.
  const scheduleName = payload?.scheduleName === undefined ? undefined : text("scheduleName");

  if (scheduleName && scheduleName.length > maxNameLength) {
    return NextResponse.json(
      { message: `Jméno v rozpisu může mít nejvýš ${maxNameLength} znaků.` },
      { status: 400 },
    );
  }

  const email = payload?.email === undefined ? undefined : text("email").toLowerCase();

  if (email && !isEmail(email)) {
    return NextResponse.json({ message: emailMessage() }, { status: 400 });
  }

  if (email && isEmailTaken(email, auth.access.username)) {
    return NextResponse.json({ message: "Tento e-mail už má jiný účet." }, { status: 409 });
  }

  const profile = await updateUserProfile(auth.access.username, {
    displayName: displayName || undefined,
    email,
    scheduleName,
    partnerName: partnerName || undefined,
    phone: phone || undefined,
  });

  return NextResponse.json({ message: "Profil je uložený.", profile });
}
