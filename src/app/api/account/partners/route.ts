import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { getPartnerships, requestPartnership } from "@/lib/partners-db";
import { isRateLimited } from "@/lib/simple-rate-limit";

export const dynamic = "force-dynamic";

// The account's partner and open requests (names only).
export async function GET() {
  const auth = await requireSession();

  if (auth.error) {
    return auth.error;
  }

  return NextResponse.json(getPartnerships(auth.access.username), { headers: { "Cache-Control": "no-store" } });
}

// { username } – asks that account to be partners.
export async function POST(request: NextRequest) {
  const auth = await requireSession();

  if (auth.error) {
    return auth.error;
  }

  if (isRateLimited(`partner-request:${auth.access.username}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ message: "Příliš mnoho žádostí, zkus to později." }, { status: 429 });
  }

  const payload = (await request.json().catch(() => null)) as { username?: unknown } | null;
  const result = requestPartnership(auth.access.username, typeof payload?.username === "string" ? payload.username : "");

  return "error" in result
    ? NextResponse.json({ message: result.error }, { status: 409 })
    : NextResponse.json({ message: result.message, ...getPartnerships(auth.access.username) });
}
