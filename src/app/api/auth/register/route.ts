import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/login-rate-limit";
import { registerFromPayload } from "@/lib/registration";
import { isRateLimited } from "@/lib/simple-rate-limit";

export const dynamic = "force-dynamic";

// Registration without an invite: { username, password, displayName, email }.
// Creates a dancer's account (works right away) and signs it in.
export async function POST(request: NextRequest) {
  if (isRateLimited(`register:${getClientIp(request.headers)}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json(
      { message: "Příliš mnoho registrací z jednoho místa, zkus to později." },
      { status: 429 },
    );
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  return registerFromPayload(payload, { requireEmail: true });
}
