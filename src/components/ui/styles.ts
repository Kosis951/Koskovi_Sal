// Shared class names for the redesigned screens. They use the colour tokens
// from globals.css, so light and dark mode need no extra overrides.

export const pageContainer = "mx-auto w-full max-w-[1600px] px-4 lg:px-6";

export const buttonPrimary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-on-brand transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60";

export const buttonSecondary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line-strong bg-surface px-4 text-sm font-semibold text-ink transition hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-60";

export const buttonGhost =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-ink-muted transition hover:bg-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-60";

export const buttonDanger =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-busy-line bg-busy px-4 text-sm font-semibold text-busy-ink transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60";

export const card = "rounded-xl border border-line bg-surface";

export const sectionTitle = "text-lg font-semibold text-ink";

export const mutedText = "text-sm text-ink-muted";

export function chipClass(isActive: boolean) {
  return `inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-semibold transition ${
    isActive
      ? "border-brand bg-brand text-on-brand"
      : "border-line-strong bg-surface text-ink-muted hover:border-brand hover:text-ink"
  }`;
}

export const noticeTone = {
  error: "border-busy-line bg-busy text-busy-ink",
  info: "border-training-line bg-training text-training-ink",
  success: "border-free-line bg-free text-free-ink",
  warning: "border-cleanup-line bg-cleanup text-cleanup-ink",
};
