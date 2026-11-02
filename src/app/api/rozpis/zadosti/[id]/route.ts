import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/api-auth";
import { setScheduleRequestStatus } from "@/lib/schedule-requests-db";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// { status: "done" | "pending" } – mark a request dealt with (or reopen it).
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireManager();

  if (auth.error) {
    return auth.error;
  }

  const payload = (await request.json().catch(() => null)) as { status?: unknown } | null;
  const status = payload?.status === "done" ? "done" : payload?.status === "pending" ? "pending" : null;

  if (!status) {
    return NextResponse.json({ message: "Neplatný stav." }, { status: 400 });
  }

  if (!setScheduleRequestStatus((await context.params).id, status, auth.access.username)) {
    return NextResponse.json({ message: "Žádost nenalezena." }, { status: 404 });
  }

  return NextResponse.json({ status });
}
