// Builds the apps' site (app.tkkoskovi.cz, served by the relay on the NAS) so
// it looks like the web: the same header with its tabs and phone dropdown,
// the web's CSS (Tailwind from src/app/globals.css) and font.
//
//   npx tsx scripts/build-app-site.mts
//
// Page contents are in nas/push-relay/site-src/*.html (first lines:
// <!-- title: … --> and optionally <!-- tab: app -->); icons are written as
// <i data-icon="Download" data-size="18"></i> (lucide). The result goes to
// nas/push-relay/site/. Run again after changing the header or the pages,
// then point nas/push-relay/compose.yaml at the new commit.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import tailwind from "@tailwindcss/postcss";
import * as icons from "lucide-react";
import postcss from "postcss";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = process.cwd();
const source = path.join(root, "nas/push-relay/site-src");
const out = path.join(root, "nas/push-relay/site");
const web = "https://sal.tkkoskovi.cz";

// As pageContainer in src/components/ui/styles.ts.
const pageContainer =
  "mx-auto w-full max-w-[1600px] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] lg:pl-[max(1.5rem,env(safe-area-inset-left))] lg:pr-[max(1.5rem,env(safe-area-inset-right))]";

function icon(name: string, size = 16, className = "") {
  const component = (icons as unknown as Record<string, ComponentType<{ className?: string; size?: number }>>)[name];

  if (!component) {
    throw new Error(`Neznámá ikona ${name}`);
  }

  return renderToStaticMarkup(createElement(component, { className: className || undefined, size }));
}

// As AppHeader's tabClass.
const tabClass = (isActive: boolean) =>
  `inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition ${
    isActive ? "bg-white/15 text-white" : "text-header-ink hover:bg-white/10 hover:text-white"
  }`;

type Tab = "app" | "none";

