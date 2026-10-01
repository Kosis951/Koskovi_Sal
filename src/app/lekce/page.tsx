import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LessonsIndex } from "@/components/lessons/lessons-index";
import { getAdminAccess, normalizeUsername } from "@/lib/auth";
import { getTrainers } from "@/lib/lessons-db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Lekce | Koškovi" };

// Entry to the lesson calendars: a trainer lands in their own, others pick a
// trainer (or go straight in when there is only one). Trainer names are not
// shown without signing in.
export default async function LessonsPage() {
  const access = getAdminAccess(await cookies());

  if (!access) {
    return <LessonsIndex initialSession={null} trainers={[]} />;
  }

  const trainers = await getTrainers();
  const own = trainers.find(
    (trainer) => normalizeUsername(trainer) === normalizeUsername(access.username),
  );
  const target = own ?? (trainers.length === 1 ? trainers[0] : null);

  if (target) {
    redirect(`/lekce/${encodeURIComponent(target)}`);
  }

  return (
    <LessonsIndex
      initialSession={{ role: access.role, username: access.username }}
      trainers={trainers}
    />
  );
}
