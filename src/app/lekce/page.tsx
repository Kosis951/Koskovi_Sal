import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LessonsIndex } from "@/components/lessons/lessons-index";
import { getAdminAccess, normalizeUsername } from "@/lib/auth";
import { getTrainerList } from "@/lib/lessons-db";
import { lessonsTrainerCookie } from "@/lib/lessons-shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Lekce | Koškovi" };

// Entry to the lesson calendars: a trainer lands in their own, others in the
// one they opened last (or the first). Trainer names are not
// shown without signing in.
export default async function LessonsPage() {
  const access = getAdminAccess(await cookies());

  if (!access) {
    return <LessonsIndex initialSession={null} trainers={[]} />;
  }

  const trainers = await getTrainerList(access);
  const own = trainers.find(
    ({ trainer }) => normalizeUsername(trainer) === normalizeUsername(access.username),
  );
  // Dancers go to the trainer they looked at last; the calendar itself has a
  // switch between trainers.
  const lastKey = normalizeUsername(
    decodeURIComponent((await cookies()).get(lessonsTrainerCookie)?.value ?? ""),
  );
  const last = trainers.find(({ trainer }) => normalizeUsername(trainer) === lastKey);
  const target = own ?? last ?? trainers[0] ?? null;

  if (target) {
    redirect(`/lekce/${encodeURIComponent(target.trainer)}`);
  }

  return (
    <LessonsIndex
      initialSession={{ role: access.role, username: access.username }}
      trainers={trainers}
    />
  );
}