function header(tab: Tab) {
  const sections = [
    { href: `${web}/`, icon: "CalendarDays", label: "Kalendář sálu", short: "Kalendář sálu" },
    { href: `${web}/lekce`, icon: "GraduationCap", label: "Lekce", short: "Lekce", show: "data-signed-in hidden" },
    { href: `${web}/rozpis`, icon: "ClipboardList", label: "Externí trenér", short: "Externí trenér" },
    { active: tab === "app", href: "/", icon: "Smartphone", label: "Aplikace do telefonu", short: "Aplikace" },
    { href: `${web}/admin`, icon: "LayoutDashboard", label: "Správa", short: "Správa", show: "data-manager hidden" },
  ];
  const current = sections.find((item) => item.active);
  const menuItem =
    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-ink transition hover:bg-subtle";
  const themeIcons = `<span data-moon>${icon("Moon", 18)}</span><span data-sun hidden>${icon("Sun", 18)}</span>`;

  return `<header class="app-header bg-brand-gradient sticky top-0 z-40 border-b border-black/10 bg-header pt-[var(--app-safe-top)] text-white">
  <div class="${pageContainer} flex h-14 items-center gap-1.5 sm:gap-3">
    <a class="flex shrink-0 items-center" href="${web}/">
      <img alt="Koškovi" class="h-6 w-auto sm:hidden" height="62" src="/brand/znak-white.svg" width="71">
      <img alt="Koškovi" class="h-auto w-32 max-sm:hidden" height="62" src="/brand/zaklad-white.svg" width="369">
    </a>
    <div class="relative min-w-0 ml-1 sm:hidden" data-menu>
      <button aria-expanded="false" aria-haspopup="menu" class="inline-flex h-9 max-w-full items-center gap-1.5 rounded-full bg-white/10 pl-3.5 pr-2.5 text-sm font-semibold text-white transition hover:bg-white/15" data-menu-button type="button">
        ${current ? icon(current.icon, 17, "shrink-0 text-accent-soft") : ""}
        <span class="truncate">${current?.label ?? "Menu"}</span>
        <span class="shrink-0 transition opacity-80" data-chevron>${icon("ChevronDown", 16)}</span>
      </button>
      <div class="absolute left-0 z-50 mt-1.5 rounded-xl border border-line bg-surface p-1.5 text-ink shadow-xl w-60" data-menu-panel hidden role="menu">
        ${sections
          .map(
            (item) => `<a ${item.active ? 'aria-current="page" ' : ""}class="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-sm transition hover:bg-subtle ${
              item.active ? "font-semibold text-ink" : "text-ink-muted hover:text-ink"
            }" href="${item.href}" role="menuitem" ${item.show ?? ""}>
          ${icon(item.icon, 16, "shrink-0")}
          <span class="min-w-0 flex-1 truncate">${item.label}</span>
          ${item.active ? icon("Check", 16, "shrink-0 text-accent") : ""}
        </a>`,
          )
          .join("\n        ")}
      </div>
    </div>
    <nav class="ml-2 flex min-w-0 items-center gap-1 max-sm:hidden">
      ${sections
        .map((item) => `<a class="${tabClass(Boolean(item.active))}" href="${item.href}" ${item.show ?? ""}>${item.short}</a>`)
        .join("\n      ")}
    </nav>
    <div class="ml-auto flex items-center gap-1">
      <a aria-label="Upozornění" class="hidden h-9 w-9 items-center justify-center rounded-full text-header-ink transition hover:bg-white/10 hover:text-white sm:inline-flex" href="${web}/aplikace#upozorneni" title="Upozornění">
        ${icon("Bell", 18)}
      </a>
      <span data-theme-wrap>
        <button aria-label="Přepnout na tmavý režim" class="inline-flex h-9 w-9 items-center justify-center rounded-full text-header-ink transition hover:bg-white/10 hover:text-white" data-theme-toggle title="Tmavý režim" type="button">${themeIcons}</button>
      </span>
      <a class="inline-flex h-9 items-center gap-2 rounded-full border border-accent-soft/70 px-3.5 text-sm font-medium text-accent-soft transition hover:bg-white/10 hover:text-white" data-signed-out href="${web}/profil">
        ${icon("LogIn", 16)}
        <span class="hidden sm:inline">Přihlásit</span>
      </a>
      <div class="relative" data-menu data-signed-in hidden>
        <button aria-expanded="false" class="inline-flex h-9 items-center gap-2 rounded-md px-1 text-sm font-semibold text-white sm:px-2 transition hover:bg-white/10" data-menu-button type="button">
          <span class="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-xs uppercase" data-user-initial></span>
          <span class="hidden max-w-36 truncate capitalize sm:inline" data-user-name></span>
          <span class="max-sm:hidden" data-chevron>${icon("ChevronDown", 15)}</span>
        </button>
        <div class="absolute right-0 top-11 z-50 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-xl" data-menu-panel hidden>
          <p class="px-3 pb-1.5 pt-1 text-xs text-ink-soft" data-user-role></p>
          <a class="${menuItem}" href="${web}/profil">${icon("UserRound", 16)}Můj profil</a>
          <a class="${menuItem}" data-manager hidden href="${web}/admin">${icon("LayoutDashboard", 16)}Správa</a>
          <a class="${menuItem}" data-admin hidden href="${web}/admin/users">${icon("Users", 16)}Uživatelé</a>
          <div class="sm:hidden">
            <button class="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-ink transition hover:bg-subtle" data-theme-toggle type="button"><span data-moon>${icon("Moon", 16)}</span><span data-sun hidden>${icon("Sun", 16)}</span><span data-theme-label>Tmavý režim</span></button>
          </div>
          <div class="my-1 border-t border-line"></div>
          <button class="${menuItem} text-busy-ink" data-logout type="button">${icon("LogOut", 16)}Odhlásit</button>
        </div>
      </div>
    </div>
  </div>
</header>`;
}

// As the web's own script in src/app/layout.tsx: the saved theme, else dark
// in the evening.
const themeScript = `try{var s=localStorage.getItem("koskovi-theme");var h=Number(new Intl.DateTimeFormat("cs-CZ",{hour:"numeric",hour12:false,timeZone:"Europe/Prague"}).formatToParts(new Date()).find(function(p){return p.type==="hour"}).value||"12");var d=s?s==="dark":h<6||h>=17;document.documentElement.classList.toggle("dark",d);document.documentElement.dataset.theme=d?"dark":"light"}catch(_){}`;

