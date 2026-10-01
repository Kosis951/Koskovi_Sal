import { NextRequest, NextResponse } from "next/server";
import { getUserProfile, updateUserProfile } from "@/lib/admin-users-db";
import { requireSession } from "@/lib/api-auth";

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

// { displayName?, partnerName? } – empty values clear the field.
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

  const profile = await updateUserProfile(auth.access.username, {
    displayName: displayName || undefined,
    partnerName: partnerName || undefined,
  });

  return NextResponse.json({ message: "Profil je uložený.", profile });
}
