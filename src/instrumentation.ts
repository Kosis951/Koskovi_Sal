// Runs once when the Next.js server starts. Starts the push notification
// check (morning summary, changes to today, pending cleanup) every minute,
// so the VPS needs no extra cron job. Does nothing without VAPID keys.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { isPushConfigured } = await import("@/lib/push");

  if (!isPushConfigured()) {
    return;
  }

  const { runPushChecks } = await import("@/lib/push-notifications");

  setTimeout(() => void runPushChecks(), 15_000);
  setInterval(() => void runPushChecks(), 60_000);
}
