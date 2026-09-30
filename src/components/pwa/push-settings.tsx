"use client";

import { Bell, BellOff, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useInstallApp } from "@/components/pwa/use-install-app";
import { buttonPrimary, buttonSecondary, eyebrow, noticeTone } from "@/components/ui/styles";

type Topic = "hall" | "cleanup";

const topicOptions: Array<{ description: string; label: string; topic: Topic }> = [
  {
    description: "Ráno souhrn, když je dnes jiná blokace než trénink nebo trénink odpadá, a hned při změně během dne.",
    label: "Obsazený sál a zrušené tréninky",
    topic: "hall",
  },
  {
    description: "Když po akci zůstane sál neuklizený.",
    label: "Sál čeká na úklid",
    topic: "cleanup",
  },
];

// Why notifications cannot be switched on here (null = they can).
type Blocker = "checking" | "ios-install" | "unsupported" | "server" | "no-worker" | null;

// Turns push notifications on/off for this device and picks the topics.
export function PushSettings() {
  const { isInstalled, platform } = useInstallApp();
  const [blocker, setBlocker] = useState<Blocker>("checking");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [topics, setTopics] = useState<Topic[]>(["hall", "cleanup"]);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function load() {
      const supportsPush =
        "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

      if (!supportsPush) {
        // iPhone/iPad support notifications only in the installed app.
        const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
          (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);

        return isIos ? "ios-install" : "unsupported";
      }

      const { publicKey: key } = (await fetch("/api/push").then((response) => response.json())) as {
        publicKey: string | null;
      };

      if (!key) {
        return "server";
      }

      // On the very first visit the worker registers only after the page
      // loads; give it a moment before giving up.
      const registration =
        (await navigator.serviceWorker.getRegistration()) ??
        (await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
        ]));

      if (!registration) {
        return "no-worker";
      }

      const current = await registration.pushManager.getSubscription();

      if (isCancelled) {
        return null;
      }

      setPublicKey(key);
      setPermission(Notification.permission);
      setSubscription(current);

      if (current) {
        const status = (await fetch("/api/push/status", {
          body: JSON.stringify({ endpoint: current.endpoint }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }).then((response) => response.json())) as { subscribed?: boolean; topics?: Topic[] };

        if (!isCancelled && status.subscribed && status.topics?.length) {
          setIsSubscribed(true);
          setTopics(status.topics);
        }
      }

      return null;
    }

    load()
      .then((result) => {
        if (!isCancelled) {
          setBlocker(result);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setBlocker("unsupported");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isInstalled]);

  async function save(nextTopics: Topic[], current: PushSubscription) {
    const response = await fetch("/api/push", {
      body: JSON.stringify({ subscription: current.toJSON(), topics: nextTopics }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const data = (await response.json().catch(() => ({}))) as { message?: string };

    if (!response.ok) {
      throw new Error(data.message ?? "Nastavení se nepodařilo uložit.");
    }
  }

  async function enable() {
    if (!publicKey) {
      return;
    }

    setIsBusy(true);
    setMessage(null);

    try {
      const result = await Notification.requestPermission();

      setPermission(result);

      if (result !== "granted") {
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const current =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          applicationServerKey: base64UrlToBytes(publicKey),
          userVisibleOnly: true,
        }));
      const chosen = topics.length > 0 ? topics : (["hall"] as Topic[]);

      await save(chosen, current);
      setSubscription(current);
      setTopics(chosen);
      setIsSubscribed(true);
      setMessage({ text: "Upozornění jsou zapnutá.", tone: "success" });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Upozornění se nepodařilo zapnout.",
        tone: "error",
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function disable() {
    if (!subscription) {
      return;
    }

    setIsBusy(true);
    setMessage(null);

    try {
      await fetch("/api/push", {
        body: JSON.stringify({ endpoint: subscription.endpoint }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      });
      await subscription.unsubscribe();
      setSubscription(null);
      setIsSubscribed(false);
      setMessage({ text: "Upozornění jsou vypnutá.", tone: "success" });
    } catch {
      setMessage({ text: "Upozornění se nepodařilo vypnout.", tone: "error" });
    } finally {
      setIsBusy(false);
    }
  }

  async function toggleTopic(topic: Topic) {
    const nextTopics = topics.includes(topic)
      ? topics.filter((item) => item !== topic)
      : [...topics, topic];

    setTopics(nextTopics);
    setMessage(null);

    if (!isSubscribed || !subscription) {
      return;
    }

    if (nextTopics.length === 0) {
      await disable();
      return;
    }

    try {
      await save(nextTopics, subscription);
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Nastavení se nepodařilo uložit.",
        tone: "error",
      });
    }
  }

  async function sendTest() {
    if (!subscription) {
      return;
    }

    setIsBusy(true);
    setMessage(null);

    const response = await fetch("/api/push/test", {
      body: JSON.stringify({ endpoint: subscription.endpoint }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).catch(() => null);
    const data = (await response?.json().catch(() => ({}))) as { message?: string } | undefined;

    setIsBusy(false);
    setMessage(
      response?.ok
        ? { text: "Zkušební upozornění je na cestě.", tone: "success" }
        : { text: data?.message ?? "Upozornění se nepodařilo odeslat.", tone: "error" },
    );
  }

  return (
    <section className="scroll-mt-24 rounded-xl border border-line bg-surface p-5" id="upozorneni">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-accent">
          <Bell size={20} />
        </span>
        <div className="min-w-0">
          <p className={eyebrow}>Upozornění</p>
          <h2 className="mt-0.5 text-lg font-black">Dejte mi vědět, když je sál obsazený</h2>
        </div>
      </div>

      {blocker === "checking" ? (
        <p className="mt-4 text-sm text-ink-muted">Zjišťuji, co toto zařízení umí…</p>
      ) : blocker ? (
        <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${noticeTone.info}`}>
          {blockerText(blocker, platform === "ios" && !isInstalled)}
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-2">
            {topicOptions.map((option) => (
              <label
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-subtle p-3"
                key={option.topic}
              >
                <input
                  checked={topics.includes(option.topic)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--k-accent)]"
                  disabled={isBusy}
                  onChange={() => void toggleTopic(option.topic)}
                  type="checkbox"
                />
                <span>
                  <span className="block text-sm font-semibold text-ink">{option.label}</span>
                  <span className="block text-xs text-ink-muted">{option.description}</span>
                </span>
              </label>
            ))}
          </div>

          {permission === "denied" ? (
            <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${noticeTone.warning}`}>
              Upozornění máte pro tuto stránku zakázaná. Povolte je v nastavení prohlížeče (u
              adresy stránky nebo v Nastavení → Oznámení) a stránku načtěte znovu.
            </p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              {isSubscribed ? (
                <>
                  <button className={buttonSecondary} disabled={isBusy} onClick={sendTest} type="button">
                    <Send size={16} />
                    Poslat zkušební
                  </button>
                  <button className={buttonSecondary} disabled={isBusy} onClick={disable} type="button">
                    <BellOff size={16} />
                    Vypnout upozornění
                  </button>
                </>
              ) : (
                <button
                  className={buttonPrimary}
                  disabled={isBusy || topics.length === 0}
                  onClick={enable}
                  type="button"
                >
                  <Bell size={16} />
                  Zapnout upozornění
                </button>
              )}
            </div>
          )}
        </>
      )}

      {message ? (
        <p className={`mt-3 rounded-lg border px-3 py-2 text-xs font-semibold ${noticeTone[message.tone]}`}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}

function blockerText(blocker: Exclude<Blocker, "checking" | null>, isIosBrowser: boolean) {
  if (blocker === "ios-install" || (blocker === "unsupported" && isIosBrowser)) {
    return "Na iPhonu a iPadu fungují upozornění jen v nainstalované aplikaci. Přidejte si ji na plochu (návod níže), otevřete ji z plochy a upozornění zapněte tam.";
  }

  if (blocker === "server") {
    return "Upozornění zatím nejsou na serveru zapnutá.";
  }

  if (blocker === "no-worker") {
    return "Upozornění teď nejdou zapnout. Načtěte stránku znovu, případně to zkuste za chvíli.";
  }

  return "Tento prohlížeč upozornění nepodporuje. Zkuste Chrome, Edge, Firefox nebo Safari.";
}

// The server's public key in the format pushManager.subscribe() expects.
function base64UrlToBytes(value: string) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const binary = atob(padded);

  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
