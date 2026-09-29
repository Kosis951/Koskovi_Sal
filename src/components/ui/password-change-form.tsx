"use client";

import { useState, type FormEvent } from "react";
import { buttonPrimary, noticeTone } from "@/components/ui/styles";

export function PasswordChangeForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [result, setResult] = useState<{ message: string; ok: boolean } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setResult(null);

    try {
      const response = await fetch("/api/account/password", {
        body: JSON.stringify({ currentPassword, newPassword }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setResult({ message: data.message ?? "Heslo se nepodařilo změnit.", ok: false });
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setResult({
        message: `${data.message ?? "Heslo je změněné."} Ostatní přihlášená zařízení byla odhlášena.`,
        ok: true,
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={handleSubmit}>
      <label className="field-label">
        Současné heslo
        <input
          autoComplete="current-password"
          className="field-input mt-1"
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
          type="password"
          value={currentPassword}
        />
      </label>
      <label className="field-label">
        Nové heslo
        <input
          autoComplete="new-password"
          className="field-input mt-1"
          minLength={8}
          onChange={(event) => setNewPassword(event.target.value)}
          required
          type="password"
          value={newPassword}
        />
        <span className="mt-1 block text-xs font-normal text-ink-soft">Alespoň 8 znaků.</span>
      </label>
      {result ? (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            result.ok ? noticeTone.success : noticeTone.error
          }`}
        >
          {result.message}
        </p>
      ) : null}
      <button className={buttonPrimary} disabled={isSaving} type="submit">
        {isSaving ? "Ukládám…" : "Změnit heslo"}
      </button>
    </form>
  );
}
