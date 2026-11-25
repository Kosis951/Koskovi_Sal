import { NextRequest, NextResponse } from "next/server";
import { findTrainerByInvite } from "@/lib/lessons-db";
import { getClientIp } from "@/lib/login-rate-limit";
import { registerFromPayload } from "@/lib/registration";
import { isRateLimited } from "@/lib/simple-rate-limit";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };

// Register through the invite: { username, password, displayName?, email? }.
// Creates a dancer's account and signs it in. Without a valid invite there is
// no registration here (see /api/auth/register).
export async function POST(request: NextRequest, context: RouteContext) {
  if (isRateLimited(`register:${getClientIp(request.headers)}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json(
      { message: "Příliš mnoho registrací z jednoho místa, zkus to později." },
      { status: 429 },
    );
  }

  let invite = (await context.params).token;

  try {
    invite = decodeURIComponent(invite);
  } catch {
    // Not URL-encoded; use as it is.
  }

  const trainer = await findTrainerByInvite(invite);

  if (!trainer) {
    return NextResponse.json({ message: "Pozvánka neplatí." }, { status: 404 });
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  return registerFromPayload(payload, { invitedBy: trainer, requireEmail: false });
}
