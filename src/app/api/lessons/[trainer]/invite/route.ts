import { NextRequest, NextResponse } from "next/server";
import { forbidden, requireTrainerAccess } from "@/lib/lessons-auth";
import { regenerateInviteToken } from "@/lib/lessons-db";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ trainer: string }> };

// New invite link; the previous one stops working.
export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireTrainerAccess((await context.params).trainer);

  if (auth.error) {
    return auth.error;
  }

  if (!auth.canManage) {
    return forbidden();
  }

  return NextResponse.json({
    inviteToken: regenerateInviteToken(auth.trainer),
    message: "Nový odkaz je připravený. Starý už neplatí.",
  });
}
