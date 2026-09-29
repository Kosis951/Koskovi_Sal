import { AlertCircle, LogIn } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent, type RefObject } from "react";

// `onLogin` resolves to an error message, or null when the login succeeded.
export function LoginForm({
  onLogin,
  usernameInputRef,
  variant,
}: {
  onLogin: (username: string, password: string) => Promise<string | null>;
  usernameInputRef?: RefObject<HTMLInputElement | null>;
  variant: "panel" | "lessons";
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const loginError = await onLogin(username, password);

    if (loginError) {
      setError(loginError);
      return;
    }

    setUsername("");
    setPassword("");
  }

  const submitButton = (
    <button
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#003758] px-4 text-sm font-semibold text-white transition hover:bg-[#0b4d76] ${
        variant === "panel" ? "w-full" : ""
      }`}
      type="submit"
    >
      <LogIn size={17} />
      Přihlásit
    </button>
  );

  return (
    <form
      className={variant === "panel" ? "mt-5 space-y-3" : "mt-4 grid gap-3 sm:max-w-md"}
      onSubmit={handleSubmit}
    >
      <label className="field-label">
        Jméno uživatele
        <input
          className="field-input mt-1"
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Jméno uživatele"
          ref={usernameInputRef}
          required
          value={username}
        />
      </label>
      <label className="field-label">
        Heslo
        <input
          className="field-input mt-1"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Zadej heslo"
          required
          type="password"
          value={password}
        />
      </label>

      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-[#edd3cc] bg-[#fff0eb] p-3 text-sm text-[#8c2f20]">
          <AlertCircle size={17} />
          {error}
        </div>
      ) : null}

      {variant === "panel" ? (
        submitButton
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          {submitButton}
          <Link
            className="inline-flex h-11 items-center justify-center rounded-md border border-[#ded6c9] px-4 text-sm font-semibold text-[#003758] transition hover:bg-[#f6f1e8]"
            href="/"
          >
            Zpět na kalendář
          </Link>
        </div>
      )}
    </form>
  );
}
