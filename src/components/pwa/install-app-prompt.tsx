"use client";

import { Download, Share, SquarePlus, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useInstallApp } from "@/components/pwa/use-install-app";

const dismissedKey = "koskovi-install-dismissed";
// After closing the tip, it comes back only after a month.
const dismissForMs = 30 * 24 * 60 * 60 * 1000;

// Short tip on the main page for phones and tablets: Android gets a real
// "Install" button, iPhone/iPad (no install prompt there) a "Share → Add to
// Home Screen" hint. Full instructions live on /aplikace.
export function InstallAppPrompt() {
  const { canPrompt, install, isInstalled, platform } = useInstallApp();
  const [isDismissed, setIsDismissed] = useState(false);

  if (
    platform === null ||
    platform === "desktop" ||
    isInstalled ||
    isDismissed ||
    wasDismissedRecently() ||
    (platform === "android" && !canPrompt)
  ) {
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

  async function handleInstall() {
    if ((await install()) === "dismissed") {
      dismiss();
    }
  }

  return (
    <div className="fade-enter flex items-start gap-3 rounded-xl border border-line bg-surface p-3 shadow-sm">
      <Image
        alt=""
        className="h-11 w-11 shrink-0 rounded-[10px]"
        height={44}
        loading="eager"
        src="/icons/icon-192.png"
        width={44}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-ink">Koškovi sál jako aplikace</p>
        {platform === "ios" ? (
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
            Klepněte na{" "}
            <Share aria-label="Sdílet" className="-mt-0.5 inline text-accent" size={14} /> Sdílet
            a pak na{" "}
            <SquarePlus aria-hidden="true" className="-mt-0.5 inline text-accent" size={14} />{" "}
            <strong className="text-ink">Přidat na plochu</strong>.{" "}
            <Link className="font-semibold text-accent underline-offset-2 hover:underline" href="/aplikace">
              Návod
            </Link>
          </p>
        ) : (
          <>
            <p className="mt-0.5 text-xs text-ink-muted">
              Kalendář sálu po ruce – ikona na ploše, bez prohlížeče.
            </p>
            <button
              className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full bg-accent px-3.5 text-xs font-semibold text-white transition hover:bg-accent-hover"
              onClick={handleInstall}
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

function wasDismissedRecently() {
  try {
    const dismissedAt = Number(window.localStorage.getItem(dismissedKey));

    return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < dismissForMs;
  } catch {
    return false;
  }
}
