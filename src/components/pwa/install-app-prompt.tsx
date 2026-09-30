"use client";

import { Download, Share, SquarePlus, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";

const dismissedKey = "koskovi-install-dismissed";
// After closing the tip, it comes back only after a month.
const dismissForMs = 30 * 24 * 60 * 60 * 1000;

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "ios" | "other" | null;

// Offers to install the site as an app on phones and tablets: Chrome and
// Android get a real "Install" button, iPhone/iPad (which has no install
// prompt) a short "Share → Add to Home Screen" guide. Hidden once installed.
export function InstallAppPrompt() {
  const platform = useSyncExternalStore(subscribeNothing, getPlatform, () => null);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    function handleBeforeInstall(event: Event) {
      // Show our own button instead of the browser's mini-infobar.
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    }

    function handleInstalled() {
      setInstallEvent(null);
      setIsDismissed(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (platform === null || isDismissed || wasDismissedRecently()) {
    return null;
  }

  if (platform === "other" && !installEvent) {
    return null;
  }

  function dismiss() {
    try {
      window.localStorage.setItem(dismissedKey, String(Date.now()));
    } catch {
      // Private mode: the tip just comes back next time.
    }

    setIsDismissed(true);
  }

  async function install() {
    if (!installEvent) {
      return;
    }

    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;

    setInstallEvent(null);

    if (outcome === "dismissed") {
      dismiss();
    }
  }

  return (
    <div className="fade-enter flex items-start gap-3 rounded-xl border border-line bg-surface p-3 shadow-sm">
      <Image
        alt=""
        className="h-11 w-11 shrink-0 rounded-[10px]"
        height={44}
        src="/icons/icon-192.png"
        width={44}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-ink">Koškovi sál jako aplikace</p>
        {platform === "ios" ? (
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
            Klepněte na{" "}
            <Share aria-label="Sdílet" className="inline -mt-0.5 text-accent" size={14} /> Sdílet
            a pak na{" "}
            <SquarePlus aria-hidden="true" className="inline -mt-0.5 text-accent" size={14} />{" "}
            <strong className="text-ink">Přidat na plochu</strong>.
          </p>
        ) : (
          <>
            <p className="mt-0.5 text-xs text-ink-muted">
              Kalendář sálu po ruce – ikona na ploše, bez prohlížeče.
            </p>
            <button
              className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full bg-accent px-3.5 text-xs font-semibold text-white transition hover:bg-accent-hover"
              onClick={install}
              type="button"
            >
              <Download size={14} />
              Nainstalovat
            </button>
          </>
        )}
      </div>
      <button
        aria-label="Zavřít"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-soft transition hover:bg-subtle hover:text-ink"
        onClick={dismiss}
        type="button"
      >
        <X size={16} />
      </button>
    </div>
  );
}

function subscribeNothing() {
  return () => {};
}

// null = do not offer (desktop, already installed).
function getPlatform(): Platform {
  const isInstalled =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const isTouch = window.matchMedia("(pointer: coarse)").matches;

  if (isInstalled || !isTouch) {
    return null;
  }

  // iPadOS reports itself as a Mac, but with touch support.
  const isIos =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);

  return isIos ? "ios" : "other";
}

function wasDismissedRecently() {
  try {
    const dismissedAt = Number(window.localStorage.getItem(dismissedKey));

    return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < dismissForMs;
  } catch {
    return false;
  }
}
