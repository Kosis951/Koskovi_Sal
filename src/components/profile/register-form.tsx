"use client";

import { UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { buttonPrimary, noticeTone } from "@/components/ui/styles";

// A new account, as in the apps: a dancer's, signed in right away. "Jsem
// trenér" asks the main administrator for an own lesson calendar.
export function RegisterForm({ onRegistered }: { onRegistered: () => void }) {
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "", password: "", username: "" });
  const [trainerRequest, setTrainerRequest] = useState(false);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const field = (key: keyof typeof form) => ({
    onChange: (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value })),
    value: form[key],
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/auth/register", {
        body: JSON.stringify({ ...form, trainerRequest }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        setError(data.message ?? "Registrace se nepodařila.");
        return;
      }

      onRegistered();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={handleSubmit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field-label">
          Jméno
          <input autoComplete="given-name" className="field-input mt-1" maxLength={60} required {...field("firstName")} />
        </label>
        <label className="field-label">
          Příjmení
          <input autoComplete="family-name" className="field-input mt-1" maxLength={60} required {...field("lastName")} />
          <span className="mt-1 block text-xs font-normal text-ink-soft">Podle něj najdeme tvoje lekce v rozpisu.</span>
        </label>
      </div>
      <label className="field-label">
        E-mail
        <input autoComplete="email" className="field-input mt-1" maxLength={120} required type="email" {...field("email")} />
      </label>
      <label className="field-label">
        Přihlašovací jméno
        <input autoComplete="username" className="field-input mt-1" maxLength={40} minLength={3} required {...field("username")} />
      </label>
      <label className="field-label">
        Heslo
        <input autoComplete="new-password" className="field-input mt-1" minLength={8} required type="password" {...field("password")} />
        <span className="mt-1 block text-xs font-normal text-ink-soft">Alespoň 8 znaků.</span>
      </label>
      <label className="flex items-start gap-3 rounded-lg border border-line p-3 text-sm">
        <input
          checked={trainerRequest}
          className="mt-0.5 h-4 w-4 accent-[var(--k-brand)]"
          onChange={(event) => setTrainerRequest(event.target.checked)}
          type="checkbox"
        />
        <span>
          <span className="font-semibold text-ink">Jsem trenér</span>
          <span className="mt-0.5 block text-xs text-ink-muted">
            Dostaneš vlastní kalendář lekcí, až to schválí správce. Do té doby máš účet tanečníka.
          </span>
        </span>
      </label>
      {error ? <p className={`rounded-lg border px-3 py-2 text-sm ${noticeTone.error}`}>{error}</p> : null}
      <button className={`${buttonPrimary} h-11`} disabled={isSaving} type="submit">
        <UserPlus size={16} />
        {isSaving ? "Zakládám účet…" : "Založit účet"}
      </button>
    </form>
  );
}
