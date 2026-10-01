import { NextRequest, NextResponse } from "next/server";
import { requireTrainerAccess } from "@/lib/lessons-auth";
import { changeSwap } from "@/lib/lessons-db";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; trainer: string }> };

const messages = {
  accept: "Lekce jsou prohozené.",
  cancel: "Žádost o prohození je zrušená.",
  decline: "Prohození je odmítnuté.",
};

// { action: "accept" | "decline" | "cancel" }: the asked person accepts or
// declines, the asking one may cancel (checked in changeSwap).
export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id, trainer } = await context.params;
  const auth = await requireTrainerAccess(trainer);

  if (auth.error) {
    return auth.error;
  }

  const payload = (await request.json().catch(() => null)) as { action?: unknown } | null;
  const action = payload?.action;

  if (action !== "accept" && action !== "decline" && action !== "cancel") {
    return NextResponse.json({ message: "Neplatná akce." }, { status: 400 });
  }

  const result = changeSwap({ action, actor: auth.access.username, id, trainer: auth.trainer });

  if ("error" in result) {
    return NextResponse.json({ message: result.error }, { status: result.status });
  }

  return NextResponse.json({ message: messages[action] });
}
