"use client";

import {
  Bell,
  ChevronDown,
  KeyRound,
  LayoutDashboard,
  LogIn,
  LogOut,
  Smartphone,
  UserRound,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { pageContainer } from "@/components/ui/styles";
import { getAdminSession, type AdminRole } from "@/lib/admin-auth-client";

export type HeaderSession = {
  // Profile name; the header fetches it itself when a page does not pass it.
  displayName?: string | null;
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
  // "none": a page outside the tabs (the profile).
  activeTab: "hall" | "admin" | "app" | "lessons" | "none";
  onChangePassword?: () => void;
  onLogin?: () => void;
  onLogout: () => void;
  session: HeaderSession;
}) {
  const canManage = session?.role === "admin" || session?.role === "manager";
  // On phones the tabs form one compact switch (the active one is a white
  // pill); from 640px they are separate tabs.
  const tabClass = (isActive: boolean) =>
    `inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-[13px] font-semibold transition sm:h-9 sm:px-3.5 sm:text-sm ${
      isActive
        ? "bg-white text-header sm:bg-white/15 sm:text-white"
        : "text-header-ink hover:text-white sm:hover:bg-white/10"
    }`;

  return (
    <header className="app-header bg-brand-gradient sticky top-0 z-40 border-b border-black/10 bg-header pt-[env(safe-area-inset-top)] text-white">
      <div className={`${pageContainer} flex h-14 items-center gap-2 sm:gap-3`}>
        <Link className="flex shrink-0 items-center" href="/">
          {/* Phones get the sign alone, so the tabs and icons fit next to it. */}
          <Image
            alt="Koškovi"
            className="h-7 w-auto sm:hidden"
            height={62}
            priority
            src="/brand/Koskovi_logo_znak_white.svg"
            width={71}
          />
          <Image
            alt="Koškovi"
            className="h-auto w-32 max-sm:hidden"
            height={62}
            priority
            src="/brand/Koskovi_logo_zaklad_white.svg"
            width={369}
          />
        </Link>
        <nav className="flex min-w-0 items-center overflow-x-auto rounded-full bg-white/10 p-0.5 sm:ml-2 sm:gap-1 sm:rounded-none sm:bg-transparent sm:p-0">
          <Link className={tabClass(activeTab === "hall")} href="/">
            <span className="sm:hidden">Kalendář</span>
            <span className="max-sm:hidden">Kalendář sálu</span>
          </Link>
          {/* Trainers' lesson calendars are for signed-in people only. */}
          {session ? (
            <Link className={tabClass(activeTab === "lessons")} href="/lekce">
              Lekce
            </Link>
          ) : null}
          {/* Not needed inside the installed app. On phones a signed-in user
              finds it in the account menu instead, to keep the bar short. */}
          <Link
            className={`${tabClass(activeTab === "app")} ${session ? "max-sm:hidden" : ""} [@media(display-mode:standalone)]:hidden`}
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
          {/* Signed-in phones find the theme switch in the account menu. */}
          <span className={session ? "max-sm:hidden" : ""}>
            <ThemeToggle variant="header" />
          </span>
          {session?.username ? (
            <AccountMenu
              displayName={session.displayName ?? undefined}
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

// Fired after the profile is saved, so the header shows the new name.
export const profileChangeEvent = "koskovi-profile-change";

function AccountMenu({
  displayName,
  onChangePassword,
  onLogout,
  role,
  username,
}: {
  displayName?: string;
  onChangePassword?: () => void;
  onLogout: () => void;
  role: AdminRole | null;
  username: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  // The profile name for this account, fetched here unless the page passed it.
  const [fetched, setFetched] = useState<{ name: string; username: string } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const canManage = role === "admin" || role === "manager";
  const itemClass =
    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-ink transition hover:bg-subtle";
  const shownName = displayName ?? (fetched?.username === username ? fetched.name : username);

  useEffect(() => {
    if (displayName) {
      return undefined;
    }

    let isCancelled = false;

    function load() {
      void getAdminSession()
        .then((next) => {
          if (!isCancelled && next.displayName) {
            setFetched({ name: next.displayName, username });
          }
        })
        .catch(() => undefined);
    }

    load();
    window.addEventListener(profileChangeEvent, load);

    return () => {
      isCancelled = true;
      window.removeEventListener(profileChangeEvent, load);
    };
  }, [displayName, username]);

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
          {shownName.slice(0, 1)}
        </span>
        {/* Without a profile name this is the login, which the session
            carries in lower case. */}
        <span className="hidden max-w-36 truncate capitalize sm:inline">{shownName}</span>
        <ChevronDown size={15} />
      </button>
      {isOpen ? (
        <div className="fade-enter absolute right-0 top-11 z-50 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
          <p className="px-3 pb-1.5 pt-1 text-xs text-ink-soft">
            {role === "admin"
              ? "Hlavní správce"
              : role === "manager"
                ? "Správa sálu"
                : role === "trainer"
                  ? "Trenér"
                  : "Jen čtení"}
          </p>
          <Link className={itemClass} href="/profil" onClick={() => setIsOpen(false)}>
            <UserRound size={16} />
            Můj profil
          </Link>
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
          <Link
            className={`${itemClass} sm:hidden [@media(display-mode:standalone)]:hidden`}
            href="/aplikace"
            onClick={() => setIsOpen(false)}
          >
            <Smartphone size={16} />
            Aplikace do telefonu
          </Link>
          <div className="sm:hidden">
            <ThemeToggle variant="menu" />
          </div>
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
