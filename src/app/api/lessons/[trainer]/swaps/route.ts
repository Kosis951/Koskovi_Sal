import { NextRequest, NextResponse } from "next/server";
import { requireTrainerAccess } from "@/lib/lessons-auth";
import { requestSwap } from "@/lib/lessons-db";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ trainer: string }> };

// Ask to swap lessons: { myLessonId, otherLessonId } – two confirmed lessons
// on the same day; the other person then accepts or declines.
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireTrainerAccess((await context.params).trainer);

  if (auth.error) {
    return auth.error;
  }

  const payload = (await request.json().catch(() => null)) as {
    myLessonId?: unknown;
    otherLessonId?: unknown;
  } | null;

  if (typeof payload?.myLessonId !== "string" || typeof payload.otherLessonId !== "string") {
    return NextResponse.json({ message: "Chybí lekce k prohození." }, { status: 400 });
  }

  const result = requestSwap({
    actor: auth.access.username,
    myLessonId: payload.myLessonId,
    otherLessonId: payload.otherLessonId,
    trainer: auth.trainer,
  });

  if ("error" in result) {
    return NextResponse.json({ message: result.error }, { status: result.status });
  }

  return NextResponse.json({ message: "Žádost o prohození je odeslaná." });
}