function page(file: string) {
  const raw = readFileSync(path.join(source, file), "utf8");
  const title = /<!-- title: (.*?) -->/.exec(raw)?.[1] ?? "Koškovi";
  const tab = (/<!-- tab: (\w+) -->/.exec(raw)?.[1] ?? "none") as Tab;
  const body = raw
    .replace(/<!--[^]*?-->\n?/g, "")
    .replace(/<i data-icon="(\w+)"(?: data-size="(\d+)")?><\/i>/g, (_, name: string, size?: string) =>
      icon(name, size ? Number(size) : 16),
    );

  return `<!doctype html>
<!-- Generated by scripts/build-app-site.mts from nas/push-relay/site-src/${file}; do not edit. -->
<html class="h-full antialiased" lang="cs">
<head>
<meta charset="utf-8">
<meta content="width=device-width, initial-scale=1, viewport-fit=cover" name="viewport">
<meta content="#003758" name="theme-color">
<title>${title}</title>
<meta content="Aplikace TK Koškovi: kalendář tanečního sálu, lekce u trenérů a rozpis externích trenérů. Pro iPhone a Android." name="description">
<link href="/icon.png" rel="icon">
<link href="/icon.png" rel="apple-touch-icon">
<link href="/web.css" rel="stylesheet">
<script>${themeScript}</script>
<script defer src="/app.js"></script>
</head>
<body class="min-h-full flex flex-col">
<div class="min-h-screen bg-page text-ink">
${header(tab)}
<main class="${pageContainer} py-5 lg:py-8">
${body.trim()}
</main>
<footer class="${pageContainer} pb-8 text-center text-xs text-ink-soft">
  © 2026 Jan Košek · <a class="hover:text-ink" href="/support">Podpora</a> · <a class="hover:text-ink" href="/privacy">Ochrana soukromí</a> · <a class="hover:text-ink" href="${web}/">sal.tkkoskovi.cz</a>
</footer>
</div>
</body>
</html>
`;
}

// Long texts (privacy, support) in the web's look.
const docCss = `
:root { --font-firma: "BR Firma"; }
${[
  ["regular", 400],
  ["medium", 500],
  ["semibold", 600],
  ["bold", 700],
  ["black", 900],
]
  .map(
    ([name, weight]) =>
      `@font-face { font-family: "BR Firma"; src: url(/fonts/br-firma-${name}.woff2) format("woff2"); font-weight: ${weight}; font-style: normal; font-display: swap; }`,
  )
  .join("\n")}
.doc { max-width: 56rem; margin-inline: auto; display: grid; gap: 1.25rem; }
.doc .hero h1 { font-size: 1.875rem; font-weight: 900; line-height: 1.1; }
.doc .hero p { margin-top: 0.5rem; color: var(--k-ink-muted); }
.doc section { border: 1px solid var(--k-line); background: var(--k-surface); border-radius: 0.75rem; padding: 1.25rem; }
.doc h2 { font-size: 1.125rem; font-weight: 900; margin-bottom: 0.5rem; }
.doc h3 { font-size: 0.9375rem; font-weight: 700; margin-top: 1rem; }
.doc p, .doc li { font-size: 0.875rem; line-height: 1.6; color: var(--k-ink-muted); }
.doc p + p, .doc h3 + p, .doc h3 + ul { margin-top: 0.25rem; }
.doc ul { list-style: disc; padding-left: 1.25rem; margin-top: 0.5rem; }
.doc a { color: var(--k-accent); font-weight: 600; }
.doc strong { color: var(--k-ink); }
.doc code { font-size: 0.8125rem; background: var(--k-subtle); border-radius: 0.25rem; padding: 0 0.25rem; }
.doc .btn { display: inline-flex; height: 2.75rem; align-items: center; margin-top: 0.75rem; border-radius: 9999px; padding: 0 1.25rem; background: var(--k-accent); color: #fff; font-size: 0.875rem; font-weight: 600; }
.doc .muted { margin-top: 0.5rem; font-size: 0.8125rem; color: var(--k-ink-soft); }
.doc table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; font-size: 0.875rem; }
.doc th, .doc td { border-top: 1px solid var(--k-line); padding: 0.375rem 0.5rem 0.375rem 0; text-align: left; vertical-align: top; color: var(--k-ink-muted); }
`;

mkdirSync(path.join(out, "fonts"), { recursive: true });
mkdirSync(path.join(out, "brand"), { recursive: true });

for (const file of readdirSync(source).filter((name) => name.endsWith(".html"))) {
  writeFileSync(path.join(out, file), page(file));
}

for (const name of ["regular", "medium", "semibold", "bold", "black"]) {
  copyFileSync(path.join(root, `src/app/fonts/br-firma-${name}.woff2`), path.join(out, `fonts/br-firma-${name}.woff2`));
}

copyFileSync(path.join(root, "public/brand/Koskovi_logo_znak_white.svg"), path.join(out, "brand/znak-white.svg"));
copyFileSync(path.join(root, "public/brand/Koskovi_logo_zaklad_white.svg"), path.join(out, "brand/zaklad-white.svg"));

// The web's CSS; Tailwind finds the classes in the whole repository, the
// generated pages included.
const globals = path.join(root, "src/app/globals.css");
const css = await postcss([tailwind({ optimize: { minify: true } })]).process(readFileSync(globals, "utf8"), {
  from: globals,
});
writeFileSync(path.join(out, "web.css"), css.css + docCss);

console.log(`Hotovo: ${readdirSync(out).join(", ")}`);
