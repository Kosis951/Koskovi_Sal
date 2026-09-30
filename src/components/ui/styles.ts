// Shared class names for the redesigned screens. They use the colour tokens
// from globals.css, so light and dark mode need no extra overrides.

export const pageContainer = "mx-auto w-full max-w-[1600px] px-4 lg:px-6";

// Pill buttons as on tkkoskovi.cz: the main action in bright blue.
export const buttonPrimary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-white shadow-[0_6px_16px_-6px_var(--k-accent)] transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none";

export const buttonSecondary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-5 text-sm font-semibold text-ink transition hover:border-accent hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-60";

export const buttonGhost =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold text-ink-muted transition hover:bg-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-60";

export const buttonDanger =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-busy-line bg-busy px-5 text-sm font-semibold text-busy-ink transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60";

export const card = "rounded-xl border border-line bg-surface";

// Headings use BR Firma Black like the club website.
export const sectionTitle = "text-lg font-black text-ink";

// Small uppercase label above a heading ("Taneční klub · od roku 1992").
export const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.14em] text-accent";

export const mutedText = "text-sm text-ink-muted";

export function chipClass(isActive: boolean) {
  return `inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-semibold transition ${
    isActive
      ? "border-accent bg-accent text-white"
      : "border-line-strong bg-surface text-ink-muted hover:border-accent hover:text-ink"
  }`;
}

export const noticeTone = {
  error: "border-busy-line bg-busy text-busy-ink",
  info: "border-training-line bg-training text-training-ink",
  success: "border-free-line bg-free text-free-ink",
  warning: "border-cleanup-line bg-cleanup text-cleanup-ink",
};
