import type { Metadata } from "next";
import { cookies } from "next/headers";
import { TrainerCalendarPage } from "@/components/lessons/trainer-calendar";
import { getAdminAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Lekce | Koškovi" };

// A trainer's lesson calendar. The page itself carries no data: the calendar
// loads from the API, which requires a session.
export default async function TrainerLessonsPage({
  params,
}: {
  params: Promise<{ trainer: string }>;
}) {
  const access = getAdminAccess(await cookies());

  return (
    <TrainerCalendarPage
      initialSession={access ? { role: access.role, username: access.username } : null}
      trainer={decodeURIComponent((await params).trainer)}
    />
  );
}
