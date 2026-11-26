"use client";

import { Check, ChevronDown, GraduationCap, KeyRound, Pencil, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
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
import {
  permissionSections,
  rolePermissions,
  type PermissionRole,
  type Permissions,
} from "@/lib/permissions";

type AssignableRole = Exclude<AdminRole, "admin">;
type AdminUser = {
  displayName?: string;
  email?: string;
  isStored: boolean;
  permissions: Permissions;
  // The role whose preset the sections match; null: custom sections.
  preset: PermissionRole | null;
  role: AdminRole;
  trainerRequest?: "pending" | "declined";
  username: string;
};
type TrainerRequest = {
  email?: string;
  firstName?: string;
  lastName?: string;
  requestedAt?: string;
  username: string;
};
type SaveUser = (
  body: Record<string, unknown>,
  successMessage: string,
  method?: "POST" | "PATCH" | "DELETE",
) => Promise<boolean>;

const noData = { trainerRequests: [] as TrainerRequest[], users: [] as AdminUser[] };

function pickUsers(data: unknown) {
  const value = data as Partial<typeof noData>;
  return { trainerRequests: value.trainerRequests ?? [], users: value.users ?? [] };
}

const requestDate = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", hour: "2-digit", minute: "2-digit", month: "numeric" });

const roleBadge: Record<AdminRole, { className: string; label: string }> = {
  admin: { className: "bg-event text-event-ink", label: "Hlavní správce" },
  manager: { className: "bg-training text-training-ink", label: "Správa sálu" },
  trainer: { className: "bg-free text-free-ink", label: "Trenér" },
  viewer: { className: "bg-subtle text-ink-muted", label: "Tanečník" },
};
const customBadge = { className: "bg-cleanup text-cleanup-ink", label: "Vlastní práva" };

export function AdminUsersTable({
  isCreateOpen,
  onCreateOpenChange,
}: {
  isCreateOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, reload } = useAdminResource("/api/admin-users", pickUsers, noData);
  const { trainerRequests, users } = data;
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

      {trainerRequests.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-accent bg-surface ring-1 ring-accent">
          <h2 className="flex items-center gap-2 border-b border-line bg-subtle px-4 py-2.5 text-sm font-black">
            <GraduationCap size={16} />
            Žádosti o trenérský účet ({trainerRequests.length})
          </h2>
          <ul className="divide-y divide-line">
            {trainerRequests.map((request) => (
              <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" key={request.username}>
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    {[request.firstName, request.lastName].filter(Boolean).join(" ") || request.username}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {request.username}
                    {request.email ? ` · ${request.email}` : ""}
                    {request.requestedAt ? ` · ${requestDate.format(new Date(request.requestedAt))}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className={buttonSecondary}
                    onClick={() =>
                      void save({ trainerRequest: "decline", username: request.username }, `Žádost ${request.username} je zamítnutá.`, "PATCH")
                    }
                    type="button"
                  >
                    <X size={15} />
                    Zamítnout
                  </button>
                  <button
                    className={buttonPrimary}
                    onClick={() =>
                      void save({ trainerRequest: "approve", username: request.username }, `${request.username} je teď trenér.`, "PATCH")
                    }
                    type="button"
                  >
                    <Check size={15} />
                    Schválit
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_40px] gap-3 border-b border-line bg-subtle px-4 py-2 text-xs font-semibold uppercase text-ink-muted md:grid">
          <span>Uživatel</span>
          <span>Práva</span>
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
        Každý účet má práva po sekcích: kalendář sálu, lekce, rozpis, uživatelé, přehled a historie.
        Předvolby: tanečník vidí vše a objednává lekce, trenér má vlastní kalendář lekcí a přidává své
        akce do sálu, správa sálu upravuje kalendář sálu i rozpis. Kalendář sálu a rozpis vidí i
        nepřihlášení, trenéry a jejich časy jen přihlášení.
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
  const badge = user.role === "admin" ? roleBadge.admin : user.preset ? roleBadge[user.preset] : customBadge;

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
            <span className="block truncate text-xs text-ink-soft">
              {user.displayName && user.displayName !== user.username ? `${user.displayName} · ` : ""}
              <span className="md:hidden">{badge.label}</span>
              {user.trainerRequest === "pending" ? " · žádá o trenéra" : ""}
            </span>
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
  const [role, setRole] = useState<AssignableRole>(isAdmin ? "manager" : (user.role as AssignableRole));
  const [permissions, setPermissions] = useState<Permissions>(user.permissions);
  const [password, setPassword] = useState("");
  const isChanged =
    role !== user.role || permissionSections.some((section) => permissions[section.key] !== user.permissions[section.key]);

  return (
    <div className="grid grid-cols-1 gap-4 border-t border-line bg-subtle px-4 py-4 md:grid-cols-2">
      <form
        className="grid content-start gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({ permissions, role, username: user.username }, `Práva uživatele ${user.username} jsou uložená.`, "PATCH");
        }}
      >
        {isAdmin ? (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <ShieldCheck size={16} />
            Hlavní správce smí všechno, jeho práva měnit nejde.
          </p>
        ) : (
          <>
            <RoleSelect
              onChange={(next) => {
                setRole(next);
                // The preset fills in the sections; they can be changed after.
                setPermissions(rolePermissions(next));
              }}
              value={role}
            />
            <div className="grid gap-2 rounded-lg border border-line bg-surface p-3">
              {permissionSections.map((section) => (
                <label className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] items-center gap-3 text-sm" key={section.key}>
                  <span className="font-semibold text-ink">{section.label}</span>
                  <select
                    className="field-input min-h-9"
                    onChange={(event) => setPermissions((current) => ({ ...current, [section.key]: event.target.value }))}
                    value={permissions[section.key]}
                  >
                    {section.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button className={buttonPrimary} disabled={!isChanged} type="submit">
              Uložit práva
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
      Předvolba
      <select
        className="field-input mt-1 min-h-10"
        onChange={(event) => onChange(event.target.value as AssignableRole)}
        value={value}
      >
        <option value="viewer">Tanečník</option>
        <option value="trainer">Trenér (vlastní kalendář lekcí)</option>
        <option value="manager">Správa sálu</option>
      </select>
    </label>
  );
}
