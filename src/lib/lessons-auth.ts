import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { normalizeUsername, readStoredAdminUsersSync, type AdminAccess } from "@/lib/auth";
import { findTrainer } from "@/lib/lessons-db";

// The account name as its owner typed it ("Jana Nováková"); the session only
// carries the normalized lower-case form.
export function getDisplayName(username: string) {
  const key = normalizeUsername(username);

  return (
    readStoredAdminUsersSync().find((user) => normalizeUsername(user.username) === key)?.username ??
    username
  );
}

// The trainer's own calendar is managed by the trainer and by the main
// administrator; dancers and hall managers may look and request lessons.
export function canManageLessons(access: AdminAccess, trainer: string) {
  return access.role === "admin" || normalizeUsername(access.username) === normalizeUsername(trainer);
}

// Session + existing trainer for the /api/lessons/[trainer] routes.
export async function requireTrainerAccess(trainerParam: string) {
  const auth = await requireSession();

  if (auth.error) {
    return { error: auth.error };
  }

  const trainer = await findTrainer(decodeURIComponent(trainerParam));

  if (!trainer) {
    return { error: NextResponse.json({ message: "Trenér nenalezen." }, { status: 404 }) };
  }

  const canManage = canManageLessons(auth.access, trainer);

  // A trainer has only their own calendar; other trainers' are not for them.
  if (auth.access.role === "trainer" && !canManage) {
    return {
      error: NextResponse.json(
        { message: "Jako trenér vidíš jen svůj kalendář lekcí." },
        { status: 403 },
      ),
    };
  }

  return { access: auth.access, canManage, trainer };
}

export function forbidden() {
  return NextResponse.json(
    { message: "Tento kalendář může upravovat jen jeho trenér." },
    { status: 403 },
  );
}
