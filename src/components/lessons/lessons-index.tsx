"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoginForm } from "@/components/dashboard/login-form";
import { AppHeader, type HeaderSession } from "@/components/ui/app-header";
import { eyebrow, pageContainer } from "@/components/ui/styles";
import { loginAdmin, logoutAdmin } from "@/lib/admin-auth-client";

// /lekce: sign in, or choose a trainer when there are several.
export function LessonsIndex({
  initialSession,
  trainers,
}: {
  initialSession: HeaderSession;
  trainers: string[];
}) {
  const router = useRouter();

  async function login(username: string, password: string) {
    try {
      await loginAdmin(username, password);
    } catch (error) {
      return error instanceof Error ? error.message : "Přihlášení se nepodařilo.";
    }

    // The server page decides where to go (own calendar, the only trainer…).
    router.refresh();

    return null;
  }

  async function logout() {
    await logoutAdmin();
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-page text-ink">
      <AppHeader activeTab="lessons" onLogout={logout} session={initialSession} />
      <main className={`${pageContainer} py-5 lg:py-8`}>
        <div className="mx-auto grid max-w-xl gap-5">
          <div>
            <p className={eyebrow}>Individuální lekce</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">Lekce s trenéry</h1>
          </div>
          <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
            {!initialSession ? (
              <>
                <p className="mb-3 text-sm text-ink-muted">
                  Kalendáře lekcí vidí jen přihlášení. Nemáš účet? Požádej trenéra o odkaz s
                  pozvánkou.
                </p>
                <LoginForm onLogin={login} />
              </>
            ) : trainers.length === 0 ? (
              <p className="text-sm text-ink-muted">Zatím žádný trenér lekce nenabízí.</p>
            ) : (
              <ul className="divide-y divide-line">
                {trainers.map((trainer) => (
                  <li key={trainer}>
                    <Link
                      className="flex items-center justify-between gap-3 py-3 font-semibold text-ink transition hover:text-accent"
                      href={`/lekce/${encodeURIComponent(trainer)}`}
                    >
                      {trainer}
                      <ChevronRight className="text-ink-soft" size={18} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
