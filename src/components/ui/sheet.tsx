"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

// A panel that slides up from the bottom on phones and sits on the right on
// larger screens. Closes on Escape or a click on the backdrop.
export function Sheet({
  children,
  onClose,
  open,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-stretch lg:justify-end">
      <button
        aria-label="Zavřít"
        className="fade-enter absolute inset-0 bg-black/50"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-label={title}
        aria-modal="true"
        className="sheet-enter relative flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface text-ink shadow-2xl lg:max-h-none lg:w-[440px] lg:rounded-none lg:border-y-0 lg:border-r-0"
        ref={panelRef}
        role="dialog"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong lg:hidden" />
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            aria-label="Zavřít"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted transition hover:bg-subtle hover:text-ink"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
