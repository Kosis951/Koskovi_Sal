"use client";

import {
  CalendarDays,
  History,
  LayoutDashboard,
  Palmtree,
  Repeat,
  ShieldAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { LoginForm } from "@/components/dashboard/login-form";
import { AppHeader } from "@/components/ui/app-header";
import { PasswordChangeForm } from "@/components/ui/password-change-form";
import { Sheet } from "@/components/ui/sheet";
import {
  canRoleManageBookings,
  getAdminSession,
  loginAdmin,
  logoutAdmin,
  type AdminRole,
} from "@/lib/admin-auth-client";

export type AdminSection =
  | "overview"
  | "bookings"
  | "trainings"
  | "holidays"
  | "users"
  | "history";

type AdminAccess = { role: AdminRole; username: string };

const AdminAccessContext = createContext<AdminAccess | null>(null);

export function useAdminAccess() {
  const access = useContext(AdminAccessContext);

  if (!access) {
    throw new Error("useAdminAccess must be used inside AdminLayout.");
  }

  return access;
}

const navItems: Array<{
  adminOnly?: boolean;
  href: string;
  icon: LucideIcon;
  label: string;
  section: AdminSection;
}> = [
  { href: "/admin", icon: LayoutDashboard, label: "Přehled", section: "overview" },
  { href: "/admin/akce", icon: CalendarDays, label: "Akce", section: "bookings" },
  { href: "/admin/treninky", icon: Repeat, label: "Tréninky", section: "trainings" },
  { href: "/admin/prazdniny", icon: Palmtree, label: "Prázdniny", section: "holidays" },
  { adminOnly: true, href: "/admin/users", icon: Users, label: "Uživatelé", section: "users" },
  { href: "/admin/historie", icon: History, label: "Historie", section: "history" },
];

// Shell of every administration page: header, section navigation and the
// login / permission gate. Pages render inside once access is confirmed.
export function AdminLayout({
  actions,
  adminOnly = false,
  children,
  description,
  section,
  title,
}: {
  actions?: ReactNode;
  adminOnly?: boolean;
  children: ReactNode;
  description?: string;
  section: AdminSection;
  title: string;
}) {
  const [access, setAccess] = useState<AdminAccess | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);

  const loadSession = useCallback(async () => {
    const session = await getAdminSession();

    setAccess(
      session.authenticated && session.username && session.role
        ? { role: session.role, username: session.username }
        : null,
    );
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadSession();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadSession]);

  async function login(username: string, password: string) {
    try {
      await loginAdmin(username, password);
    } catch (error) {
      return error instanceof Error ? error.message : "Přihlášení se nepodařilo.";
    }

    await loadSession();

    return null;
  }

  async function logout() {
    await logoutAdmin();
    setAccess(null);
  }

  const canManage = canRoleManageBookings(access?.role);
  const hasAccess = canManage && (!adminOnly || access?.role === "admin");
  const visibleNavItems = navItems.filter(
    (item) => !item.adminOnly || access?.role === "admin",
  );

  return (
    <div className="min-h-screen bg-page text-ink">
      <AppHeader
        activeTab="admin"
        onChangePassword={() => setIsPasswordOpen(true)}
        onLogout={logout}
        session={access}
      />

      {isLoading ? (
        <div className="mx-auto max-w-md px-4 py-16 text-center text-ink-muted">Načítám…</div>
      ) : !access ? (
        <div className="mx-auto max-w-sm px-4 py-12">
          <div className="rounded-xl border border-line bg-surface p-5">
            <h1 className="text-xl font-black">Přihlášení do správy</h1>
            <p className="mb-4 mt-1 text-sm text-ink-muted">
              Správa je dostupná jen přihlášeným správcům sálu.
            </p>
            <LoginForm onLogin={login} />
          </div>
        </div>
      ) : !hasAccess ? (
        <div className="mx-auto max-w-md px-4 py-12">
          <div className="rounded-xl border border-line bg-surface p-6 text-center">
            <ShieldAlert className="mx-auto text-ink-muted" size={28} />
            <h1 className="mt-3 text-xl font-black">Sem nemáš přístup</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {canManage
                ? "Tuto sekci spravuje jen hlavní správce."
                : `Účet ${access.username} má přístup jen pro čtení.`}
            </p>
            <Link
              className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-on-brand transition hover:bg-brand-hover"
              href={canManage ? "/admin" : "/"}
            >
              {canManage ? "Zpět na přehled" : "Zpět na kalendář"}
            </Link>
          </div>
        </div>
      ) : (
        <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6 lg:px-6 lg:py-6">
          <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:sticky lg:top-[72px] lg:mx-0 lg:flex-col lg:self-start lg:px-0">
            {visibleNavItems.map(({ href, icon: Icon, label, section: itemSection }) => {
              const isActive = itemSection === section;

              return (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={`inline-flex h-10 shrink-0 items-center gap-2.5 rounded-lg px-3 text-sm font-semibold transition ${
                    isActive
                      ? "bg-brand text-on-brand"
                      : "text-ink-muted hover:bg-subtle hover:text-ink"
                  }`}
                  href={href}
                  key={href}
                >
                  <Icon size={17} />
                  {label}
                </Link>
              );
            })}
          </nav>

          <main className="min-w-0">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-black text-ink">{title}</h1>
                {description ? (
                  <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p>
                ) : null}
              </div>
              {actions}
            </div>
            <AdminAccessContext.Provider value={access}>{children}</AdminAccessContext.Provider>
          </main>
        </div>
      )}

      <Sheet
        onClose={() => setIsPasswordOpen(false)}
        open={isPasswordOpen}
        title="Změna hesla"
      >
        <PasswordChangeForm />
      </Sheet>
    </div>
  );
}
