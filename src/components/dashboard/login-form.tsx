import { AlertCircle, LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import { buttonPrimary, noticeTone } from "@/components/ui/styles";

// `onLogin` resolves to an error message, or null when the login succeeded.
export function LoginForm({
  onLogin,
}: {
  onLogin: (username: string, password: string) => Promise<string | null>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const loginError = await onLogin(username, password);

      if (loginError) {
        setError(loginError);
        return;
      }

      setUsername("");
      setPassword("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={handleSubmit}>
      <label className="field-label">
        Jméno uživatele
        <input
          autoComplete="username"
          autoFocus
          className="field-input mt-1"
          onChange={(event) => setUsername(event.target.value)}
          required
          value={username}
        />
      </label>
      <label className="field-label">
        Heslo
        <input
          autoComplete="current-password"
          className="field-input mt-1"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>

      {error ? (
        <p className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${noticeTone.error}`}>
          <AlertCircle className="mt-0.5 shrink-0" size={16} />
          {error}
        </p>
      ) : null}

      <button className={`${buttonPrimary} h-11`} disabled={isSubmitting} type="submit">
        <LogIn size={17} />
        {isSubmitting ? "Přihlašuji…" : "Přihlásit"}
      </button>
    </form>
  );
}
