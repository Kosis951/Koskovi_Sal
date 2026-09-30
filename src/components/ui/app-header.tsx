"use client";

import {
  Bell,
  ChevronDown,
  KeyRound,
  LayoutDashboard,
  LogIn,
  LogOut,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { pageContainer } from "@/components/ui/styles";
import type { AdminRole } from "@/lib/admin-auth-client";

export type HeaderSession = {
  role: AdminRole | null;
  username: string | null;
} | null;

// Thin top bar shared by all screens: logo, section tabs and the account menu.
export function AppHeader({
  activeTab,
  onChangePassword,
  onLogin,
  onLogout,
  session,
}: {
  activeTab: "hall" | "admin" | "app";
  onChangePassword?: () => void;
  onLogin?: () => void;
  onLogout: () => void;
  session: HeaderSession;
}) {
  const canManage = session?.role === "admin" || session?.role === "manager";
  const tabClass = (isActive: boolean) =>
    `inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-[13px] font-semibold transition sm:px-3.5 sm:text-sm ${
      isActive
        ? "bg-white/15 text-white"
        : "text-header-ink hover:bg-white/10 hover:text-white"
    }`;

  return (
    <header className="app-header bg-brand-gradient sticky top-0 z-40 border-b border-black/10 bg-header pt-[env(safe-area-inset-top)] text-white">
      <div className={`${pageContainer} flex h-14 items-center gap-2 sm:gap-3`}>
        <Link className="flex shrink-0 items-center" href="/">
          <Image
            alt="Koškovi"
            className="h-auto w-20 sm:w-32"
            height={62}
            priority
            src="/brand/Koskovi_logo_zaklad_white.svg"
            width={369}
          />
        </Link>
        <nav className="flex min-w-0 items-center gap-1 overflow-x-auto sm:ml-2">
          <Link className={tabClass(activeTab === "hall")} href="/">
            <span className="sm:hidden">Kalendář</span>
            <span className="max-sm:hidden">Kalendář sálu</span>
          </Link>
          {/* Not needed inside the installed app. */}
          <Link
            className={`${tabClass(activeTab === "app")} [@media(display-mode:standalone)]:hidden`}
            href="/aplikace"
          >
            Aplikace
          </Link>
          {canManage ? (
            // On phones the account menu links to administration instead.
            <Link
              className={`${tabClass(activeTab === "admin")} max-sm:hidden`}
              href="/admin"
            >
              Správa
            </Link>
          ) : null}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          {/* On phones in the browser the "Aplikace" tab leads there too;
              the installed app hides that tab, so the bell shows instead. */}
          <Link
            aria-label="Upozornění"
            className="hidden h-9 w-9 items-center justify-center rounded-full text-header-ink transition hover:bg-white/10 hover:text-white sm:inline-flex [@media(display-mode:standalone)]:inline-flex"
            href="/aplikace#upozorneni"
            title="Upozornění"
          >
            <Bell size={18} />
          </Link>
          <ThemeToggle variant="header" />
          {session?.username ? (
            <AccountMenu
              onChangePassword={onChangePassword}
              onLogout={onLogout}
              role={session.role}
              username={session.username}
            />
          ) : onLogin ? (
            <button
              className="inline-flex h-9 items-center gap-2 rounded-full border border-accent-soft/70 px-3.5 text-sm font-medium text-accent-soft transition hover:bg-white/10 hover:text-white"
              onClick={onLogin}
              type="button"
            >
              <LogIn size={16} />
              <span className="hidden sm:inline">Přihlásit</span>
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function AccountMenu({
  onChangePassword,
  onLogout,
  role,
  username,
}: {
  onChangePassword?: () => void;
  onLogout: () => void;
  role: AdminRole | null;
  username: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const canManage = role === "admin" || role === "manager";
  const itemClass =
    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-ink transition hover:bg-subtle";

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        aria-expanded={isOpen}
        className="inline-flex h-9 items-center gap-2 rounded-md px-2 text-sm font-semibold text-white transition hover:bg-white/10"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-xs uppercase">
          {username.slice(0, 1)}
        </span>
        <span className="hidden max-w-32 truncate sm:inline">{username}</span>
        <ChevronDown size={15} />
      </button>
      {isOpen ? (
        <div className="fade-enter absolute right-0 top-11 z-50 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
          <p className="px-3 pb-1.5 pt-1 text-xs text-ink-soft">
            {role === "admin"
              ? "Hlavní správce"
              : role === "manager"
                ? "Správa sálu"
                : "Jen čtení"}
          </p>
          {canManage ? (
            <Link className={itemClass} href="/admin" onClick={() => setIsOpen(false)}>
              <LayoutDashboard size={16} />
              Správa
            </Link>
          ) : null}
          {role === "admin" ? (
            <Link
              className={itemClass}
              href="/admin/users"
              onClick={() => setIsOpen(false)}
            >
              <Users size={16} />
              Uživatelé
            </Link>
          ) : null}
          {onChangePassword ? (
            <button
              className={itemClass}
              onClick={() => {
                setIsOpen(false);
                onChangePassword();
              }}
              type="button"
            >
              <KeyRound size={16} />
              Změna hesla
            </button>
          ) : null}
          <div className="my-1 border-t border-line" />
          <button
            className={`${itemClass} text-busy-ink`}
            onClick={() => {
              setIsOpen(false);
              onLogout();
            }}
            type="button"
          >
            <LogOut size={16} />
            Odhlásit
          </button>
        </div>
      ) : null}
    </div>
  );
}
