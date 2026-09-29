import { CalendarPlus, LockKeyhole, LogOut } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";

// Signed-in strip above the calendar: who is logged in, password change and
// shortcuts to administration.
export function AccountBar({
  canManageBookings,
  isBookingFormOpen,
  isMainAdmin,
  onLogout,
  onOpenBookingForm,
  showAddBooking,
  username,
}: {
  canManageBookings: boolean;
  isBookingFormOpen: boolean;
  isMainAdmin: boolean;
  onLogout: () => void;
  onOpenBookingForm: () => void;
  showAddBooking: boolean;
  username: string | null;
}) {
  const [isPasswordPanelOpen, setIsPasswordPanelOpen] = useState(false);

  return (
    <div className="rounded-md border border-[#ded6c9] bg-white px-3 py-2 text-sm text-[#66706f]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span>Jsi přihlášen jako: {username ?? "uživatel"}</span>
          <button
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#ded6c9] px-3 text-xs font-semibold text-[#003758] transition hover:bg-[#f6f1e8]"
            onClick={() => setIsPasswordPanelOpen((current) => !current)}
            type="button"
          >
            <LockKeyhole size={14} />
            Změna hesla
          </button>
          <button
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#ded6c9] px-3 text-xs font-semibold text-[#8c2f20] transition hover:bg-[#fff0eb]"
            onClick={onLogout}
            type="button"
          >
            <LogOut size={14} />
            Odhlásit
          </button>
        </div>
        {canManageBookings ? (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Link
              className="inline-flex h-9 items-center justify-center rounded-md bg-[#003758] px-3 text-xs font-semibold text-white transition hover:bg-[#0b4d76]"
              href="/admin"
            >
              Otevřít správu
            </Link>
            {showAddBooking ? (
              <button
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#003758] bg-[#003758] px-3 text-xs font-semibold text-white transition hover:bg-[#0b4d76] disabled:cursor-not-allowed disabled:border-[#c9dce7] disabled:bg-[#eef6fa] disabled:text-[#7a9aad]"
                disabled={isBookingFormOpen}
                onClick={onOpenBookingForm}
                type="button"
              >
                <CalendarPlus size={15} />
                {isBookingFormOpen ? "Formulář otevřený" : "Přidat akci"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {isPasswordPanelOpen ? (
        <div className="mt-4 grid gap-4 border-t border-[#ece3d5] pt-4">
          <PasswordChangeForm
            footer={
              isMainAdmin ? (
                <Link
                  className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-[#ded6c9] px-4 text-sm font-semibold text-[#003758] transition hover:bg-[#f6f1e8]"
                  href="/admin/users"
                >
                  Správa uživatelů
                </Link>
              ) : null
            }
          />
        </div>
      ) : null}
    </div>
  );
}

function PasswordChangeForm({ footer }: { footer: ReactNode }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/account/password", {
        body: JSON.stringify({ currentPassword, newPassword }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setMessage(data.message ?? "Heslo se nepodařilo změnit.");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setMessage(
        `${data.message ?? "Heslo je změněné."} Ostatní přihlášená zařízení byla odhlášena.`,
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <form className="grid gap-3" onSubmit={handleSubmit}>
        <h3 className="font-semibold text-[#132935]">Změna hesla</h3>
        <input
          className="field-input"
          onChange={(event) => setCurrentPassword(event.target.value)}
          placeholder="Současné heslo"
          required
          type="password"
          value={currentPassword}
        />
        <input
          className="field-input"
          onChange={(event) => setNewPassword(event.target.value)}
          placeholder="Nové heslo"
          required
          type="password"
          value={newPassword}
        />
        <button
          className="inline-flex h-10 items-center justify-center rounded-md bg-[#003758] px-4 text-sm font-semibold text-white transition hover:bg-[#0b4d76] disabled:opacity-60"
          disabled={isSaving}
          type="submit"
        >
          Změnit heslo
        </button>
      </form>
      {footer}
      {message ? (
        <p className="rounded-md border border-[#cde6d9] bg-[#f4fbf7] px-3 py-2 text-sm text-[#245d3f]">
          {message}
        </p>
      ) : null}
    </>
  );
}
