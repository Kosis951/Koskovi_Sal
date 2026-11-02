import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PublicSchedulePage } from "@/components/schedule/public-schedule-page";
import { canManageBookings, getAdminAccess } from "@/lib/auth";
import { parseSchedule, scheduleRequestDeadline } from "@/lib/public-schedule";
import { getPublicSchedule } from "@/lib/public-schedule-db";
import { getPendingLessonKeys } from "@/lib/schedule-requests-db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rozpis lekcí | Koškovi",
  // Names of dancers: for the club, not for search engines.
  robots: { follow: false, index: false },
};

const pragueDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" });

// Public schedule of a visiting trainer. Hall managers also see the
// unpublished draft here.
export default async function RozpisPage() {
  const access = getAdminAccess(await cookies());
  const canEdit = canManageBookings(access);
  const schedule = getPublicSchedule();
  const isVisible = schedule.published || canEdit;

  return (
    <PublicSchedulePage
      canEdit={canEdit}
      days={isVisible ? parseSchedule(schedule.body, pragueDate.format(new Date())) : []}
      initialSession={access ? { role: access.role, username: access.username } : null}
      isDraft={canEdit && !schedule.published && Boolean(schedule.body)}
      pendingKeys={schedule.published ? getPendingLessonKeys() : []}
      requestsUntil={
        schedule.published ? scheduleRequestDeadline(schedule.publishedAt)?.toISOString() ?? null : null
      }
      title={isVisible ? schedule.title : "Externí trenér"}
    />
  );
}
