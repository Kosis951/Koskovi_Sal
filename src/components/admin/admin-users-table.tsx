"use client";

import { ChevronDown, KeyRound, Pencil, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { sendJson, useAdminResource } from "@/components/admin/admin-data";
import { Sheet } from "@/components/ui/sheet";
import {
  buttonDanger,
  buttonPrimary,
  buttonSecondary,
  noticeTone,
} from "@/components/ui/styles";
import type { AdminRole } from "@/lib/admin-auth-client";

type AssignableRole = Exclude<AdminRole, "admin">;
type AdminUser = { isStored: boolean; role: AdminRole; username: string };
type SaveUser = (
  body: Record<string, unknown>,
  successMessage: string,
  method?: "POST" | "DELETE",
) => Promise<boolean>;

const noUsers: AdminUser[] = [];

function pickUsers(data: unknown) {
  return (data as { users?: AdminUser[] }).users ?? noUsers;
}

const roleBadge: Record<AdminRole, { className: string; label: string }> = {
  admin: { className: "bg-event text-event-ink", label: "Hlavní správce" },
  manager: { className: "bg-training text-training-ink", label: "Správa sálu" },
  viewer: { className: "bg-subtle text-ink-muted", label: "Jen čtení" },
};

export function AdminUsersTable({
  isCreateOpen,
  onCreateOpenChange,
}: {
  isCreateOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const { data: users, isLoading, reload } = useAdminResource(
    "/api/admin-users",
    pickUsers,
    noUsers,
  );
  const [expanded, setExpanded] = useState("");
  const [result, setResult] = useState<{ message: string; ok: boolean } | null>(null);

  const save: SaveUser = async (body, successMessage, method = "POST") => {
    const response = await sendJson("/api/admin-users", method, body);

    setResult({
      message: response.ok ? successMessage : response.data.message ?? "Uložení se nepovedlo.",
      ok: response.ok,
    });

    if (response.ok) {
      await reload();
    }

    return response.ok;
  };

  return (
    <div className="grid grid-cols-1 gap-3">
      {result ? (
        <p className={`rounded-lg border px-3 py-2 text-sm ${result.ok ? noticeTone.success : noticeTone.error}`}>
          {result.message}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_40px] gap-3 border-b border-line bg-subtle px-4 py-2 text-xs font-semibold uppercase text-ink-muted md:grid">
          <span>Uživatel</span>
          <span>Role</span>
          <span>Heslo</span>
          <span />
        </div>
        {isLoading ? <p className="px-4 py-6 text-sm text-ink-muted">Načítám…</p> : null}
        <ul className="divide-y divide-line">
          {users.map((user) => (
            <UserRow
              isExpanded={expanded === user.username}
              key={user.username}
              onSave={save}
              onToggle={() =>
                setExpanded((current) => (current === user.username ? "" : user.username))
              }
              user={user}
            />
          ))}
        </ul>
      </div>
      <p className="text-xs text-ink-soft">
        Správa sálu smí přidávat a měnit akce. Účet jen pro čtení vidí kalendář, ale nic nezmění.
      </p>

      <Sheet onClose={() => onCreateOpenChange(false)} open={isCreateOpen} title="Nový uživatel">
        <NewUserForm
          onCreate={async (body) => {
            if (await save(body, `Uživatel ${String(body.username)} je vytvořený.`)) {
              onCreateOpenChange(false);
            }
          }}
        />
      </Sheet>
    </div>
  );
}

function UserRow({
  isExpanded,
  onSave,
  onToggle,
  user,
}: {
  isExpanded: boolean;
  onSave: SaveUser;
  onToggle: () => void;
  user: AdminUser;
}) {
  const badge = roleBadge[user.role];

  return (
    <li>
      <button
        aria-expanded={isExpanded}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition hover:bg-subtle md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_40px]"
        onClick={onToggle}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold uppercase text-brand">
            {user.username.slice(0, 1)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-ink">{user.username}</span>
            <span className="block text-xs text-ink-soft md:hidden">{badge.label}</span>
          </span>
        </span>
        <span className="hidden md:block">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>
            {badge.label}
          </span>
        </span>
        <span className="hidden truncate text-sm text-ink-muted md:block">
          {user.isStored ? "Nastavené ve správě" : "Z konfigurace serveru"}
        </span>
        <span className="flex justify-end text-ink-soft">
          {isExpanded ? <ChevronDown className="rotate-180" size={16} /> : <Pencil size={15} />}
        </span>
      </button>
      {isExpanded ? <UserEditor onSave={onSave} user={user} /> : null}
    </li>
  );
}

function UserEditor({ onSave, user }: { onSave: SaveUser; user: AdminUser }) {
  const isAdmin = user.role === "admin";
  const [role, setRole] = useState<AssignableRole>(isAdmin ? "manager" : user.role as AssignableRole);
  const [password, setPassword] = useState("");

  return (
    <div className="grid grid-cols-1 gap-4 border-t border-line bg-subtle px-4 py-4 md:grid-cols-2">
      <form
        className="grid content-start gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({ role, username: user.username }, `Role uživatele ${user.username} je uložená.`);
        }}
      >
        {isAdmin ? (
          <p className="text-sm text-ink-muted">Hlavnímu správci nejde roli změnit.</p>
        ) : (
          <>
            <RoleSelect onChange={setRole} value={role} />
            <button className={buttonPrimary} disabled={role === user.role} type="submit">
              Uložit roli
            </button>
          </>
        )}
      </form>
      <form
        className="grid content-start gap-3"
        onSubmit={async (event) => {
          event.preventDefault();

          if (
            await onSave(
              { password, username: user.username },
              `Heslo pro ${user.username} je nastavené. Jeho přihlášená zařízení byla odhlášena.`,
            )
          ) {
            setPassword("");
          }
        }}
      >
        <label className="field-label">
          Nové heslo
          <input
            autoComplete="new-password"
            className="field-input mt-1 min-h-10"
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        <button className={buttonSecondary} type="submit">
          <KeyRound size={15} />
          Nastavit heslo
        </button>
      </form>
      {isAdmin ? null : (
        <div className="flex items-center justify-between gap-3 border-t border-line pt-3 md:col-span-2">
          <p className="text-xs text-ink-soft">
            Smazaný účet se hned odhlásí a už se nepřihlásí. Obnovit ho jde nastavením
            nového hesla přes „Nový uživatel“ se stejným jménem.
          </p>
          <button
            className={`${buttonDanger} shrink-0`}
            onClick={() => {
              if (window.confirm(`Opravdu smazat uživatele „${user.username}“?`)) {
                void onSave(
                  { username: user.username },
                  `Uživatel ${user.username} je smazaný.`,
                  "DELETE",
                );
              }
            }}
            type="button"
          >
            <Trash2 size={15} />
            Smazat uživatele
          </button>
        </div>
      )}
    </div>
  );
}

function NewUserForm({ onCreate }: { onCreate: (body: Record<string, unknown>) => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AssignableRole>("manager");
  const [isSaving, setIsSaving] = useState(false);

  return (
    <form
      className="grid grid-cols-1 gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setIsSaving(true);

        try {
          await onCreate({ password, role, username });
        } finally {
          setIsSaving(false);
        }
      }}
    >
      <label className="field-label">
        Jméno uživatele
        <input
          autoComplete="off"
          autoFocus
          className="field-input mt-1"
          maxLength={60}
          onChange={(event) => setUsername(event.target.value)}
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
      <RoleSelect onChange={setRole} value={role} />
      <button className={`${buttonPrimary} h-11`} disabled={isSaving} type="submit">
        <UserPlus size={16} />
        {isSaving ? "Ukládám…" : "Vytvořit uživatele"}
      </button>
    </form>
  );
}

function RoleSelect({
  onChange,
  value,
}: {
  onChange: (role: AssignableRole) => void;
  value: AssignableRole;
}) {
  return (
    <label className="field-label">
      Role
      <select
        className="field-input mt-1 min-h-10"
        onChange={(event) => onChange(event.target.value as AssignableRole)}
        value={value}
      >
        <option value="manager">Správa sálu</option>
        <option value="viewer">Jen čtení</option>
      </select>
    </label>
  );
}
