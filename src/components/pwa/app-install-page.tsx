"use client";

import {
  CircleCheck,
  Download,
  EllipsisVertical,
  RefreshCw,
  Share,
  Smartphone,
  SquarePlus,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { useState, type ReactNode } from "react";
import { PushSettings } from "@/components/pwa/push-settings";
import { useInstallApp, type InstallPlatform } from "@/components/pwa/use-install-app";
import { AppHeader, type HeaderSession } from "@/components/ui/app-header";
import { eyebrow, pageContainer } from "@/components/ui/styles";
import { logoutAdmin } from "@/lib/admin-auth-client";

// /aplikace: how to get the hall calendar onto a phone as an app. The
// device's own instructions come first; a computer gets a QR code instead.
export function AppInstallPage({
  initialSession,
  qrSvg,
}: {
  initialSession: HeaderSession;
  qrSvg: string;
}) {
  const [session, setSession] = useState(initialSession);
  const { canPrompt, install, isInstalled, platform } = useInstallApp();
  const guides: Array<{ id: InstallPlatform; node: ReactNode }> = [
    { id: "ios", node: <IosGuide isCurrent={platform === "ios"} key="ios" /> },
    { id: "android", node: <AndroidGuide isCurrent={platform === "android"} key="android" /> },
  ];

  async function logout() {
    await logoutAdmin();
    setSession(null);
  }

  return (
    <div className="min-h-screen bg-page text-ink">
      <AppHeader activeTab="app" onLogout={logout} session={session} />

      <main className={`${pageContainer} py-5 lg:py-8`}>
        <div className="mx-auto grid max-w-4xl gap-5">
          <section className="bg-brand-gradient grid items-center gap-5 overflow-hidden rounded-2xl p-6 text-white sm:grid-cols-[auto_minmax(0,1fr)] sm:p-8">
            <Image
              alt="Ikona aplikace Koškovi"
              className="h-20 w-20 rounded-[20px] shadow-[0_12px_30px_-10px_rgba(0,0,0,0.6)] ring-1 ring-white/20 sm:h-24 sm:w-24 sm:rounded-[24px]"
              height={96}
              priority
              src="/icons/icon-192.png"
              width={96}
            />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-soft">
                Aplikace zdarma
              </p>
              <h1 className="mt-1 text-3xl font-black uppercase leading-none sm:text-4xl">
                Koškovi sál v mobilu
              </h1>
              <p className="mt-3 max-w-xl text-accent-soft">
                Kalendář sálu na ploše telefonu. Otevře se jedním klepnutím, bez prohlížeče
                – a bez App Store či Google Play.
              </p>
              <div className="mt-5 min-h-11">
                <HeroAction
                  canPrompt={canPrompt}
                  install={install}
                  isInstalled={isInstalled}
                  platform={platform}
                />
              </div>
            </div>
          </section>

          <ul className="grid gap-3 sm:grid-cols-3">
            <Benefit icon={Zap} title="Hned po ruce">
              Ikona na ploše vedle ostatních aplikací.
            </Benefit>
            <Benefit icon={RefreshCw} title="Vždy aktuální">
              Kalendář i aplikace se aktualizují samy.
            </Benefit>
            <Benefit icon={Smartphone} title="iPhone i Android">
              Zdarma, bez registrace a bez obchodu.
            </Benefit>
          </ul>

          <PushSettings />

          {platform === "desktop" ? <DesktopCard qrSvg={qrSvg} /> : null}

          <div className="grid items-start gap-5 md:grid-cols-2">
            {platform === "android" ? [...guides].reverse().map((guide) => guide.node) : guides.map((guide) => guide.node)}
          </div>

          <section className="rounded-xl border border-line bg-surface">
            <h2 className="border-b border-line px-5 py-3 text-lg font-black">Časté otázky</h2>
            <Faq question="Je to opravdová aplikace?">
              Je to webová aplikace (PWA). Chová se jako běžná aplikace – má vlastní ikonu a
              otevírá se přes celou obrazovku – ale nepotřebuje obchod s aplikacemi a v telefonu
              nezabírá skoro žádné místo.
            </Faq>
            <Faq question="Jak se aktualizuje?">
              Sama. Při každém otevření uvidíte aktuální kalendář i nejnovější verzi aplikace.
            </Faq>
            <Faq question="Potřebuji internet?">
              Ano, kalendář se načítá vždy čerstvý ze serveru. Bez připojení aplikace ukáže
              upozornění a po připojení se načte.
            </Faq>
            <Faq question="Jak vypnu upozornění?">
              Tady na této stránce v části Upozornění, nebo v nastavení telefonu u aplikace
              Koškovi. Na iPhonu fungují upozornění jen v aplikaci přidané na plochu.
            </Faq>
            <Faq question="Jak ji odinstaluji?">
              Podržte prst na ikoně Koškovi na ploše a zvolte Odstranit (iPhone) nebo
              Odinstalovat (Android).
            </Faq>
          </section>
        </div>
      </main>
    </div>
  );
}

function HeroAction({
  canPrompt,
  install,
  isInstalled,
  platform,
}: {
  canPrompt: boolean;
  install: () => Promise<string>;
  isInstalled: boolean;
  platform: InstallPlatform | null;
}) {
  const lightButton =
    "inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-brand shadow-[0_10px_24px_-10px_rgba(0,0,0,0.5)] transition hover:bg-accent-soft";
  const outlineButton =
    "inline-flex h-11 items-center gap-2 rounded-full border border-accent-soft/70 px-5 text-sm font-medium text-accent-soft transition hover:bg-white/10 hover:text-white";

  if (platform === null) {
    return null;
  }

  if (isInstalled) {
    return (
      <p className="inline-flex h-11 items-center gap-2 rounded-full bg-white/15 px-5 text-sm font-semibold">
        <CircleCheck size={18} />
        Aplikace je nainstalovaná
      </p>
    );
  }

  if (canPrompt) {
    return (
      <button className={lightButton} onClick={() => void install()} type="button">
        <Download size={18} />
        Nainstalovat aplikaci
      </button>
    );
  }

  if (platform === "ios") {
    return (
      <a className={lightButton} href="#iphone">
        <Download size={18} />
        Jak nainstalovat na iPhone
      </a>
    );
  }

  if (platform === "android") {
    return (
      <a className={outlineButton} href="#android">
        Postup pro Android
      </a>
    );
  }

  return (
    <a className={outlineButton} href="#qr">
      Naskenujte QR kód telefonem
    </a>
  );
}

function Benefit({
  children,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <li className="flex gap-3 rounded-xl border border-line bg-surface p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-accent">
        <Icon size={18} />
      </span>
      <div>
        <p className="text-sm font-black">{title}</p>
        <p className="mt-0.5 text-sm text-ink-muted">{children}</p>
      </div>
    </li>
  );
}

function DesktopCard({ qrSvg }: { qrSvg: string }) {
  return (
    <section
      className="grid scroll-mt-24 items-center gap-5 rounded-xl border border-line bg-surface p-5 sm:grid-cols-[auto_minmax(0,1fr)]"
      id="qr"
    >
      {/* Always on white, so phones can read it in dark mode too. */}
      <div
        aria-label="QR kód s odkazem na tuto stránku"
        className="h-40 w-40 rounded-xl bg-white p-2 ring-1 ring-line [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: qrSvg }}
        role="img"
      />
      <div>
        <p className={eyebrow}>Jste na počítači</p>
        <h2 className="mt-1 text-xl font-black">Namiřte na kód fotoaparát telefonu</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Otevře se tato stránka v telefonu a tam aplikaci nainstalujete podle návodu níže.
          Na počítači ji lze v Chrome nebo Edge nainstalovat ikonou instalace v adresním řádku.
        </p>
      </div>
    </section>
  );
}

function IosGuide({ isCurrent }: { isCurrent: boolean }) {
  return (
    <Guide id="iphone" isCurrent={isCurrent} title="iPhone a iPad">
      <Step number={1}>
        Otevřete tuto stránku v prohlížeči <strong>Safari</strong>.
      </Step>
      <Step number={2}>
        Klepněte na <strong>Sdílet</strong> <InlineIcon icon={Share} /> – na iPhonu dole
        uprostřed, na iPadu nahoře vpravo.
      </Step>
      <Step number={3}>
        Sjeďte níž a vyberte <strong>Přidat na plochu</strong> <InlineIcon icon={SquarePlus} />.
      </Step>
      <Step number={4}>
        Potvrďte vpravo nahoře <strong>Přidat</strong>. Ikona Koškovi se objeví na ploše.
      </Step>
    </Guide>
  );
}

function AndroidGuide({ isCurrent }: { isCurrent: boolean }) {
  return (
    <Guide id="android" isCurrent={isCurrent} title="Android">
      <Step number={1}>
        Otevřete tuto stránku v prohlížeči <strong>Chrome</strong>.
      </Step>
      <Step number={2}>
        Klepněte nahoře na <strong>Nainstalovat aplikaci</strong>, nebo otevřete menu{" "}
        <InlineIcon icon={EllipsisVertical} /> a zvolte <strong>Instalovat aplikaci</strong>{" "}
        (někde <strong>Přidat na plochu</strong>).
      </Step>
      <Step number={3}>
        Potvrďte <strong>Instalovat</strong>. Aplikaci najdete na ploše i mezi ostatními
        aplikacemi.
      </Step>
    </Guide>
  );
}

function Guide({
  children,
  id,
  isCurrent,
  title,
}: {
  children: ReactNode;
  id: string;
  isCurrent: boolean;
  title: string;
}) {
  return (
    <section
      className={`scroll-mt-24 rounded-xl border bg-surface p-5 ${
        isCurrent ? "border-accent ring-1 ring-accent" : "border-line"
      }`}
      id={id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-black">{title}</h2>
        {isCurrent ? (
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-white">
            Vaše zařízení
          </span>
        ) : null}
      </div>
      <ol className="mt-4 grid gap-3">{children}</ol>
    </section>
  );
}

function Step({ children, number }: { children: ReactNode; number: number }) {
  return (
    <li className="flex gap-3 text-sm leading-relaxed text-ink-muted [&_strong]:text-ink">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-black text-accent">
        {number}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

function InlineIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-subtle align-middle text-accent">
      <Icon aria-hidden="true" size={14} />
    </span>
  );
}

function Faq({ children, question }: { children: ReactNode; question: string }) {
  return (
    <details className="group border-b border-line last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        {question}
        <span className="text-ink-soft transition group-open:rotate-45">+</span>
      </summary>
      <p className="px-5 pb-4 text-sm text-ink-muted">{children}</p>
    </details>
  );
}
