import { isPushConfigured } from "@/lib/push";
import { runPushChecks } from "@/lib/push-notifications";
import { getRelayUrl } from "@/lib/push-relay";

// Push notification check (morning summary, changes to today, pending
// cleanup, reminders of own lessons) every minute, so the VPS needs no extra
// cron job. Does nothing without VAPID keys or the relay. Loaded from
// instrumentation.ts on the Node.js server.
if (isPushConfigured() || getRelayUrl()) {
  setTimeout(() => void runPushChecks(), 15_000);
  setInterval(() => void runPushChecks(), 60_000);
}
