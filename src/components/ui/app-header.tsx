"use client";

import {
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  GraduationCap,
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
import { NavDropdown } from "@/components/ui/nav-dropdown";
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
  activeTab: "hall" | "admin" | "app" | "lessons" | "schedule" | "none";
  onChangePassword?: () => void;
  onLogin?: () => void;
  onLogout: () => void;
  session: HeaderSession;
}) {
  const canManage = session?.role === "admin" || session?.role === "manager";
  const hasSchedule = useIsSchedulePublished() || activeTab === "schedule";
  // From 640px the sections are tabs; phones get them as a dropdown.
  const tabClass = (isActive: boolean) =>
    `inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition ${
      isActive ? "bg-white/15 text-white" : "text-header-ink hover:bg-white/10 hover:text-white"
    }`;
  const phoneSections = [
    { active: activeTab === "hall", href: "/", icon: CalendarDays, label: "Kalendář sálu" },
    ...(session ? [{ active: activeTab === "lessons", href: "/lekce", icon: GraduationCap, label: "Lekce" }] : []),
    ...(hasSchedule
      ? [{ active: activeTab === "schedule", href: "/rozpis", icon: ClipboardList, label: "Externí trenér" }]
      : []),
    {
      active: activeTab === "app",
      // Not needed inside the installed app.
      className: "[@media(display-mode:standalone)]:hidden",
      href: "/aplikace",
      icon: Smartphone,
      label: "Aplikace do telefonu",
    },
    ...(canManage ? [{ active: activeTab === "admin", href: "/admin", icon: LayoutDashboard, label: "Správa" }] : []),
  ];

  return (
    <header className="app-header bg-brand-gradient sticky top-0 z-40 border-b border-black/10 bg-header pt-[var(--app-safe-top)] text-white">
      <div className={`${pageContainer} flex h-14 items-center gap-1.5 sm:gap-3`}>
        <Link className="flex shrink-0 items-center" href="/">
          {/* Phones get the sign alone, so the tabs and icons fit next to it. */}
          <Image
            alt="Koškovi"
            className="h-6 w-auto sm:hidden"
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
        <NavDropdown className="ml-1 sm:hidden" items={phoneSections} tone="header" />
        <nav className="ml-2 flex min-w-0 items-center gap-1 max-sm:hidden">
          <Link className={tabClass(activeTab === "hall")} href="/">
            Kalendář sálu
          </Link>
          {/* Trainers' lesson calendars are for signed-in people only. */}
          {session ? (
            <Link className={tabClass(activeTab === "lessons")} href="/lekce">
              Lekce
            </Link>
          ) : null}
          {/* A visiting trainer's public schedule, only while one is published. */}
          {hasSchedule ? (
            <Link className={tabClass(activeTab === "schedule")} href="/rozpis">
              Externí trenér
            </Link>
          ) : null}
          {/* Not needed inside the installed app. */}
          <Link
            className={`${tabClass(activeTab === "app")} [@media(display-mode:standalone)]:hidden`}
            href="/aplikace"
          >
            Aplikace
          </Link>
          {canManage ? (
            <Link className={tabClass(activeTab === "admin")} href="/admin">
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

// Fired by the schedule editor after saving, so the tab appears or goes.
export const scheduleChangeEvent = "koskovi-schedule-change";

// Whether the public schedule (/rozpis) is published; asked once per page
// load (and after each save) and shared by every header.
let schedulePublished: Promise<boolean> | null = null;

function useIsSchedulePublished() {
  const [isPublished, setIsPublished] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    function load(refresh: boolean) {
      if (refresh || !schedulePublished) {
        schedulePublished = fetch("/api/rozpis", { cache: "no-store" })
          .then((response) => (response.ok ? response.json() : { published: false }))
          .then((data: { published?: boolean }) => data.published === true)
          .catch(() => false);
      }

      void schedulePublished.then((value) => {
        if (!isCancelled) {
          setIsPublished(value);
        }
      });
    }

    const handleChange = () => load(true);

    load(false);
    window.addEventListener(scheduleChangeEvent, handleChange);

    return () => {
      isCancelled = true;
      window.removeEventListener(scheduleChangeEvent, handleChange);
    };
  }, []);

  return isPublished;
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
        className="inline-flex h-9 items-center gap-2 rounded-md px-1 text-sm font-semibold text-white sm:px-2 transition hover:bg-white/10"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-xs uppercase">
          {shownName.slice(0, 1)}
        </span>
        {/* Without a profile name this is the login, which the session
            carries in lower case. */}
        <span className="hidden max-w-36 truncate capitalize sm:inline">{shownName}</span>
        {/* Phones: the initial alone, so the tabs fit. */}
        <ChevronDown className="max-sm:hidden" size={15} />
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
