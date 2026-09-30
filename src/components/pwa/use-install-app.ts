"use client";

import { useSyncExternalStore } from "react";
import { installChangeEvent } from "@/components/pwa/install-capture";

export type InstallPlatform = "android" | "desktop" | "ios";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Set by the inline script in the root layout (see install-capture.ts).
declare global {
  interface Window {
    __koskoviInstallPrompt?: InstallPromptEvent | null;
    __koskoviInstalled?: boolean;
  }
}

function subscribe(onChange: () => void) {
  const standalone = window.matchMedia("(display-mode: standalone)");

  window.addEventListener(installChangeEvent, onChange);
  standalone.addEventListener("change", onChange);

  return () => {
    window.removeEventListener(installChangeEvent, onChange);
    standalone.removeEventListener("change", onChange);
  };
}

function getPlatform(): InstallPlatform {
  const userAgent = navigator.userAgent;

  // iPadOS reports itself as a Mac, but with touch support.
  if (
    /iPhone|iPad|iPod/.test(userAgent) ||
    (userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  ) {
    return "ios";
  }

  return /Android/.test(userAgent) ? "android" : "desktop";
}

function getIsInstalled() {
  return (
    window.__koskoviInstalled === true ||
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function getCanPrompt() {
  return Boolean(window.__koskoviInstallPrompt);
}

// What the current device can do: its platform, whether the app is already
// installed and whether the browser offers a one-tap install (Chrome, Edge,
// Samsung Internet). `platform` is null until the page runs in the browser.
export function useInstallApp() {
  const platform = useSyncExternalStore(subscribe, getPlatform, () => null);
  const isInstalled = useSyncExternalStore(subscribe, getIsInstalled, () => false);
  const canPrompt = useSyncExternalStore(subscribe, getCanPrompt, () => false);

  async function install() {
    const event = window.__koskoviInstallPrompt;

    if (!event) {
      return "unavailable" as const;
    }

    await event.prompt();
    const { outcome } = await event.userChoice;

    // The event can be used only once.
    window.__koskoviInstallPrompt = null;
    window.dispatchEvent(new Event(installChangeEvent));

    return outcome;
  }

  return { canPrompt, install, isInstalled, platform };
}
