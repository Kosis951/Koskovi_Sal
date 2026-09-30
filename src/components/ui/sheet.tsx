"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

const closeDurationMs = 220;
// Dragging further than this, or flicking faster than this (px per ms),
// closes the sheet; anything less snaps it back.
const closeDistancePx = 110;
const closeVelocity = 0.6;

function isPhoneLayout() {
  return window.matchMedia("(max-width: 1023px)").matches;
}

// A panel that slides up from the bottom on phones (drag it down to close)
// and sits on the right on larger screens. Closes on Escape or a click on the
// backdrop.
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
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const dragRef = useRef<{ lastTime: number; lastY: number; startY: number; velocity: number } | null>(
    null,
  );
  const closeTimeoutRef = useRef<number | null>(null);

  // On phones the sheet slides down before it disappears.
  const requestClose = useCallback(() => {
    if (!isPhoneLayout()) {
      onClose();
      return;
    }

    setIsClosing(true);
    closeTimeoutRef.current = window.setTimeout(() => {
      setIsClosing(false);
      setDragOffset(0);
      onClose();
    }, closeDurationMs);
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        requestClose();
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, [open, requestClose]);

  useEffect(
    () => () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    },
    [],
  );

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    // Buttons in the header (close) keep working normally.
    if (!isPhoneLayout() || (event.target as HTMLElement).closest("button")) {
      return;
    }

    try {
      // Keeps receiving moves when the finger leaves the header.
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone; the drag still works without capture.
    }
    dragRef.current = {
      lastTime: event.timeStamp,
      lastY: event.clientY,
      startY: event.clientY,
      velocity: 0,
    };
    setIsDragging(true);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag) {
      return;
    }

    const elapsed = Math.max(1, event.timeStamp - drag.lastTime);

    drag.velocity = (event.clientY - drag.lastY) / elapsed;
    drag.lastY = event.clientY;
    drag.lastTime = event.timeStamp;
    setDragOffset(Math.max(0, event.clientY - drag.startY));
  }

  function handlePointerEnd() {
    const drag = dragRef.current;

    if (!drag) {
      return;
    }

    dragRef.current = null;
    setIsDragging(false);

    if (dragOffset > closeDistancePx || drag.velocity > closeVelocity) {
      requestClose();
    } else {
      setDragOffset(0);
    }
  }

  if (!open) {
    return null;
  }

  const panelTransform = isClosing ? "translateY(100%)" : `translateY(${dragOffset}px)`;
  const backdropOpacity = isClosing ? 0 : Math.max(0.2, 1 - dragOffset / 400);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-stretch lg:justify-end">
      <button
        aria-label="Zavřít"
        className="fade-enter absolute inset-0 bg-black/50"
        onClick={requestClose}
        style={{
          opacity: backdropOpacity,
          transition: isDragging ? "none" : `opacity ${closeDurationMs}ms ease-out`,
        }}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-label={title}
        aria-modal="true"
        className="sheet-enter relative flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface text-ink shadow-2xl lg:max-h-none lg:w-[440px] lg:rounded-none lg:border-y-0 lg:border-r-0"
        role="dialog"
        style={{
          transform: panelTransform,
          transition: isDragging
            ? "none"
            : `transform ${closeDurationMs}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
        }}
      >
        <div
          className="cursor-grab touch-none select-none active:cursor-grabbing lg:cursor-auto"
          onPointerCancel={handlePointerEnd}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
        >
          <div className="flex justify-center pb-1 pt-2.5 lg:hidden">
            <span className="h-1.5 w-12 rounded-full bg-line-strong" />
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 pb-3 pt-1 lg:pt-3">
            <h2 className="text-lg font-black">{title}</h2>
            <button
              aria-label="Zavřít"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted transition hover:bg-subtle hover:text-ink"
              onClick={requestClose}
              type="button"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        {/* Bottom padding keeps buttons above the iPhone home indicator. */}
        <div className="overflow-y-auto overscroll-contain px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}
