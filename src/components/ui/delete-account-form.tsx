"use client";

import { useState, type FormEvent } from "react";
import { buttonDanger, noticeTone } from "@/components/ui/styles";

// Deletes the signed-in account for good, after the password.
export function DeleteAccountForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!window.confirm("Opravdu smazat účet? Tohle nejde vrátit.")) {
      return;
    }

    setIsDeleting(true);
    setError("");

    try {
      const response = await fetch("/api/account", {
        body: JSON.stringify({ password }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        setError(data.message ?? "Účet se nepodařilo smazat.");
        return;
      }

      window.location.href = "/";
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={handleSubmit}>
      <p className="text-sm text-ink-muted">
        Smažeme tvůj profil (jméno, příjmení, e-mail, telefon, partnera) i propojení s partnery a rozpisem. Lekce, které
        už máš objednané, zůstanou trenérovi v kalendáři.
      </p>
      <label className="field-label">
        Heslo pro potvrzení
        <input
          autoComplete="current-password"
          className="field-input mt-1"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      {error ? <p className={`rounded-lg border px-3 py-2 text-sm ${noticeTone.error}`}>{error}</p> : null}
      <button className={buttonDanger} disabled={isDeleting || !password} type="submit">
        {isDeleting ? "Mažu…" : "Smazat účet natrvalo"}
      </button>
    </form>
  );
}
