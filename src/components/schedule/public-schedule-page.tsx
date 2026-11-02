"use client";

import { CalendarX2, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ScheduleView } from "@/components/schedule/schedule-view";
import { AppHeader, type HeaderSession } from "@/components/ui/app-header";
import { eyebrow, noticeTone, pageContainer } from "@/components/ui/styles";
import { logoutAdmin } from "@/lib/admin-auth-client";
import type { ScheduleDay } from "@/lib/public-schedule";

// /rozpis: a visiting trainer's lessons for everyone, without signing in.
export function PublicSchedulePage({
  canEdit,
  days,
  initialSession,
  isDraft,
  title,
}: {
  canEdit: boolean;
  days: ScheduleDay[];
  initialSession: HeaderSession;
  // A hall manager looking at a schedule that is not published yet.
  isDraft: boolean;
  title: string;
}) {
  const [session, setSession] = useState(initialSession);

  async function logout() {
    await logoutAdmin();
    setSession(null);
  }

  return (
    <div className="min-h-screen bg-page text-ink">
      <AppHeader activeTab="schedule" onLogout={logout} session={session} />

      <main className={`${pageContainer} py-5 lg:py-8`}>
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <p className={eyebrow}>Rozpis lekcí</p>
                <span aria-hidden="true" className="brand-stripes w-20" />
              </div>
              <h1 className="mt-1 text-2xl font-black sm:text-3xl">{title}</h1>
            </div>
            {canEdit && session ? (
              <Link
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-sm font-semibold text-ink transition hover:border-accent hover:bg-subtle"
                href="/admin/rozpis"
              >
                <Pencil size={14} />
                Upravit
              </Link>
            ) : null}
          </div>

          {isDraft ? (
            <p className={`rounded-lg border px-3 py-2 text-sm font-semibold ${noticeTone.warning}`}>
              Náhled: rozpis zatím není zveřejněný, ostatní ho nevidí.
            </p>
          ) : null}

          {days.length > 0 ? (
            <ScheduleView days={days} />
          ) : (
            <div className="rounded-xl border border-line bg-surface px-5 py-10 text-center">
              <CalendarX2 className="mx-auto text-ink-soft" size={28} />
              <p className="mt-3 font-semibold text-ink">Teď tu žádný rozpis není.</p>
              <p className="mt-1 text-sm text-ink-muted">Až přijede externí trenér, objeví se tady jeho lekce.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
