"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LoginForm } from "@/components/dashboard/login-form";
import { AppHeader, profileChangeEvent, type HeaderSession } from "@/components/ui/app-header";
import { PasswordChangeForm } from "@/components/ui/password-change-form";
import { buttonPrimary, eyebrow, noticeTone, pageContainer } from "@/components/ui/styles";
import { loginAdmin, logoutAdmin } from "@/lib/admin-auth-client";
import type { UserProfile } from "@/lib/admin-users-db";

// /profil: the name shown instead of the login, the usual dance partner, and
// the password.
export function ProfilePage({
  initialProfile,
  initialSession,
}: {
  initialProfile: UserProfile;
  initialSession: HeaderSession;
}) {
  const router = useRouter();

  async function login(username: string, password: string) {
    try {
      await loginAdmin(username, password);
    } catch (error) {
      return error instanceof Error ? error.message : "Přihlášení se nepodařilo.";
    }

    router.refresh();

    return null;
  }

  async function logout() {
    await logoutAdmin();
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-page text-ink">
      <AppHeader activeTab="none" onLogout={logout} session={initialSession} />
      <main className={`${pageContainer} py-5 lg:py-8`}>
        <div className="mx-auto grid max-w-xl gap-5">
          <div>
            <p className={eyebrow}>Účet {initialSession?.username ?? ""}</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">Můj profil</h1>
          </div>
          {!initialSession ? (
            <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
              <LoginForm onLogin={login} />
            </section>
          ) : (
            <>
              <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
                <ProfileForm
                  initialProfile={initialProfile}
                  isTrainer={initialSession.role === "trainer"}
                />
              </section>
              <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
                <h2 className="mb-3 text-lg font-black">Změna hesla</h2>
                <PasswordChangeForm />
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function ProfileForm({ initialProfile, isTrainer }: { initialProfile: UserProfile; isTrainer: boolean }) {
  const [displayName, setDisplayName] = useState(initialProfile.displayName ?? "");
  const [partnerName, setPartnerName] = useState(initialProfile.partnerName ?? "");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setResult(null);

    try {
      const response = await fetch("/api/account/profile", {
        body: JSON.stringify({ displayName, partnerName: isTrainer ? "" : partnerName }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };

      setResult({
        ok: response.ok,
        text: data.message ?? (response.ok ? "Uloženo." : "Profil se nepodařilo uložit."),
      });

      if (response.ok) {
        window.dispatchEvent(new Event(profileChangeEvent));
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={handleSubmit}>
      <label className="field-label">
        Jméno a příjmení
        <input
          autoComplete="name"
          className="field-input mt-1"
          maxLength={60}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Petr Novák"
          value={displayName}
        />
        <span className="mt-1 block text-xs font-normal text-ink-soft">
          {isTrainer
            ? "Ukáže se u tvého kalendáře lekcí místo názvu účtu."
            : "Uvidí ho trenér u tvých lekcí. Bez něj se ukazuje název účtu."}
        </span>
      </label>
      {isTrainer ? null : (
        <label className="field-label">
          Partner / partnerka (nepovinné)
          <input
            className="field-input mt-1"
            maxLength={60}
            onChange={(event) => setPartnerName(event.target.value)}
            placeholder="Petr Novák"
            value={partnerName}
          />
          <span className="mt-1 block text-xs font-normal text-ink-soft">
            Předvyplní se, když budeš žádat o lekci v páru.
          </span>
        </label>
      )}
      {result ? (
        <p className={`rounded-lg border px-3 py-2 text-sm ${result.ok ? noticeTone.success : noticeTone.error}`}>
          {result.text}
        </p>
      ) : null}
      <button className={`${buttonPrimary} h-11`} disabled={isSaving} type="submit">
        <Save size={16} />
        {isSaving ? "Ukládám…" : "Uložit profil"}
      </button>
    </form>
  );
}
