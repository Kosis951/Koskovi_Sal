"use client";

import { AlertCircle, ArrowRight, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LoginForm } from "@/components/dashboard/login-form";
import { AppHeader, type HeaderSession } from "@/components/ui/app-header";
import { buttonPrimary, chipClass, eyebrow, noticeTone, pageContainer } from "@/components/ui/styles";
import { loginAdmin, logoutAdmin } from "@/lib/admin-auth-client";

// Opened from a trainer's invite link: create an account (or sign in with an
// existing one) and continue to the trainer's lesson calendar.
export function InvitePage({
  initialSession,
  token,
  trainer,
}: {
  initialSession: HeaderSession;
  token: string;
  trainer: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("register");
  const calendarUrl = trainer ? `/lekce/${encodeURIComponent(trainer)}` : "/lekce";

  async function login(username: string, password: string) {
    try {
      await loginAdmin(username, password);
    } catch (error) {
      return error instanceof Error ? error.message : "Přihlášení se nepodařilo.";
    }

    router.push(calendarUrl);

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
        <div className="mx-auto grid max-w-md gap-5">
          <div>
            <p className={eyebrow}>Pozvánka</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">
              {trainer ? `Lekce s trenérem ${trainer}` : "Pozvánka neplatí"}
            </h1>
          </div>
          <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
            {!trainer ? (
              <p className="text-sm text-ink-muted">
                Tento odkaz už neplatí. Požádej trenéra o nový.
              </p>
            ) : initialSession ? (
              <>
                <p className="text-sm text-ink-muted">
                  Jsi přihlášený jako <strong className="text-ink">{initialSession.username}</strong>.
                </p>
                <Link className={`${buttonPrimary} mt-3 h-11 w-full`} href={calendarUrl}>
                  Pokračovat do kalendáře
                  <ArrowRight size={16} />
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-muted">
                  Trenér {trainer} tě zve do svého kalendáře lekcí. Založ si účet a pak si vyber
                  termín.
                </p>
                <div className="my-3 flex gap-1.5">
                  <button aria-pressed={mode === "register"} className={chipClass(mode === "register")} onClick={() => setMode("register")} type="button">
                    Nový účet
                  </button>
                  <button aria-pressed={mode === "login"} className={chipClass(mode === "login")} onClick={() => setMode("login")} type="button">
                    Už účet mám
                  </button>
                </div>
                {mode === "login" ? (
                  <LoginForm onLogin={login} />
                ) : (
                  <RegisterForm onRegistered={() => router.push(calendarUrl)} token={token} />
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function RegisterForm({ onRegistered, token }: { onRegistered: () => void; token: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/invite/${encodeURIComponent(token)}`, {
        body: JSON.stringify({ password, username }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        setError(data.message ?? "Účet se nepodařilo založit.");
        return;
      }

      onRegistered();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={handleSubmit}>
      <label className="field-label">
        Jméno (uvidí ho trenér)
        <input
          autoComplete="username"
          className="field-input mt-1"
          maxLength={40}
          minLength={3}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Jana Nováková"
          required
          value={username}
        />
      </label>
      <label className="field-label">
        Heslo
        <input
          autoComplete="new-password"
          className="field-input mt-1"
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
        <span className="mt-1 block text-xs font-normal text-ink-soft">Alespoň 8 znaků.</span>
      </label>
      {error ? (
        <p className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${noticeTone.error}`}>
          <AlertCircle className="mt-0.5 shrink-0" size={16} />
          {error}
        </p>
      ) : null}
      <button className={`${buttonPrimary} h-11`} disabled={isSubmitting} type="submit">
        <UserPlus size={17} />
        {isSubmitting ? "Zakládám…" : "Založit účet"}
      </button>
    </form>
  );
}
