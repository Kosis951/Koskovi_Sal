import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { getPartnerships, respondPartnership } from "@/lib/partners-db";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// { action: "accept" | "decline" | "cancel" | "end" }
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireSession();

  if (auth.error) {
    return auth.error;
  }

  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as { action?: unknown } | null;
  const result = respondPartnership(id, auth.access.username, typeof payload?.action === "string" ? payload.action : "");

  return "error" in result
    ? NextResponse.json({ message: result.error }, { status: 409 })
    : NextResponse.json({ message: result.message, ...getPartnerships(auth.access.username) });
}
