"use client";

import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type NavDropdownItem = {
  active: boolean;
  // Extra classes for the menu row (e.g. hiding it in the installed app).
  className?: string;
  href: string;
  icon?: LucideIcon;
  label: string;
};

// Section switch for narrow screens: a button with the current section that
// opens the list of all of them. "header" sits on the dark header bar,
// "surface" on the page (administration).
export function NavDropdown({
  className = "",
  fallbackLabel = "Menu",
  items,
  tone,
}: {
  className?: string;
  // Shown when no item is active (a page outside the sections).
  fallbackLabel?: string;
  items: NavDropdownItem[];
  tone: "header" | "surface";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const current = items.find((item) => item.active);
  const CurrentIcon = current?.icon;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
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

  const buttonClass =
    tone === "header"
      ? "inline-flex h-9 max-w-full items-center gap-1.5 rounded-full bg-white/10 pl-3.5 pr-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
      : "flex h-11 w-full items-center gap-2.5 rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-ink transition hover:border-accent";

  return (
    <div className={`relative min-w-0 ${tone === "surface" ? "w-full" : ""} ${className}`} ref={rootRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={buttonClass}
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        {CurrentIcon ? (
          <CurrentIcon
            className={`shrink-0 ${tone === "header" ? "text-accent-soft" : "text-ink-muted"}`}
            size={17}
          />
        ) : null}
        <span className="truncate">{current?.label ?? fallbackLabel}</span>
        <ChevronDown
          className={`shrink-0 transition ${isOpen ? "rotate-180" : ""} ${tone === "surface" ? "ml-auto text-ink-muted" : "opacity-80"}`}
          size={16}
        />
      </button>
      {isOpen ? (
        <div
          className={`fade-enter absolute left-0 z-50 mt-1.5 rounded-xl border border-line bg-surface p-1.5 text-ink shadow-xl ${
            tone === "surface" ? "right-0" : "w-60"
          }`}
          role="menu"
        >
          {items.map(({ active, className: itemClass = "", href, icon: Icon, label }) => (
            <Link
              aria-current={active ? "page" : undefined}
              className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-sm transition hover:bg-subtle ${
                active ? "font-semibold text-ink" : "text-ink-muted hover:text-ink"
              } ${itemClass}`}
              href={href}
              key={href}
              onClick={() => setIsOpen(false)}
              role="menuitem"
            >
              {Icon ? <Icon className="shrink-0" size={16} /> : null}
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {active ? <Check className="shrink-0 text-accent" size={16} /> : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
