"use client";

import { useEffect, type ReactNode } from "react";
import { buttonPrimary, buttonSecondary, noticeTone } from "@/components/ui/styles";

// A small centred yes/no question. Closes on Escape or a click on the
// backdrop. Without `onConfirm` it only informs and offers a close button.
export function ConfirmDialog({
  cancelLabel = "Ne",
  children,
  confirmLabel = "Ano",
  error,
  isBusy = false,
  onCancel,
  onConfirm,
  open,
  title,
}: {
  cancelLabel?: string;
  children?: ReactNode;
  confirmLabel?: string;
  error?: string;
  isBusy?: boolean;
  onCancel: () => void;
  onConfirm?: () => void;
  open: boolean;
  title: string;
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousFocus = document.activeElement as HTMLElement | null;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, [onCancel, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Zavřít"
        className="fade-enter absolute inset-0 bg-black/50"
        onClick={onCancel}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="fade-enter relative w-full max-w-sm rounded-2xl border border-line bg-surface p-5 text-ink shadow-2xl"
        role="alertdialog"
      >
        <h2 className="text-lg font-black" id="confirm-dialog-title">
          {title}
        </h2>
        {children ? <div className="mt-2 text-sm text-ink-muted">{children}</div> : null}
        {error ? (
          <p className={`mt-3 rounded-lg border px-3 py-2 text-xs font-semibold ${noticeTone.error}`}>
            {error}
          </p>
        ) : null}
        <div className="mt-5 grid grid-cols-2 gap-2">
          {onConfirm ? (
            <>
              <button className={buttonSecondary} disabled={isBusy} onClick={onCancel} type="button">
                {cancelLabel}
              </button>
              <button
                autoFocus
                className={buttonPrimary}
                disabled={isBusy}
                onClick={onConfirm}
                type="button"
              >
                {isBusy ? "Ukládám…" : confirmLabel}
              </button>
            </>
          ) : (
            <button
              autoFocus
              className={`${buttonSecondary} col-span-2`}
              onClick={onCancel}
              type="button"
            >
              Zavřít
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
