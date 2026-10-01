import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { getTrainers } from "@/lib/lessons-db";

export const dynamic = "force-dynamic";

// Trainers that have a lesson calendar (signed-in users only).
export async function GET() {
  const auth = await requireSession();

  if (auth.error) {
    return auth.error;
  }

  return NextResponse.json(
    { trainers: await getTrainers() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
