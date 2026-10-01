import { NextRequest, NextResponse } from "next/server";
import { requireTrainerAccess } from "@/lib/lessons-auth";
import { changeLesson } from "@/lib/lessons-db";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; trainer: string }> };

const messages = {
  cancel: "Lekce je zrušená.",
  confirm: "Lekce je potvrzená.",
  decline: "Žádost je odmítnutá.",
};

// { action: "confirm" | "decline" | "cancel" } – who may do what is decided
// in changeLesson (trainer decides; the requester may only cancel their own).
export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id, trainer } = await context.params;
  const auth = await requireTrainerAccess(trainer);

  if (auth.error) {
    return auth.error;
  }

  const payload = (await request.json().catch(() => null)) as { action?: unknown } | null;
  const action = payload?.action;

  if (action !== "confirm" && action !== "decline" && action !== "cancel") {
    return NextResponse.json({ message: "Neplatná akce." }, { status: 400 });
  }

  const result = changeLesson({
    action,
    actor: auth.access.username,
    canManage: auth.canManage,
    id,
    trainer: auth.trainer,
  });

  if ("error" in result) {
    return NextResponse.json({ message: result.error }, { status: result.status });
  }

  return NextResponse.json({ lesson: result.lesson, message: messages[action] });
}
