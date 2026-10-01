"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Pull-to-refresh for the installed app (the browser has its own): at the
// top of the page drag down and let go. Pages that load their data themselves
// subscribe with useRefreshHandler and just refetch; on other pages the
// server-rendered content is refreshed.

const refreshEvent = "koskovi-refresh";
// How far the indicator has to be pulled, and how far it can go (px).
const triggerDistance = 64;
const maxDistance = 96;
// The spinner stays at least this long, so the refresh is noticeable.
const minSpinMs = 600;

type RefreshDetail = { waitUntil: (work: Promise<unknown>) => void };

// Refetches this page's data on pull-to-refresh. `handler` must be stable
// (useCallback), e.g. the reload function of a data hook.
export function useRefreshHandler(handler: () => Promise<unknown>) {
  useEffect(() => {
    function handleRefresh(event: Event) {
      (event as CustomEvent<RefreshDetail>).detail.waitUntil(handler());
    }

    window.addEventListener(refreshEvent, handleRefresh);

    return () => window.removeEventListener(refreshEvent, handleRefresh);
  }, [handler]);
}

function isInstalledApp() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// Inside something that scrolls on its own and is not at its top (a list in
// a panel): the drag belongs to that element.
function isInsideScrolledElement(target: EventTarget | null) {
  for (let element = target as HTMLElement | null; element; element = element.parentElement) {
    if (element.scrollTop > 0) {
      return true;
    }
  }

  return false;
}

export function PullToRefresh() {
  const router = useRouter();
  const [distance, setDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!isInstalledApp()) {
      return undefined;
    }

    let startX = 0;
    let startY = 0;
    let pulled = 0;
    // "tracking": a finger is down and may become a pull; "pulling": it did.
    let phase: "busy" | "idle" | "pulling" | "tracking" = "idle";

    function handleTouchStart(event: TouchEvent) {
      if (
        phase !== "idle" ||
        event.touches.length !== 1 ||
        window.scrollY > 0 ||
        // Sheets and dialogs have their own drag gestures.
        document.querySelector('[role="dialog"], [role="alertdialog"]') ||
        isInsideScrolledElement(event.target)
      ) {
        return;
      }

      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      pulled = 0;
      phase = "tracking";
    }

    function handleTouchMove(event: TouchEvent) {
      if (phase !== "tracking" && phase !== "pulling") {
        return;
      }

      const deltaX = event.touches[0].clientX - startX;
      const deltaY = event.touches[0].clientY - startY;

      if (phase === "tracking") {
        if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) {
          return;
        }

        // Scrolling up the page or swiping sideways is not a pull.
        if (deltaY <= 0 || Math.abs(deltaX) > deltaY) {
          phase = "idle";
          return;
        }

        phase = "pulling";
      }

      // Keeps the page (and iOS's rubber band) from moving with the finger.
      if (event.cancelable) {
        event.preventDefault();
      }

      // The indicator follows at half speed, like a native pull.
      pulled = Math.max(0, Math.min(maxDistance, deltaY * 0.5));
      setDistance(pulled);
    }

    async function refresh() {
      phase = "busy";
      setIsRefreshing(true);
      setDistance(triggerDistance);

      const work: Promise<unknown>[] = [];
      const detail: RefreshDetail = { waitUntil: (promise) => work.push(promise) };

      window.dispatchEvent(new CustomEvent(refreshEvent, { detail }));

      // No page data hook answered: refresh what the server rendered.
      if (work.length === 0) {
        router.refresh();
      }

      await Promise.allSettled([...work, new Promise((resolve) => setTimeout(resolve, minSpinMs))]);
      setIsRefreshing(false);
      setDistance(0);
      phase = "idle";
    }

    function handleTouchEnd() {
      if (phase === "pulling" && pulled >= triggerDistance) {
        void refresh();
        return;
      }

      if (phase === "tracking" || phase === "pulling") {
        phase = "idle";
        setDistance(0);
      }
    }

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    // Not passive: the move has to be cancellable to stop the page scrolling.
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [router]);

  if (distance === 0 && !isRefreshing) {
    return null;
  }

  const isReady = distance >= triggerDistance;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[35] flex justify-center"
      // Slides out from under the header as the finger pulls.
      style={{
        top: "calc(var(--app-header-h) - 2.75rem)",
        transform: `translateY(${distance}px)`,
        transition: isRefreshing || distance === 0 ? "transform 180ms ease-out" : "none",
      }}
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-full border bg-surface shadow-lg ${
          isReady || isRefreshing ? "border-accent text-accent" : "border-line text-ink-muted"
        }`}
        style={{ opacity: Math.min(1, distance / (triggerDistance * 0.6)) }}
      >
        <RefreshCw
          className={isRefreshing ? "animate-spin" : ""}
          size={18}
          style={isRefreshing ? undefined : { transform: `rotate(${distance * 3}deg)` }}
        />
      </span>
      <span className="sr-only">{isRefreshing ? "Aktualizuji…" : ""}</span>
    </div>
  );
}
